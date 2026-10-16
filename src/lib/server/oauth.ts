import 'server-only';
import {z} from 'zod';
import {adminClient,ownerEmail} from './supabase';
import {appUrl,boundedText,HttpError,json} from './http';
import {hash} from './security';
export const SCOPES=['nutrition:read','nutrition:write','workouts:read','workouts:write'] as const;
// Keep unspecified requests compatible with existing food-only clients. New access needs consent.
const DEFAULT_SCOPE='nutrition:read nutrition:write';
export const resourceUrl=()=>`${appUrl()}/api/mcp`;
export function parseScopes(value:string|null) {
 const scopes=[...new Set((value||DEFAULT_SCOPE).split(' ').filter(Boolean))];
 if(scopes.length===0||scopes.some(s=>!SCOPES.includes(s as typeof SCOPES[number])))throw new HttpError(400,'Unsupported scope');
 return scopes.sort().join(' ');
}
export function metadata(){return {issuer:appUrl(),authorization_response_iss_parameter_supported:true,authorization_endpoint:`${appUrl()}/api/oauth/authorize`,token_endpoint:`${appUrl()}/api/oauth/token`,registration_endpoint:`${appUrl()}/api/oauth/register`,revocation_endpoint:`${appUrl()}/api/oauth/revoke`,response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none'],scopes_supported:SCOPES,client_id_metadata_document_supported:true};}
export const oauthHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization, MCP-Protocol-Version','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Expose-Headers':'WWW-Authenticate'};
export function oauthJson(value:unknown,status=200){return json(value,status,oauthHeaders);}
export function oauthFailure(error:unknown){if(error instanceof HttpError)return oauthJson({error:error.status===401?'invalid_token':error.status===403?'access_denied':error.status===429?'temporarily_unavailable':'invalid_request',error_description:error.message},error.status);if(error instanceof z.ZodError)return oauthJson({error:'invalid_request',error_description:'Invalid OAuth parameters'},400);console.error('OAuth operation failed',error instanceof Error?error.message:'Unknown error');return oauthJson({error:'server_error'},500);}
export async function oauthForm(request:Request) {if(!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))throw new HttpError(400,'Use application/x-www-form-urlencoded');const form=new URLSearchParams(await boundedText(request,16000));for(const key of form.keys())if(form.getAll(key).length>1)throw new HttpError(400,`Duplicate parameter: ${key}`);return form;}
export function validateResource(resource:string|null){if(resource!==resourceUrl())throw new HttpError(400,'The resource must identify this MCP endpoint');return resource;}
export async function authorizeMcp(request:Request,requiredScope?:typeof SCOPES[number]) {
 const authorization=request.headers.get('authorization');if(!authorization?.startsWith('Bearer '))throw new HttpError(401,'A bearer token is required');
 const token=authorization.slice(7);if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw new HttpError(401,'Invalid access token');
 const db=adminClient();
 const {data:credential,error}=await db.from('oauth_tokens').select('grant_id,expires_at').eq('token_hash',hash(token)).eq('kind','access').is('used_at',null).maybeSingle();
 if(error||!credential||Date.parse(credential.expires_at)<=Date.now())throw new HttpError(401,'The access token is expired or invalid');
 const {data:grant,error:grantError}=await db.from('oauth_grants').select('*').eq('id',credential.grant_id).is('revoked_at',null).maybeSingle();
 if(grantError||!grant||grant.resource!==resourceUrl())throw new HttpError(401,'The connection is no longer authorized');
 const {data:{user},error:userError}=await db.auth.admin.getUserById(grant.owner_id);
 if(userError||user?.email?.toLowerCase()!==ownerEmail()||!user.email_confirmed_at)throw new HttpError(401,'The account is no longer authorized');
 const scopes=(grant.scope as string).split(' ');
 if(requiredScope&&!scopes.includes(requiredScope))throw new HttpError(403,`This action requires ${requiredScope}`);
 return {db,ownerId:grant.owner_id as string,scopes,clientId:grant.client_id as string};
}
