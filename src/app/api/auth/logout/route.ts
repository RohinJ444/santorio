import {clearRecoveryCookie} from '@/lib/server/recovery';
import {sessionClient} from '@/lib/server/supabase';
import {assertSameOrigin,json,route} from '@/lib/server/http';
export async function POST(request:Request){return route(async()=>{assertSameOrigin(request);const db=await sessionClient();await db.auth.signOut();await clearRecoveryCookie();return json({ok:true});});}
