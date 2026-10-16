import { requireOwner } from '@/lib/server/supabase';
import { listRecords } from '@/lib/server/records';
import { json, route } from '@/lib/server/http';
export const runtime='nodejs';
export async function GET() {return route(async()=>{const {db,user}=await requireOwner();return json({user:{id:user.id,email:user.email},records:await listRecords(db,user.id)});});}
