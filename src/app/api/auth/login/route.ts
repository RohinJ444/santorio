import {z} from 'zod';
import {ownerEmail,sessionClient} from '@/lib/server/supabase';
import {assertSameOrigin,bodyJson,HttpError,json,route} from '@/lib/server/http';
import {rateLimit} from '@/lib/server/security';
export async function POST(request:Request){return route(async()=>{assertSameOrigin(request);await rateLimit(request,'login',10,300);const input=z.strictObject({email:z.email(),password:z.string().min(1).max(256)}).parse(await bodyJson(request,5000));if(input.email.toLowerCase()!==ownerEmail())throw new HttpError(401,'Invalid email or password');const db=await sessionClient();const {data,error}=await db.auth.signInWithPassword(input);if(error||!data.user.email_confirmed_at)throw new HttpError(401,error?.code==='email_not_confirmed'?'Confirm your email before signing in':'Invalid email or password');return json({user:{id:data.user.id,email:data.user.email}});});}
