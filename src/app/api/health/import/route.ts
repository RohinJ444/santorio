import { bodyJson, json, route } from '@/lib/server/http';
import { rateLimit } from '@/lib/server/security';
import { authorizeHealthImport, HEALTH_IMPORT_MAX_BYTES, healthAggregation, importHealthExport } from '@/lib/server/health-import';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  return route(async () => {
    await rateLimit(request, 'health-import', 60, 60);
    const access = await authorizeHealthImport(request);
    const input = await bodyJson(request, HEALTH_IMPORT_MAX_BYTES);
    return json(await importHealthExport(input, access, healthAggregation(request)));
  });
}
