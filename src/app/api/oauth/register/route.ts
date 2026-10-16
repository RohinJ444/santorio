import {randomUUID} from 'node:crypto';
import {bodyJson,HttpError} from '@/lib/server/http';
import {adminClient} from '@/lib/server/supabase';
import {clientMetadataSchema} from '@/lib/server/cimd';
import {oauthFailure,oauthJson,oauthHeaders} from '@/lib/server/oauth';
import {rateLimit} from '@/lib/server/security';
export async function POST(request:Request){try{await rateLimit(request,'oauth-register',10,3600);const input=clientMetadataSchema.parse(await bodyJson(request,16000));if(input.client_id)throw new HttpError(400,'Use the metadata URL directly for CIMD clients');const client_id=randomUUID();const client={...input,client_id};const {error}=await adminClient().from('oauth_clients').insert({client_id,metadata:client});if(error)throw new HttpError(503,'Unable to register client');return oauthJson({...client,client_id_issued_at:Math.floor(Date.now()/1000)},201);}catch(error){return oauthFailure(error);}}
export function OPTIONS(){return new Response(null,{status:204,headers:oauthHeaders});}
