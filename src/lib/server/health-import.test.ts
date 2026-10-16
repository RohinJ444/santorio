import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
vi.mock('server-only', () => ({}));
vi.mock('./supabase', () => ({ adminClient: vi.fn(), requireOwner: vi.fn(), ownerEmail: () => 'rohin.juneja@berkeley.edu' }));
vi.mock('./health-parser', async importOriginal => ({ ...await importOriginal<typeof import('./health-parser')>(), parseHealthExport: vi.fn() }));
vi.mock('./security', async importOriginal => ({ ...await importOriginal<typeof import('./security')>(), rateLimit: vi.fn() }));
import { adminClient, requireOwner } from './supabase';
import { HealthExportError, parseHealthExport } from './health-parser';
import { hash, rateLimit } from './security';
import { authorizeHealthImport, healthAggregation, healthConnection, importHealthExport, revokeHealthConnection, rotateHealthConnection } from './health-import';
import { GET as connectionGet, POST as connectionPost, DELETE as connectionDelete } from '@/app/api/health/connection/route';
import { POST as upload } from '@/app/api/health/upload/route';
import { POST as automation } from '@/app/api/health/import/route';

const ownerId = '10000000-0000-4000-8000-000000000001';
const healthId = '20000000-0000-4000-8000-000000000001';
const token = `hae_${'a'.repeat(43)}`;
const now = '2026-10-16T12:00:00.000Z';
const counts = { days: 1, workouts: 0, measurements: 0 };
const successful = { ok: true, created: 1, updated: 0, unchanged: 0, counts, warnings: [], importedAt: now };
const metrics = { collection: 'metrics' as const, id: '2026-10-04', data: { id: '2026-10-04', date: '2026-10-04', steps: 1234, source: 'apple_health', importedAt: now } };
const query = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), maybeSingle: vi.fn() };
const rpc = vi.fn(), getUserById = vi.fn();
const db = { from: vi.fn(() => query), rpc, auth: { admin: { getUserById } } } as unknown as SupabaseClient;
const cookieRequest = (path: string, method = 'POST', body?: string) => new Request(`https://santorio.example/api/health/${path}`, { method, headers: { Origin: 'https://santorio.example', 'Content-Type': 'application/json', 'X-Santorio-Aggregation': 'days' }, body });
const bearerRequest = (body = '{}', bearer = token) => new Request('https://santorio.example/api/health/import', { method: 'POST', headers: { Authorization: `Bearer ${bearer}`, 'Automation-Aggregation': 'days' }, body });

beforeEach(() => {
  vi.useRealTimers();
  process.env.APP_URL = 'https://santorio.example';
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.is.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({ data: { owner_id: ownerId, token_hash: hash(token), created_at: now, revoked_at: null, last_imported_at: now, last_result: successful }, error: null });
  rpc.mockResolvedValue({ data: successful, error: null });
  getUserById.mockResolvedValue({ data: { user: { id: ownerId, email: 'rohin.juneja@berkeley.edu', email_confirmed_at: now, is_anonymous: false } }, error: null });
  vi.mocked(adminClient).mockReturnValue(db);
  vi.mocked(requireOwner).mockResolvedValue({ db, user: { id: ownerId, email: 'rohin.juneja@berkeley.edu' } } as Awaited<ReturnType<typeof requireOwner>>);
  vi.mocked(parseHealthExport).mockReturnValue({ records: [metrics], counts, warnings: [] });
});

describe('Health import authorization and credentials', () => {
  it('accepts only its dedicated bearer format and performs no DB lookup for malformed tokens', async () => {
    for (const header of [null, 'Basic abc', 'Bearer oauth-access-token', `Bearer ${'a'.repeat(43)}`, `Bearer ${token}, another`]) {
      const request = new Request('https://santorio.example/api/health/import', { headers: header ? { Authorization: header } : {} });
      await expect(authorizeHealthImport(request)).rejects.toMatchObject({ status: 401 });
    }
    expect(adminClient).not.toHaveBeenCalled();
  });
  it('looks up only the digest and rechecks the current owner identity', async () => {
    await expect(authorizeHealthImport(bearerRequest())).resolves.toMatchObject({ ownerId, tokenHash: hash(token) });
    expect(query.eq).toHaveBeenCalledWith('token_hash', hash(token));
    expect(query.is).toHaveBeenCalledWith('revoked_at', null);
    expect(getUserById).toHaveBeenCalledWith(ownerId);
    expect(JSON.stringify(query.eq.mock.calls)).not.toContain(token);
  });
  it('rejects unknown credentials, unconfirmed accounts, another email and anonymous identities', async () => {
    query.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(authorizeHealthImport(bearerRequest())).rejects.toMatchObject({ status: 401 });
    for (const user of [null, { email: 'rohin.juneja@berkeley.edu' }, { email: 'someone@example.com', email_confirmed_at: now }, { email: 'rohin.juneja@berkeley.edu', email_confirmed_at: now, is_anonymous: true }]) {
      getUserById.mockResolvedValueOnce({ data: { user }, error: null });
      await expect(authorizeHealthImport(bearerRequest())).rejects.toMatchObject({ status: 401 });
    }
  });
  it('rotates a random credential with only its hash passed to the transaction', async () => {
    rpc.mockResolvedValue({ data: { createdAt: now }, error: null });
    const first = await rotateHealthConnection(ownerId), second = await rotateHealthConnection(ownerId);
    expect(first.token).toMatch(/^hae_[A-Za-z0-9_-]{43}$/);
    expect(second.token).not.toBe(first.token);
    expect(rpc).toHaveBeenNthCalledWith(1, 'set_health_connection', { p_owner_id: ownerId, p_token_hash: hash(first.token) });
    expect(first.endpoint).toBe('https://santorio.example/api/health/import');
  });
  it('never returns the token or digest from connection status', async () => {
    const status = await healthConnection(ownerId);
    expect(status).toMatchObject({ connected: true, createdAt: now, lastImportedAt: now });
    expect(JSON.stringify(status)).not.toContain(hash(token));
    expect(JSON.stringify(status)).not.toContain(token);
    query.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect(await healthConnection(ownerId)).toMatchObject({ connected: false, createdAt: null, lastImportedAt: null, lastResult: null });
  });
  it('revokes with the same serialized connection RPC', async () => {
    await revokeHealthConnection(ownerId);
    expect(rpc).toHaveBeenCalledWith('set_health_connection', { p_owner_id: ownerId, p_token_hash: null });
  });
});

describe('Health import transactions', () => {
  it('passes patches, not defaults or a read-then-write snapshot, to one RPC', async () => {
    const input = { data: { metrics: [] } };
    const result = await importHealthExport(input, { db, ownerId, tokenHash: hash(token) }, 'days');
    expect(result).toEqual(successful);
    expect(parseHealthExport).toHaveBeenCalledWith(input, { aggregation: 'days', now: expect.any(String) });
    expect(rpc).toHaveBeenCalledWith('import_health_records', expect.objectContaining({ p_owner_id: ownerId, p_token_hash: hash(token), p_records: [metrics] }));
    expect(db.from).not.toHaveBeenCalled();
  });
  it('allows partial workout detail so daily re-exports cannot erase absent HR/energy fields', async () => {
    const workout = { collection: 'healthWorkouts' as const, id: healthId, data: { id: healthId, externalId: 'fixture-external-id', date: '2026-10-04', name: 'Indoor Walk', start: '2026-10-04T08:00:00-07:00', end: '2026-10-04T08:30:00-07:00', durationMinutes: 30, importedAt: now } };
    vi.mocked(parseHealthExport).mockReturnValueOnce({ records: [workout], counts: { days: 0, workouts: 1, measurements: 0 }, warnings: [] });
    await importHealthExport({}, { db, ownerId, tokenHash: null });
    expect(rpc).toHaveBeenCalledWith('import_health_records', expect.objectContaining({ p_records: [workout] }));
  });
  it('rejects parser output with an ID mismatch, water mutation, wrong source or duplicates before persisting', async () => {
    for (const records of [
      [{ ...metrics, data: { ...metrics.data, id: '2026-10-05' } }],
      [{ ...metrics, data: { ...metrics.data, waterL: 0 } }],
      [{ ...metrics, data: { ...metrics.data, source: 'manual' } }],
      [metrics, metrics],
    ]) {
      vi.mocked(parseHealthExport).mockReturnValueOnce({ records, counts, warnings: [] });
      await expect(importHealthExport({}, { db, ownerId, tokenHash: null })).rejects.toThrow();
    }
    expect(rpc).not.toHaveBeenCalled();
  });
  it('maps credential revocation inside the transaction to unauthorized rather than success', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501' } });
    await expect(importHealthExport({}, { db, ownerId, tokenHash: hash(token) })).rejects.toMatchObject({ status: 401 });
  });
  it('does not expose DB errors or submitted private data', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '23514', message: 'private payload' } });
    await expect(importHealthExport({}, { db, ownerId, tokenHash: null })).rejects.toMatchObject({ status: 503, message: 'Unable to import Health data. Your saved records have not been partially updated.' });
  });
  it('bounds ignored-metric warnings before the transaction and response', async () => {
    vi.mocked(parseHealthExport).mockReturnValueOnce({ records: [metrics], counts, warnings: Array.from({ length: 150 }, (_, index) => `Ignored metric ${index}.`) });
    rpc.mockImplementationOnce(async (_name, args) => ({ data: { ...successful, ...args.p_summary }, error: null }));
    const result = await importHealthExport({}, { db, ownerId, tokenHash: null });
    expect(result.warnings).toHaveLength(100);
    expect(result.warnings[99]).toBe('51 additional unsupported entries were ignored.');
  });
  it('reads aggregation header names case-insensitively', () => {
    expect(healthAggregation(cookieRequest('upload'))).toBe('days');
    expect(healthAggregation(bearerRequest())).toBe('days');
    expect(healthAggregation(new Request('https://santorio.example'))).toBeUndefined();
  });
});

describe('Health API routes', () => {
  it('requires the owner cookie for status and mutation endpoints', async () => {
    const { HttpError } = await import('./http');
    vi.mocked(requireOwner).mockRejectedValue(new HttpError(401, 'Sign in to continue'));
    for (const response of [await connectionGet(), await connectionPost(cookieRequest('connection')), await connectionDelete(cookieRequest('connection', 'DELETE')), await upload(cookieRequest('upload', 'POST', '{}'))]) expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('rejects cross-origin connection changes and manual uploads before checking session', async () => {
    for (const handler of [connectionPost, connectionDelete, upload]) {
      const response = await handler(new Request('https://santorio.example/api/health/upload', { method: 'POST', headers: { Origin: 'https://other.example' }, body: '{}' }));
      expect(response.status).toBe(403);
    }
    expect(requireOwner).not.toHaveBeenCalled();
  });
  it('returns a private, uncached connection status without a raw credential', async () => {
    const response = await connectionGet();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ connected: true, endpoint: 'https://santorio.example/api/health/import' });
  });
  it('allows an authenticated manual upload without creating an automation credential', async () => {
    const response = await upload(cookieRequest('upload', 'POST', '{"data":{"metrics":[]}}'));
    expect(response.status).toBe(200);
    expect(rateLimit).toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('import_health_records', expect.objectContaining({ p_owner_id: ownerId, p_token_hash: null }));
  });
  it('accepts bearer automation requests without a browser Origin or session', async () => {
    const response = await automation(bearerRequest());
    expect(response.status).toBe(200);
    expect(requireOwner).not.toHaveBeenCalled();
    expect(await response.json()).toEqual(successful);
  });
  it('rejects oversized bodies before the parser or RPC', async () => {
    const request = new Request('https://santorio.example/api/health/import', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Length': '3000001' }, body: '{}' });
    expect((await automation(request)).status).toBe(413);
    expect(parseHealthExport).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('rejects non-JSON input without returning the submitted text', async () => {
    const response = await automation(bearerRequest('my private health info'));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid JSON' });
  });
  it('returns actionable parser errors as 400 without logging or writing the health payload', async () => {
    vi.mocked(parseHealthExport).mockImplementationOnce(() => { throw new HealthExportError('Daily metrics require Days aggregation.'); });
    const response = await automation(bearerRequest());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Daily metrics require Days aggregation.' });
    expect(rpc).not.toHaveBeenCalled();
  });
  it('checks the actual exporter parser through the route, including daily aggregation', async () => {
    const actual = await vi.importActual<typeof import('./health-parser')>('./health-parser');
    vi.mocked(parseHealthExport).mockImplementation(actual.parseHealthExport);
    const body = JSON.stringify({ data: { metrics: [{ name: 'active_energy', units: 'kcal', data: [{ date: '2026-10-04 00:00:00 -0700', qty: 123.5 }] }] } });
    const noAggregation = new Request('https://santorio.example/api/health/import', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body });
    expect((await automation(noAggregation)).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
    expect((await automation(bearerRequest(body))).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('import_health_records', expect.objectContaining({ p_records: [expect.objectContaining({ collection: 'metrics', data: expect.objectContaining({ activeEnergy: 123.5, date: '2026-10-04' }) })] }));
  });
});
