import 'server-only';
import {cookies} from 'next/headers';
import type {SupabaseClient} from '@supabase/supabase-js';
import {adminClient} from './supabase';
import {hash,randomToken} from './security';
import {HttpError} from './http';
const COOKIE='santorio-recovery';
const cookieOptions={httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax' as const,path:'/'};
export async function verifiedSessionId(db:SupabaseClient) {
 const {data,error}=await db.auth.getClaims();
 const sessionId=data?.claims.session_id;
 if(error||typeof sessionId!=='string')throw new HttpError(401,'Sign in again to continue');
 return sessionId;
}
export async function createRecoveryProof(db:SupabaseClient,ownerId:string) {
 const token=randomToken();const sessionId=await verifiedSessionId(db);const admin=adminClient();
 await admin.from('password_recovery_proofs').delete().lt('expires_at',new Date().toISOString());
 const {error}=await admin.from('password_recovery_proofs').insert({token_hash:hash(token),owner_id:ownerId,session_id:sessionId,expires_at:new Date(Date.now()+15*60*1000).toISOString()});
 if(error)throw new HttpError(503,'Unable to authorize password recovery');
 (await cookies()).set(COOKIE,token,{...cookieOptions,maxAge:15*60});
}
export async function recoveryAuthorized(db:SupabaseClient,ownerId:string) {
 const token=(await cookies()).get(COOKIE)?.value;if(!token)return false;
 const sessionId=await verifiedSessionId(db);
 const {data,error}=await adminClient().from('password_recovery_proofs').select('token_hash').eq('token_hash',hash(token)).eq('owner_id',ownerId).eq('session_id',sessionId).gt('expires_at',new Date().toISOString()).maybeSingle();
 return !error&&!!data;
}
export async function consumeRecoveryProof(db:SupabaseClient,ownerId:string) {
 const token=(await cookies()).get(COOKIE)?.value;if(!token)throw new HttpError(403,'Open a password reset link from your email first');
 const sessionId=await verifiedSessionId(db);
 const {data,error}=await adminClient().from('password_recovery_proofs').delete().eq('token_hash',hash(token)).eq('owner_id',ownerId).eq('session_id',sessionId).gt('expires_at',new Date().toISOString()).select('token_hash').maybeSingle();
 (await cookies()).set(COOKIE,'',{...cookieOptions,maxAge:0});
 if(error||!data)throw new HttpError(403,'This password reset authorization has expired or was already used');
}
export async function clearRecoveryCookie(){(await cookies()).set(COOKIE,'',{...cookieOptions,maxAge:0});}
