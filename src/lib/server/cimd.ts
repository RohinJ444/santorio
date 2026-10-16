import 'server-only';
import {lookup} from 'node:dns/promises';
import {request as httpsRequest} from 'node:https';
import {isIP} from 'node:net';
import {z} from 'zod';
import {HttpError} from './http';
import {adminClient} from './supabase';

export function publicIPv4(address:string):boolean {
 if(isIP(address)!==4)return false;
 const [a,b,c]=address.split('.').map(Number);
 return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===0||b===168||(b===88&&c===99)))||(a===198&&(b===18||b===19||(b===51&&c===100)))||(a===203&&b===0&&c===113));
}
export function safeRedirect(value:string):boolean {
 try {const u=new URL(value);if(u.username||u.password||u.hash)return false;return u.protocol==='https:'||(u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname));}catch{return false;}
}
export const clientMetadataSchema=z.object({client_id:z.string().max(2000).optional(),client_name:z.string().min(1).max(200),redirect_uris:z.array(z.string().max(2000).refine(safeRedirect,'Redirects must use HTTPS or loopback HTTP')).min(1).max(20),token_endpoint_auth_method:z.string().max(100).optional(),token_endpoint_auth_methods_supported:z.array(z.string().min(1).max(100)).min(1).max(20).optional(),grant_types:z.array(z.enum(['authorization_code','refresh_token'])).default(['authorization_code','refresh_token']),response_types:z.array(z.literal('code')).default(['code'])}).refine(meta=>(meta.token_endpoint_auth_methods_supported??[meta.token_endpoint_auth_method??'none']).includes('none'),'Client must support public-client authentication (none)').transform(meta=>({...meta,token_endpoint_auth_method:'none' as const}));
export type ClientMetadata=z.infer<typeof clientMetadataSchema>&{client_id:string};
const cache=new Map<string,{expires:number,metadata:ClientMetadata}>();
export async function fetchClientMetadata(clientId:string):Promise<ClientMetadata> {
 const hit=cache.get(clientId);if(hit&&hit.expires>Date.now())return hit.metadata;
 let url:URL;try{url=new URL(clientId);}catch{throw new HttpError(400,'Invalid client metadata URL');}
 if(url.protocol!=='https:'||url.username||url.password||url.hash||(url.port&&url.port!=='443')||url.pathname==='/'||isIP(url.hostname))throw new HttpError(400,'Client ID must be a public HTTPS metadata URL with a path');
 // Resolve once, reject any private answer, and pin the exact address in the TLS request.
 // A second DNS resolution by fetch would permit DNS rebinding.
 const addresses=await lookup(url.hostname,{all:true,family:4}).catch(()=>[]);
 if(!addresses.length||addresses.some(a=>!publicIPv4(a.address)))throw new HttpError(400,'Client metadata host is not a public address');
 const {body,maxAge}=await new Promise<{body:string,maxAge:number}>((resolve,reject)=>{
  const req=httpsRequest(url,{method:'GET',family:4,headers:{Accept:'application/json'},lookup:(_hostname,_options,callback)=>callback(null,addresses[0].address,4),timeout:5000},res=>{
   if(res.statusCode!==200){res.resume();reject(new HttpError(400,'Unable to retrieve client metadata; redirects are not followed'));return;}
   const contentType=res.headers['content-type']||'';
   if(!/application\/(?:[a-z0-9.+-]+\+)?json/i.test(contentType)){res.resume();reject(new HttpError(400,'Client metadata must be JSON'));return;}
   const chunks:Buffer[]=[];let bytes=0;
   res.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>65536){req.destroy();reject(new HttpError(400,'Client metadata is too large'));}else chunks.push(chunk);});
   res.on('error',reject);
   res.on('end',()=>{const control=res.headers['cache-control']||'';const seconds=control.match(/max-age=(\d+)/i);resolve({body:Buffer.concat(chunks).toString('utf8'),maxAge:/no-store|no-cache/i.test(control)?0:Math.min(300,seconds?Number(seconds[1]):60)});});
  });
  const deadline=setTimeout(()=>req.destroy(new Error('Metadata request timed out')),5000);
  req.on('close',()=>clearTimeout(deadline));
  req.on('timeout',()=>req.destroy(new Error('Metadata request timed out')));req.on('error',()=>reject(new HttpError(400,'Unable to retrieve client metadata')));req.end();
 });
 let decoded:unknown;try{decoded=JSON.parse(body);}catch{throw new HttpError(400,'Invalid client metadata JSON');}
 const metadata=clientMetadataSchema.parse(decoded);
 if(metadata.client_id!==clientId)throw new HttpError(400,'Metadata client_id must match its URL exactly');
 if(!metadata.grant_types.includes('authorization_code'))throw new HttpError(400,'Client must support authorization code flow');
 const value=metadata as ClientMetadata;
 if(cache.size>=100)cache.delete(cache.keys().next().value!);
 if(maxAge>0)cache.set(clientId,{expires:Date.now()+maxAge*1000,metadata:value});
 return value;
}
export async function resolveClient(clientId:string):Promise<ClientMetadata> {
 if(clientId.startsWith('https://'))return fetchClientMetadata(clientId);
 if(!z.uuid().safeParse(clientId).success)throw new HttpError(400,'Unknown OAuth client');
 const {data,error}=await adminClient().from('oauth_clients').select('metadata').eq('client_id',clientId).maybeSingle();
 if(error||!data)throw new HttpError(400,'Unknown OAuth client');
 return {...clientMetadataSchema.parse(data.metadata),client_id:clientId};
}
