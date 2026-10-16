import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { HttpError } from './http';
export const ownerEmail = () => (process.env.OWNER_EMAIL || 'rohin.juneja@berkeley.edu').trim().toLowerCase();
export function configured() {return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));}
export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new HttpError(503,'Backend credentials are not configured');
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export async function sessionClient() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url||!key) throw new HttpError(503,'Backend credentials are not configured');
  const jar=await cookies();
  return createServerClient(url,key,{cookieOptions:{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/'},cookies:{getAll:()=>jar.getAll(),setAll:items=>{for(const {name,value,options} of items) jar.set(name,value,options);}}});
}
export async function requireOwner() {
  const db=await sessionClient(); const {data:{user},error}=await db.auth.getUser();
  if(error||!user) throw new HttpError(401,'Sign in to continue');
  if(user.email?.toLowerCase()!==ownerEmail()||!user.email_confirmed_at) throw new HttpError(403,'This account does not have access');
  return {db,user};
}
export async function findOwner() {
  const {data,error}=await adminClient().auth.admin.listUsers({page:1,perPage:1000});
  if(error) throw new HttpError(503,'Unable to check account setup');
  return data.users.find(u=>u.email?.toLowerCase()===ownerEmail()) || null;
}
