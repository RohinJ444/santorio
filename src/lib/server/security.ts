import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { adminClient } from './supabase';
import { HttpError } from './http';
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const randomToken = () => randomBytes(32).toString('base64url');
export const pkceChallenge = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');
export function equalSecret(a:string,b:string) {const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&timingSafeEqual(aa,bb);}
export async function rateLimit(request:Request,label:string,limit=30,seconds=60) {
  // Vercel sets this trusted header. Local development shares a single bucket.
  const ip=process.env.VERCEL ? request.headers.get('x-vercel-forwarded-for') || 'unknown' : 'local';
  const {data,error}=await adminClient().rpc('check_rate_limit',{p_key:hash(`${label}:${ip}`),p_limit:limit,p_seconds:seconds});
  if(error) throw new HttpError(503,'Unable to check request limit');
  if(!data) throw new HttpError(429,'Too many requests. Please try again shortly.');
}
