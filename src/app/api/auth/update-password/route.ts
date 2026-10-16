import {z} from 'zod';
import {adminClient,requireOwner} from '@/lib/server/supabase';
import {assertSameOrigin,bodyJson,HttpError,json,route} from '@/lib/server/http';
import {consumeRecoveryProof} from '@/lib/server/recovery';
import {rateLimit} from '@/lib/server/security';
export async function POST(request:Request){return route(async()=>{
 assertSameOrigin(request);await rateLimit(request,'password-update',5,3600);
 const {password}=z.strictObject({password:z.string().min(12).max(128)}).parse(await bodyJson(request,5000));
 const {db,user}=await requireOwner();await consumeRecoveryProof(db,user.id);
 const {error}=await db.auth.updateUser({password});
 if(error)throw new HttpError(400,'Unable to change the password. Request a new reset link and try a different password.');
 const admin=adminClient();
 const revoked=await admin.from('oauth_grants').update({revoked_at:new Date().toISOString()}).eq('owner_id',user.id).is('revoked_at',null);
 const cleaned=await admin.from('password_recovery_proofs').delete().eq('owner_id',user.id);
 const signedOut=await db.auth.signOut({scope:'global'});
 if(revoked.error||cleaned.error||signedOut.error)throw new HttpError(503,'Your password changed, but some sessions could not be revoked. Sign out and review your connected apps.');
 return json({ok:true});
});}
