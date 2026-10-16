import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {createSantorioMcp} from '@/lib/server/mcp';
import {appUrl,HttpError} from '@/lib/server/http';
import {authorizeMcp,oauthFailure,oauthHeaders} from '@/lib/server/oauth';
import {rateLimit} from '@/lib/server/security';
export const runtime='nodejs';
export const maxDuration=30;
export async function POST(request:Request){try{
 const origin=request.headers.get('origin');
 const allowed=[appUrl(),...(process.env.MCP_ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean)];
 if(origin&&!allowed.includes(origin))throw new HttpError(403,'Request origin is not allowed');
 const access=await authorizeMcp(request);await rateLimit(request,'mcp',120,60);
 const server=createSantorioMcp(access);
 const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true,maxRequestBodySize:1_000_000});
 await server.connect(transport);
 try{const response=await transport.handleRequest(request);const headers=new Headers(response.headers);headers.set('Cache-Control','no-store');if(origin)headers.set('Access-Control-Allow-Origin',origin);return new Response(response.body,{status:response.status,headers});}finally{await server.close();}
 }catch(error){const response=oauthFailure(error);if(error instanceof HttpError&&error.status===401)response.headers.set('WWW-Authenticate',`Bearer resource_metadata="${appUrl()}/.well-known/oauth-protected-resource/api/mcp"`);return response;}}
export async function GET(request:Request){try{await authorizeMcp(request);return new Response(null,{status:405,headers:{Allow:'POST, OPTIONS','Cache-Control':'no-store'}});}catch(error){const response=oauthFailure(error);if(error instanceof HttpError&&error.status===401)response.headers.set('WWW-Authenticate',`Bearer resource_metadata="${appUrl()}/.well-known/oauth-protected-resource/api/mcp"`);return response;}}
export function OPTIONS(){return new Response(null,{status:204,headers:oauthHeaders});}
