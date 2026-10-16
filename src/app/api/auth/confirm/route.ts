import {sessionClient,ownerEmail} from '@/lib/server/supabase';
import {appUrl,HttpError} from '@/lib/server/http';
import {createRecoveryProof} from '@/lib/server/recovery';
export async function GET(request:Request){try{
 const url=new URL(request.url);const db=await sessionClient();let recovery=false;
 if(url.searchParams.get('code')){
  const {data,error}=await db.auth.exchangeCodeForSession(url.searchParams.get('code')!);
  if(error)throw new HttpError(400,'Unable to complete this link. Open it in the browser where you requested it, or request a new link.');
  recovery='redirectType' in data && data.redirectType==='recovery';
 }else{
  const token_hash=url.searchParams.get('token_hash');const type=url.searchParams.get('type');
  if(!token_hash||!['signup','email','invite','recovery'].includes(type||''))throw new HttpError(400,'Invalid confirmation link');
  const {error}=await db.auth.verifyOtp({token_hash,type:type as 'signup'|'email'|'invite'|'recovery'});
  if(error)throw new HttpError(400,'This confirmation link has expired or was already used.');
  recovery=type==='recovery';
 }
 const {data:{user}}=await db.auth.getUser();
 if(user?.email?.toLowerCase()!==ownerEmail()||!user.email_confirmed_at){await db.auth.signOut();throw new HttpError(403,'Account access is restricted');}
 // The query parameter alone never authorizes recovery. The verified flow type must match.
 if(url.searchParams.get('intent')==='recovery'&&!recovery){await db.auth.signOut({scope:'local'});throw new HttpError(400,'Use a password recovery link to change your password');}
 if(recovery){await createRecoveryProof(db,user.id);return Response.redirect(`${appUrl()}/reset-password`,303);}
 return Response.redirect(`${appUrl()}/`,303);
 }catch(error){const message=error instanceof HttpError?error.message:'Unable to complete this link. Request a new email and try again.';return Response.redirect(`${appUrl()}/login?authError=${encodeURIComponent(message)}`,303);}}
