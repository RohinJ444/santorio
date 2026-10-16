import {z} from 'zod';
import {adminClient,requireOwner} from '@/lib/server/supabase';
import {appUrl,HttpError} from '@/lib/server/http';
import {parseScopes,validateResource,oauthFailure} from '@/lib/server/oauth';
import {resolveClient} from '@/lib/server/cimd';
import {rateLimit} from '@/lib/server/security';
export const runtime='nodejs';
export async function GET(request:Request){try{
 const url=new URL(request.url);let owner;
 try{owner=await requireOwner();}catch(error){if(error instanceof HttpError&&error.status===401)return Response.redirect(`${appUrl()}/login?next=${encodeURIComponent(url.pathname+url.search)}`,303);throw error;}
 await rateLimit(request,'oauth-authorize',20,60);
 const q=url.searchParams;for(const key of q.keys())if(q.getAll(key).length>1)throw new HttpError(400,'Duplicate OAuth parameter');
 const input=z.object({client_id:z.string().min(1).max(2000),redirect_uri:z.string().max(2000),response_type:z.literal('code'),code_challenge_method:z.literal('S256'),code_challenge:z.string().regex(/^[A-Za-z0-9_-]{43}$/),state:z.string().max(2048).optional()}).parse(Object.fromEntries(q));
 const client=await resolveClient(input.client_id);
 if(!client.redirect_uris.includes(input.redirect_uri))throw new HttpError(400,'Redirect URI is not registered for this client');
 const resource=validateResource(q.get('resource'));const scope=parseScopes(q.get('scope'));
 const db=adminClient();await db.from('oauth_requests').delete().lt('expires_at',new Date().toISOString());
 const {data,error}=await db.from('oauth_requests').insert({owner_id:owner.user.id,client_id:input.client_id,client_name:client.client_name,redirect_uri:input.redirect_uri,state:input.state||null,scope,resource,code_challenge:input.code_challenge,expires_at:new Date(Date.now()+10*60*1000).toISOString()}).select('id').single();
 if(error)throw new HttpError(503,'Unable to start authorization');
 return Response.redirect(`${appUrl()}/oauth/consent?request_id=${data.id}`,303);
 }catch(error){return oauthFailure(error);}}
