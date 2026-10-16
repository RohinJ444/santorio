import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { schemas, idSchema, validateRecord } from '@/lib/domain/schema';
import { HealthExportError, parseHealthExport } from './health-parser';
import { appUrl, HttpError } from './http';
import { hash, randomToken } from './security';
import { adminClient, ownerEmail } from './supabase';

export const HEALTH_IMPORT_MAX_BYTES = 3_000_000;
export type HealthImportResult = {
  ok: true; created: number; updated: number; unchanged: number;
  counts: { days: number; workouts: number; measurements: number };
  warnings: string[]; importedAt: string;
};
type HealthAccess = { db: SupabaseClient; ownerId: string; tokenHash: string | null };
const invalidToken = () => new HttpError(401, 'A valid Health Auto Export import token is required');
const endpoint = () => `${appUrl()}/api/health/import`;

export async function healthConnection(ownerId: string) {
  const { data, error } = await adminClient().from('health_connections')
    .select('token_hash,created_at,revoked_at,last_imported_at,last_result').eq('owner_id', ownerId).maybeSingle();
  if (error) throw new HttpError(503, 'Unable to load the Health connection');
  return {
    connected: !!data?.token_hash && !data.revoked_at,
    createdAt: data?.created_at ?? null,
    lastImportedAt: data?.last_imported_at ?? null,
    lastResult: data?.last_result ?? null,
    endpoint: endpoint(),
  };
}

export async function rotateHealthConnection(ownerId: string) {
  const token = `hae_${randomToken()}`;
  const { data, error } = await adminClient().rpc('set_health_connection', { p_owner_id: ownerId, p_token_hash: hash(token) });
  if (error) throw new HttpError(error.code === '42501' ? 403 : 503, 'Unable to create the Health connection');
  return { token, endpoint: endpoint(), createdAt: data.createdAt as string };
}

export async function revokeHealthConnection(ownerId: string) {
  const { error } = await adminClient().rpc('set_health_connection', { p_owner_id: ownerId, p_token_hash: null });
  if (error) throw new HttpError(error.code === '42501' ? 403 : 503, 'Unable to revoke the Health connection');
}

export async function authorizeHealthImport(request: Request): Promise<HealthAccess> {
  const token = /^Bearer (hae_[A-Za-z0-9_-]{43})$/i.exec(request.headers.get('authorization') || '')?.[1];
  if (!token) throw invalidToken();
  const tokenHash = hash(token), db = adminClient();
  const { data, error } = await db.from('health_connections').select('owner_id')
    .eq('token_hash', tokenHash).is('revoked_at', null).maybeSingle();
  if (error) throw new HttpError(503, 'Unable to check the Health connection');
  if (!data) throw invalidToken();
  // A persisted credential never substitutes for checking the current account.
  const identity = await db.auth.admin.getUserById(data.owner_id);
  const user = identity.data?.user;
  if (identity.error || !user || user.email?.toLowerCase() !== ownerEmail() || !user.email_confirmed_at || user.is_anonymous) throw invalidToken();
  return { db, ownerId: data.owner_id, tokenHash };
}

export function healthAggregation(request: Request) {
  return request.headers.get('automation-aggregation') ?? request.headers.get('x-santorio-aggregation') ?? undefined;
}

const countsSchema = z.strictObject({ days: z.number().int().nonnegative(), workouts: z.number().int().nonnegative(), measurements: z.number().int().nonnegative() });
const resultSchema = z.strictObject({
  ok: z.literal(true), created: z.number().int().nonnegative(), updated: z.number().int().nonnegative(), unchanged: z.number().int().nonnegative(),
  counts: countsSchema, warnings: z.array(z.string().max(500)).max(100), importedAt: z.iso.datetime({ offset: true }),
});

export async function importHealthExport(input: unknown, access: HealthAccess, aggregation?: string): Promise<HealthImportResult> {
  const importedAt = new Date().toISOString();
  let parsed: ReturnType<typeof parseHealthExport>;
  try { parsed = parseHealthExport(input, { aggregation, now: importedAt }); }
  catch (error) {
    if (error instanceof HealthExportError) throw new HttpError(400, error.message);
    throw error;
  }
  if (parsed.records.length > 2000) throw new HttpError(413, 'Import a smaller date range (at most 2,000 records per upload)');
  const seen = new Set<string>();
  const records = parsed.records.map(record => {
    idSchema.parse(record.id);
    const key = `${record.collection}:${record.id}`;
    if (seen.has(key)) throw new HttpError(400, 'The export contains conflicting duplicate records');
    seen.add(key);
    let data: Record<string, unknown>;
    if (record.collection === 'metrics') {
      // Validate only the patch: absent metrics must stay absent until SQL merges
      // it with the latest record under the same lock used by app edits.
      data = schemas.metrics.partial().required({ id: true, date: true, source: true, importedAt: true }).parse(record.data);
      if ('waterL' in data || data.id !== data.date || data.source !== 'apple_health') throw new HttpError(400, 'Invalid Health metrics patch');
    } else if (record.collection === 'healthWorkouts') {
      data = schemas.healthWorkouts.partial().required({ id: true, externalId: true, date: true, name: true, start: true, end: true, durationMinutes: true, importedAt: true }).parse(record.data);
    } else if (record.collection === 'measurements') {
      data = validateRecord('measurements', record.data);
      if (data.source !== 'apple_health') throw new HttpError(400, 'Invalid Health measurement');
    } else throw new HttpError(400, 'Unsupported Health record');
    if (data.id !== record.id) throw new HttpError(400, 'Health record ID does not match its data');
    if (Buffer.byteLength(JSON.stringify(data), 'utf8') > 1_000_000) throw new HttpError(413, 'One workout is too large; export fewer workout metrics');
    return { collection: record.collection, id: record.id, data };
  });
  const warnings = parsed.warnings.length <= 100 ? parsed.warnings : [
    ...parsed.warnings.slice(0, 99), `${parsed.warnings.length - 99} additional unsupported entries were ignored.`,
  ];
  // Check the bounded receipt before writing: a valid import must never commit
  // and then fail solely because the response had too many ignored-metric notes.
  const summary = {
    counts: countsSchema.parse(parsed.counts),
    warnings: z.array(z.string().max(500)).max(100).parse(warnings), importedAt,
  };
  const { data, error } = await access.db.rpc('import_health_records', {
    p_owner_id: access.ownerId, p_token_hash: access.tokenHash, p_records: records, p_summary: summary,
  });
  if (error?.code === '42501') throw access.tokenHash ? invalidToken() : new HttpError(403, 'This account does not have access');
  if (error) throw new HttpError(503, 'Unable to import Health data. Your saved records have not been partially updated.');
  return resultSchema.parse(data);
}
