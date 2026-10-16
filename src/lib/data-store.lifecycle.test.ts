import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncEngine, Persisted } from './sync-engine';

// Exercise the provider's real setup/cleanup closure without needing a DOM renderer.
const hooks = vi.hoisted(() => ({ effects: [] as Array<() => (() => void) | void>, states: [] as Array<{ value: unknown }> }));
vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useEffect: (effect: () => (() => void) | void) => { hooks.effects.push(effect); },
    useState: (initial: unknown) => {
      const state = { value: typeof initial === 'function' ? initial() : initial };
      hooks.states.push(state);
      return [state.value, (value: unknown) => { state.value = value; }];
    },
  };
});
import { DataProvider } from './data-store';

type RequestOptions = { signal?: AbortSignal; ifAvailable?: boolean };
type LockCallback = (lock: { name: string } | null) => unknown;
class TestLocks {
  held = new Set<string>();
  queues = new Map<string, Array<() => void>>();
  request(name: string, options: RequestOptions, callback: LockCallback): Promise<unknown> {
    if (options.signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
    if (options.ifAvailable && this.held.has(name)) return Promise.resolve().then(() => callback(null));
    return new Promise((resolve, reject) => {
      let started = false;
      const start = () => {
        if (options.signal?.aborted) return;
        started = true;
        this.held.add(name);
        Promise.resolve().then(() => callback({ name })).then(resolve, reject).finally(() => {
          this.held.delete(name);
          this.queues.get(name)?.shift()?.();
        });
      };
      options.signal?.addEventListener('abort', () => {
        if (started) return;
        this.queues.set(name, (this.queues.get(name) || []).filter(item => item !== start));
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
      if (this.held.has(name)) this.queues.set(name, [...(this.queues.get(name) || []), start]);
      else start();
    });
  }
}

function storage(): Storage {
  const value = {} as Storage;
  Object.defineProperties(value, {
    getItem: { value: (key: string) => Object.hasOwn(value, key) ? value[key] : null },
    setItem: { value: vi.fn((key: string, item: string) => { value[key] = item; }) },
    removeItem: { value: vi.fn((key: string) => { delete value[key]; }) },
    clear: { value: () => { for (const key of Object.keys(value)) delete value[key]; } },
    key: { value: (index: number) => Object.keys(value)[index] ?? null },
    length: { get: () => Object.keys(value).length },
  });
  return value;
}
const user = { id: 'owner', email: 'owner@example.test' };
const cleanups: Array<() => void> = [];
function provider() {
  const stateIndex = hooks.states.length;
  const effectIndex = hooks.effects.length;
  DataProvider({ user, onSignOut: vi.fn(), children: null });
  const effect = hooks.effects[effectIndex];
  const start = () => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); return cleanup!; };
  return {
    start,
    engine: () => hooks.states[stateIndex].value as SyncEngine | null,
    error: () => hooks.states[stateIndex + 1].value as string,
    key: `santorio:${user.id}:journal:${hooks.states[stateIndex + 2].value}`,
  };
}
function orphan(): Persisted {
  return { server: [], queue: [{ collection: 'locations', id: 'gym', data: { id: 'gym', name: 'Recover me' }, expectedVersion: 0, mutationId: 'pending-orphan', attempted: false }] };
}
let locks: TestLocks;
let disk: Storage;
beforeEach(() => {
  hooks.effects.length = 0; hooks.states.length = 0;
  locks = new TestLocks(); disk = storage();
  vi.stubGlobal('navigator', { locks });
  vi.stubGlobal('localStorage', disk);
  vi.stubGlobal('sessionStorage', storage());
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async input => {
    if (String(input) === '/api/bootstrap') return Response.json({ user, records: [] });
    return new Promise<Response>(() => {}); // Leave saves in flight until cleanup.
  }));
});
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  await vi.waitFor(() => expect(locks.held.size).toBe(0));
  vi.unstubAllGlobals();
});

describe('journal ownership lifecycle', () => {
  it('reopens the same journal after StrictMode setup and immediate cleanup', async () => {
    const current = provider();
    current.start()();
    current.start();
    await vi.waitFor(() => expect(current.engine()).not.toBeNull());
    expect(current.error()).toBe('');
    expect(locks.held.has(current.key)).toBe(true);
  });

  it('does not recover or delete another live document journal while its lock is held', async () => {
    const first = provider(); first.start();
    await vi.waitFor(() => expect(first.engine()).not.toBeNull());
    first.engine()!.upsert('locations', { id: 'gym', name: 'Live tab draft' });
    const second = provider(); second.start();
    await vi.waitFor(() => expect(second.engine()).not.toBeNull());
    expect(JSON.parse(disk.getItem(first.key)!).queue[0].data.name).toBe('Live tab draft');
    expect(second.engine()!.getSnapshot().pendingCount).toBe(0);
    expect(second.engine()!.getSnapshot().records.locations.gym).toBeUndefined();
  });

  it('copies an orphan journal durably before removing its original key', async () => {
    const oldKey = 'santorio:owner:journal:closed-document';
    disk.setItem(oldKey, JSON.stringify(orphan()));
    const current = provider(); current.start();
    await vi.waitFor(() => expect(current.engine()).not.toBeNull());
    expect(disk.getItem(oldKey)).toBeNull();
    expect(JSON.parse(disk.getItem(current.key)!).queue[0].mutationId).toBe('pending-orphan');
    expect(current.engine()!.getSnapshot().records.locations.gym.name).toBe('Recover me');
  });

  it('retains the source journal when storing its recovery copy fails', async () => {
    const oldKey = 'santorio:owner:journal:closed-document';
    const saved = JSON.stringify(orphan());
    disk.setItem(oldKey, saved);
    vi.mocked(disk.setItem).mockImplementation(() => { throw new Error('Storage full'); });
    const current = provider(); current.start();
    await vi.waitFor(() => expect(current.error()).toContain('Storage full'));
    expect(disk.getItem(oldKey)).toBe(saved);
    expect(current.engine()).toBeNull();
  });

  it('does not claim a live document journal when Web Locks are unavailable', async () => {
    vi.stubGlobal('navigator', {});
    const otherKey = 'santorio:owner:journal:other-live-document';
    const otherDraft = JSON.stringify(orphan());
    disk.setItem(otherKey, otherDraft);
    const current = provider(); current.start();
    await vi.waitFor(() => expect(current.engine()).not.toBeNull());
    expect(disk.getItem(otherKey)).toBe(otherDraft);
    expect(current.engine()!.getSnapshot().pendingCount).toBe(0);
  });

  it('recovers its own fallback session draft and gives unattempted copied drafts a fresh mutation ID', async () => {
    vi.stubGlobal('navigator', {});
    sessionStorage.setItem('santorio:owner:session-draft', JSON.stringify(orphan()));
    const current = provider(); current.start();
    await vi.waitFor(() => expect(current.engine()).not.toBeNull());
    expect(current.engine()!.getSnapshot().records.locations.gym.name).toBe('Recover me');
    const saved = JSON.parse(sessionStorage.getItem('santorio:owner:session-draft')!) as Persisted;
    expect(saved.queue[0].mutationId).not.toBe('pending-orphan');
    expect(saved.queue[0].attempted).toBe(true);
  });

  it('preserves attempted fallback mutation IDs so a lost response can be safely replayed', async () => {
    vi.stubGlobal('navigator', {});
    const saved = orphan(); saved.queue[0].attempted = true;
    sessionStorage.setItem('santorio:owner:session-draft', JSON.stringify(saved));
    const current = provider(); current.start();
    await vi.waitFor(() => expect(current.engine()).not.toBeNull());
    const restored = JSON.parse(sessionStorage.getItem('santorio:owner:session-draft')!) as Persisted;
    expect(restored.queue[0].mutationId).toBe('pending-orphan');
  });
});
