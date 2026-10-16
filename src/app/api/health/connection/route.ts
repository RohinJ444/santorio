import { assertSameOrigin, json, route } from '@/lib/server/http';
import { requireOwner } from '@/lib/server/supabase';
import { rateLimit } from '@/lib/server/security';
import { healthConnection, revokeHealthConnection, rotateHealthConnection } from '@/lib/server/health-import';

export const runtime = 'nodejs';
export async function GET() {
  return route(async () => {
    const { user } = await requireOwner();
    return json(await healthConnection(user.id));
  });
}
export async function POST(request: Request) {
  return route(async () => {
    assertSameOrigin(request);
    const { user } = await requireOwner();
    await rateLimit(request, 'health-connection', 10, 60);
    return json(await rotateHealthConnection(user.id));
  });
}
export async function DELETE(request: Request) {
  return route(async () => {
    assertSameOrigin(request);
    const { user } = await requireOwner();
    await rateLimit(request, 'health-connection', 10, 60);
    await revokeHealthConnection(user.id);
    return json({ ok: true });
  });
}
