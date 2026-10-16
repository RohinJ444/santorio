import { assertSameOrigin, bodyJson, json, route } from '@/lib/server/http';
import { adminClient, requireOwner } from '@/lib/server/supabase';
import { rateLimit } from '@/lib/server/security';
import { HEALTH_IMPORT_MAX_BYTES, healthAggregation, importHealthExport } from '@/lib/server/health-import';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  return route(async () => {
    assertSameOrigin(request);
    const { user } = await requireOwner();
    await rateLimit(request, 'health-upload', 20, 60);
    const input = await bodyJson(request, HEALTH_IMPORT_MAX_BYTES);
    return json(await importHealthExport(input, { db: adminClient(), ownerId: user.id, tokenHash: null }, healthAggregation(request)));
  });
}
