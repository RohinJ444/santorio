import {z} from 'zod';
import {adminClient} from '@/lib/server/supabase';
import {HttpError} from '@/lib/server/http';
import {hash,pkceChallenge,randomToken,rateLimit} from '@/lib/server/security';
import {oauthFailure,oauthForm,oauthJson,oauthHeaders,validateResource} from '@/lib/server/oauth';
export async function POST(request:Request){try{
 await rateLimit(request,'oauth-token',60,60);const form=await oauthForm(request);
 const kind=z.enum(['authorization_code','refresh_token']).parse(form.get('grant_type'));
 const clientId=z.string().min(1).max(2000).parse(form.get('client_id'));
 const resource=validateResource(form.get('resource'));
 if(form.has('client_secret')||form.has('client_assertion')||form.has('client_assertion_type')||request.headers.has('authorization'))throw new HttpError(400,'This endpoint supports public clients with PKCE, without a client secret');
 const credential=z.string().regex(/^[A-Za-z0-9_-]{43}$/).parse(form.get(kind==='authorization_code'?'code':'refresh_token'));
 let challenge='',redirectUri='';
 if(kind==='authorization_code'){const verifier=z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/).parse(form.get('code_verifier'));challenge=pkceChallenge(verifier);redirectUri=z.string().min(1).max(2000).parse(form.get('redirect_uri'));}
 const access=randomToken(),refresh=randomToken();
 const {data,error}=await adminClient().rpc('exchange_oauth_token',{p_kind:kind,p_token_hash:hash(credential),p_client_id:clientId,p_resource:resource,p_redirect_uri:redirectUri,p_challenge:challenge,p_access_hash:hash(access),p_refresh_hash:hash(refresh)});
 if(error)throw new HttpError(503,'Unable to issue token');
 if(!data)return oauthJson({error:'invalid_grant',error_description:'The credential is invalid, expired, already used, or does not match this client/resource.'},400);
 return oauthJson({access_token:access,token_type:'Bearer',expires_in:3600,refresh_token:refresh,scope:data.scope});
 }catch(error){return oauthFailure(error);}}
export function OPTIONS(){return new Response(null,{status:204,headers:oauthHeaders});}
