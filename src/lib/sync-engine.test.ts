import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncEngine, type Transport } from './sync-engine';
import type { BootstrapResponse, Location, StoredRecord } from './domain/types';

type Persisted = Parameters<ConstructorParameters<typeof SyncEngine>[0]>[0];
type Job = Parameters<Transport>[0];
const id = '9db095ee-8a3f-4c75-b44e-bfb3aeb320ee';
const user = { id: 'owner', email: 'owner@example.test' };
const engines: SyncEngine[] = [];
function bootstrap(records: StoredRecord[] = []): BootstrapResponse { return { user, records }; }
function location(name: string) { return { id, name }; }
function record(name: string, version: number): StoredRecord { return { collection: 'locations', id, data: location(name), version, updatedAt: '2026-10-16T12:00:00Z' }; }
function success(job: Job) { return { ok: true, status: 200, record: { collection: job.collection, id: job.id, data: job.data ?? location('Deleted'), deleted: job.data === null, version: job.expectedVersion + 1, updatedAt: '2026-10-16T12:00:00Z' } as StoredRecord }; }
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
function engine(persist: (value: Persisted) => void, transport: Transport) {
  const value = new SyncEngine(persist, transport);
  engines.push(value);
  return value;
}
/** The version the next edit will be based on: what the engine believes the server holds. */
function nextVersion(value: SyncEngine, disk: () => Persisted) { value.upsert('locations', location('Probe')); return disk().queue.at(-1)!.expectedVersion; }
beforeEach(() => vi.useFakeTimers());
afterEach(() => { for (const value of engines.splice(0)) value.stop(); vi.useRealTimers(); });

describe('durable inline autosave', () => {
  it('updates the visible draft immediately and coalesces typing before the first request', async () => {
    let disk!: Persisted;
    const transport = vi.fn<Transport>(async job => success(job));
    const current = engine(value => { disk = structuredClone(value); }, transport);
    current.bootstrap(bootstrap());
    current.upsert('locations', location('G'));
    current.upsert('locations', location('Gy'));
    current.upsert('locations', location('Gym'));
    expect(current.getSnapshot().records.locations[id].name).toBe('Gym');
    expect(disk.queue).toHaveLength(1);
    expect(disk.queue[0].data).toEqual(location('Gym'));
    expect(transport).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(current.getSnapshot().status).toBe('saved');
    expect(disk.queue).toHaveLength(0);
  });

  it('keeps newer edits visible while an older save is in flight and chains versions', async () => {
    let disk!: Persisted;
    const first = deferred<Awaited<ReturnType<Transport>>>();
    const transport = vi.fn<Transport>().mockImplementationOnce(() => first.promise).mockImplementation(async job => success(job));
    const current = engine(value => { disk = structuredClone(value); }, transport);
    current.bootstrap(bootstrap());
    current.upsert('locations', location('Old draft'));
    const flushing = current.flush();
    const firstJob = transport.mock.calls[0][0];
    current.upsert('locations', location('New draft'));
    current.upsert('locations', location('Newest draft'));
    expect(disk.queue).toHaveLength(2);
    expect(disk.queue[0].attempted).toBe(true);
    expect(current.getSnapshot().records.locations[id].name).toBe('Newest draft');
    first.resolve(success(firstJob));
    await flushing;
    expect(transport.mock.calls.map(([job]) => job.expectedVersion)).toEqual([0, 1]);
    expect(transport.mock.calls[1][0].data).toEqual(location('Newest draft'));
    expect(current.getSnapshot().records.locations[id].name).toBe('Newest draft');
    expect(current.getSnapshot().pendingCount).toBe(0);
    expect(nextVersion(current, () => disk)).toBe(2);
  });

  it('recovers an unattempted draft after reload, without needing its debounce timer to fire', async () => {
    let disk!: Persisted;
    const first = engine(value => { disk = structuredClone(value); }, async job => success(job));
    first.bootstrap(bootstrap());
    first.upsert('locations', location('Persist before putting phone down'));
    first.stop();
    const transport = vi.fn<Transport>(async job => success(job));
    const reloaded = engine(value => { disk = structuredClone(value); }, transport);
    reloaded.hydrate(structuredClone(disk));
    expect(reloaded.getSnapshot().records.locations[id].name).toBe('Persist before putting phone down');
    reloaded.bootstrap(bootstrap());
    await vi.waitFor(() => expect(reloaded.getSnapshot().pendingCount).toBe(0));
    expect(transport).toHaveBeenCalledTimes(1);
    expect(reloaded.getSnapshot().status).toBe('saved');
  });

  it('reuses the mutation id after a committed request loses its response and the page reloads', async () => {
    let disk!: Persisted;
    let committed!: StoredRecord;
    const seen = new Map<string, StoredRecord>();
    const firstTransport = vi.fn<Transport>(async job => {
      committed = success(job).record;
      seen.set(job.mutationId, committed);
      throw new Error('Response lost after commit');
    });
    const first = engine(value => { disk = structuredClone(value); }, firstTransport);
    first.bootstrap(bootstrap()); first.upsert('locations', location('Home gym'));
    await first.flush();
    expect(first.getSnapshot().status).toBe('offline');
    const mutationId = disk.queue[0].mutationId;
    first.stop();
    const replay = vi.fn<Transport>(async job => ({ ok: true, status: 200, record: seen.get(job.mutationId) }));
    const reloaded = engine(value => { disk = structuredClone(value); }, replay);
    reloaded.hydrate(structuredClone(disk)); reloaded.bootstrap(bootstrap([committed]));
    await vi.waitFor(() => expect(reloaded.getSnapshot().pendingCount).toBe(0));
    expect(replay.mock.calls[0][0].mutationId).toBe(mutationId);
    expect(seen.size).toBe(1);
    expect(nextVersion(reloaded, () => disk)).toBe(1);
  });

  it('resolves a conflict using the newest local edit, not the stale first attempt', async () => {
    let disk!: Persisted;
    const remote = record('Changed on another device', 7);
    const transport = vi.fn<Transport>().mockResolvedValueOnce({ ok: false, status: 409, current: remote }).mockImplementation(async job => success(job));
    const current = engine(value => { disk = structuredClone(value); }, transport);
    current.bootstrap(bootstrap([record('Original', 1)]));
    current.upsert('locations', location('First local edit')); await current.flush();
    expect(current.getSnapshot().status).toBe('conflict');
    const originalMutation = disk.queue[0].mutationId;
    current.upsert('locations', location('Latest local edit'));
    current.resolveConflict('local');
    await vi.waitFor(() => expect(current.getSnapshot().pendingCount).toBe(0));
    expect(transport.mock.calls[1][0].data).toEqual(location('Latest local edit'));
    expect(transport.mock.calls[1][0].expectedVersion).toBe(7);
    expect(transport.mock.calls[1][0].mutationId).not.toBe(originalMutation);
    expect(current.getSnapshot().records.locations[id].name).toBe('Latest local edit');
  });

  it('does not let an old engine overwrite a new local draft when its response arrives after stop', async () => {
    let disk!: Persisted;
    const response = deferred<Awaited<ReturnType<Transport>>>();
    const transport = vi.fn<Transport>(() => response.promise);
    const old = engine(value => { disk = structuredClone(value); }, transport);
    old.bootstrap(bootstrap()); old.upsert('locations', location('Old page draft'));
    const oldFlush = old.flush(); const job = transport.mock.calls[0][0];
    old.stop();
    const next = engine(value => { disk = structuredClone(value); }, async pending => success(pending));
    next.hydrate(structuredClone(disk)); next.upsert('locations', location('New page draft'));
    const durableNewDraft = structuredClone(disk);
    response.resolve(success(job)); await oldFlush;
    expect(disk).toEqual(durableNewDraft);
    expect(next.getSnapshot().records.locations[id].name).toBe('New page draft');
  });

  it('does not roll an acknowledged result back when an older bootstrap response arrives', async () => {
    let disk!: Persisted;
    const current = engine(value => { disk = structuredClone(value); }, async job => success(job));
    const stale = record('Before edit', 1);
    current.bootstrap(bootstrap([stale]));
    current.upsert('locations', location('Acknowledged edit')); await current.flush();
    expect(current.getSnapshot().records.locations[id].name).toBe('Acknowledged edit');
    current.bootstrap(bootstrap([stale]));
    expect(current.getSnapshot().records.locations[id].name).toBe('Acknowledged edit');
    expect(nextVersion(current, () => disk)).toBe(2);
  });

  it('does not roll back newer server state when a recovered mutation returns its older cached acknowledgement', async () => {
    let disk!: Persisted;
    const originalAcknowledgement = record('Original save whose response was lost', 1);
    const currentServer = record('Newer edit from another tab', 2);
    const transport = vi.fn<Transport>(async () => ({ ok: true, status: 200, record: originalAcknowledgement }));
    const current = engine(value => { disk = structuredClone(value); }, transport);
    current.hydrate({
      server: [],
      queue: [{ collection: 'locations', id, data: originalAcknowledgement.data, expectedVersion: 0, mutationId: 'lost-response', attempted: true }],
    });
    current.bootstrap(bootstrap([currentServer]));
    await vi.waitFor(() => expect(current.getSnapshot().pendingCount).toBe(0));
    expect(transport).toHaveBeenCalledOnce();
    expect(current.getSnapshot().records.locations[id].name).toBe('Newer edit from another tab');
    expect(current.getSnapshot().status).toBe('saved');
    expect(nextVersion(current, () => disk)).toBe(2);
  });

  it('keeps a visible local-storage failure instead of reporting Saved during bootstrap', () => {
    let full = true;
    const current = engine(() => { if (full) throw new Error('Quota exceeded'); }, async job => success(job));
    current.bootstrap(bootstrap([record('Existing location', 1)]));
    expect(current.getSnapshot().status).toBe('error');
    expect(current.getSnapshot().error).toContain('could not save your draft locally');
    full = false; current.retry();
    expect(current.getSnapshot().status).toBe('saved');
  });
});

it('lets a corrected inline draft replace a validation failure without getting the queue stuck', async () => {
  let disk!: Persisted;
  const transport=vi.fn<Transport>().mockResolvedValueOnce({ok:false,status:400,error:'Name is required'}).mockImplementation(async job=>success(job));
  const current=engine(value=>{disk=structuredClone(value);},transport);
  current.bootstrap(bootstrap());current.upsert('locations',location(''));await current.flush();
  expect(current.getSnapshot().status).toBe('error');
  current.upsert('locations',location('Corrected gym'));await current.flush();
  expect(current.getSnapshot().status).toBe('saved');expect(disk.queue).toHaveLength(0);
  expect(transport.mock.calls[1][0].expectedVersion).toBe(0);
  expect(current.getSnapshot().records.locations[id].name).toBe('Corrected gym');
});

describe('state that must never stall the queue', () => {
  const other = '1f0c7f3e-5d5a-4c1e-9a3b-2b8f0f6d9e11';

  it('drops a draft deleted before it ever reached the server, without a request', async () => {
    let disk!: Persisted;
    const transport = vi.fn<Transport>(async job => success(job));
    const current = engine(value => { disk = structuredClone(value); }, transport);
    current.bootstrap(bootstrap());
    current.upsert('locations', location('Added offline'));
    current.remove('locations', id);
    expect(disk.queue).toHaveLength(0);
    expect(current.getSnapshot().records.locations[id]).toBeUndefined();
    expect(current.getSnapshot().status).toBe('saved');
    await vi.advanceTimersByTimeAsync(400);
    expect(transport).not.toHaveBeenCalled();
  });

  it('still deletes a record whose create is already in flight', async () => {
    const first = deferred<Awaited<ReturnType<Transport>>>();
    const transport = vi.fn<Transport>().mockImplementationOnce(() => first.promise).mockImplementation(async job => success(job));
    const current = engine(() => {}, transport);
    current.bootstrap(bootstrap());
    current.upsert('locations', location('Gym'));
    const flushing = current.flush();
    current.remove('locations', id);
    first.resolve(success(transport.mock.calls[0][0]));
    await flushing;
    expect(transport.mock.calls[1][0]).toMatchObject({ data: null, expectedVersion: 1 });
    expect(current.getSnapshot().pendingCount).toBe(0);
  });

  it('treats a 404 delete left in an older journal as done and keeps syncing later edits', async () => {
    const transport = vi.fn<Transport>(async job => job.data === null ? { ok: false, status: 404, error: 'Record not found' } : success(job));
    const current = engine(() => {}, transport);
    current.hydrate({ server: [], queue: [{ collection: 'locations', id, data: null, expectedVersion: 0, mutationId: 'stuck-delete', attempted: false }] });
    current.upsert('locations', { id: other, name: 'Later edit' });
    current.bootstrap(bootstrap());
    await vi.waitFor(() => expect(current.getSnapshot().pendingCount).toBe(0));
    expect(current.getSnapshot().status).toBe('saved');
    expect(transport.mock.calls.map(([job]) => job.id)).toEqual([id, other]);
  });

  it('keeps only unsynced drafts on the device, so storage does not grow with history', () => {
    let disk!: Persisted;
    const current = engine(value => { disk = structuredClone(value); }, async job => success(job));
    current.bootstrap(bootstrap([record('Saved gym', 1)]));
    expect(disk).toEqual({ server: [], queue: [] });
    current.upsert('locations', { id: other, name: 'Draft' });
    expect(disk.server).toEqual([]);
    expect(disk.queue.map(job => job.id)).toEqual([other]);
    expect(current.getSnapshot().records.locations[id].name).toBe('Saved gym');
  });

  it('reapplies the newest draft onto a newer server copy when the rebase knows the other writer', async () => {
    const remote = record('Renamed elsewhere', 4);
    const transport = vi.fn<Transport>().mockResolvedValueOnce({ ok: false, status: 409, current: remote }).mockImplementation(async job => success(job));
    const current = new SyncEngine(() => {}, transport, (_collection, draft, server) => ({ ...(server as Location), notes: (draft as Location).notes }));
    engines.push(current);
    current.bootstrap(bootstrap([record('Original', 1)]));
    current.upsert('locations', { id, name: 'Original', notes: 'Bring chalk' });
    await current.flush();
    await vi.waitFor(() => expect(current.getSnapshot().pendingCount).toBe(0));
    expect(current.getSnapshot().status).toBe('saved');
    expect(transport.mock.calls[1][0]).toMatchObject({ expectedVersion: 4, data: { id, name: 'Renamed elsewhere', notes: 'Bring chalk' } });
  });
});
