import {adminClient} from '@/lib/server/supabase';
import {hash,rateLimit} from '@/lib/server/security';
import {oauthForm,oauthFailure,oauthHeaders} from '@/lib/server/oauth';
export async function POST(request:Request){try{await rateLimit(request,'oauth-revoke',30,60);const form=await oauthForm(request);const token=form.get('token');const client=form.get('client_id');if(token&&token.length<1000&&client){const db=adminClient();const {data}=await db.from('oauth_tokens').select('grant_id').eq('token_hash',hash(token)).maybeSingle();if(data)await db.from('oauth_grants').update({revoked_at:new Date().toISOString()}).eq('id',data.grant_id).eq('client_id',client);}return new Response(null,{status:200,headers:{...oauthHeaders,'Cache-Control':'no-store'}});}catch(error){return oauthFailure(error);}}
export function OPTIONS(){return new Response(null,{status:204,headers:oauthHeaders});}
