import {z} from 'zod';
import {ownerEmail,sessionClient} from '@/lib/server/supabase';
import {appUrl,assertSameOrigin,bodyJson,json,route,HttpError} from '@/lib/server/http';
import {rateLimit} from '@/lib/server/security';
export async function POST(request:Request){return route(async()=>{
 assertSameOrigin(request);await rateLimit(request,'password-reset',3,3600);
 const {email}=z.strictObject({email:z.email()}).parse(await bodyJson(request,5000));
 if(email.toLowerCase()===ownerEmail()){
  const db=await sessionClient();const {error}=await db.auth.resetPasswordForEmail(ownerEmail(),{redirectTo:`${appUrl()}/api/auth/confirm?intent=recovery`});
  if(error)throw new HttpError(400,'Unable to send the reset email. Please try again shortly.');
 }
 return json({message:'If this account exists, a password reset link has been sent. Open it in this browser.'});
});}
