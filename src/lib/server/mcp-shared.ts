import 'server-only';
import {z} from 'zod';
import {appUrl,HttpError} from './http';
import type {authorizeMcp,SCOPES} from './oauth';

export type McpAccess=Awaited<ReturnType<typeof authorizeMcp>>;
export type McpScope=typeof SCOPES[number];
export const readAnnotations={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false};
// Save tools can replace existing fields; advertise that accurately to clients.
export const writeAnnotations={readOnlyHint:false,destructiveHint:true,idempotentHint:true,openWorldHint:false};
export const permissions=(scope:McpScope)=>({securitySchemes:[{type:'oauth2',scopes:[scope]}]});
export function requireScope(access:McpAccess,scope:McpScope){
 if(!access.scopes.includes(scope))throw new HttpError(403,`Missing ${scope} permission`,{requiredScope:scope});
}
export function result(value:unknown){
 return {content:[{type:'text' as const,text:JSON.stringify(value)}],structuredContent:typeof value==='object'&&value!==null&&!Array.isArray(value)?value as Record<string,unknown>:{result:value}};
}
export function toolError(error:unknown){
 const requiredScope=error instanceof HttpError&&error.status===403?error.details?.requiredScope:undefined;
 return {
  ...(typeof requiredScope==='string'?{_meta:{'mcp/www_authenticate':[`Bearer error="insufficient_scope", scope="${requiredScope}", resource_metadata="${appUrl()}/.well-known/oauth-protected-resource/api/mcp"`]}}:{}),
  isError:true,
  content:[{type:'text' as const,text:JSON.stringify(error instanceof HttpError?{error:error.message,status:error.status,...error.details}:error instanceof z.ZodError?{error:'Invalid input',issues:error.issues}:{error:'Unable to complete this operation'})}],
 };
}
