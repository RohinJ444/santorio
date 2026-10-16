import {beforeEach,describe,expect,it,vi} from 'vitest';
import {EventEmitter} from 'node:events';
vi.mock('server-only',()=>({}));
vi.mock('./supabase',()=>({adminClient:vi.fn()}));
const {dns,https}=vi.hoisted(()=>({dns:vi.fn(),https:vi.fn()}));
vi.mock('node:dns/promises',()=>({lookup:dns}));
vi.mock('node:https',()=>({request:https}));
import {fetchClientMetadata} from './cimd';
function mockResponse(body:unknown,statusCode=200){
 https.mockImplementation((_url,options,receive)=>{
  const req=new EventEmitter() as EventEmitter&{end:()=>void;destroy:()=>void};
  req.destroy=()=>{req.emit('close');};
  req.end=()=>{const response=new EventEmitter() as EventEmitter&{statusCode:number;headers:Record<string,string>;resume:()=>void};response.statusCode=statusCode;response.headers={'content-type':'application/json','cache-control':'no-store'};response.resume=()=>req.emit('close');receive(response);queueMicrotask(()=>{response.emit('data',Buffer.from(JSON.stringify(body)));response.emit('end');req.emit('close');});};
  const pinned=vi.fn();options.lookup('client.example',{},pinned);expect(pinned).toHaveBeenCalledWith(null,'8.8.8.8',4);
  return req;
 });
}
describe('CIMD network boundary',()=>{
 beforeEach(()=>{dns.mockReset();https.mockReset();dns.mockResolvedValue([{address:'8.8.8.8',family:4}]);});
 it('rejects private DNS answers without making an HTTP request',async()=>{dns.mockResolvedValue([{address:'169.254.169.254',family:4}]);await expect(fetchClientMetadata('https://client.example/private.json')).rejects.toThrow('not a public address');expect(https).not.toHaveBeenCalled();});
 it('rejects mixed public/private DNS answers',async()=>{dns.mockResolvedValue([{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}]);await expect(fetchClientMetadata('https://client.example/mixed.json')).rejects.toThrow();expect(https).not.toHaveBeenCalled();});
 it('pins the checked address and requires an exact client ID',async()=>{mockResponse({client_id:'https://client.example/another.json',client_name:'Example',redirect_uris:['https://client.example/callback']});await expect(fetchClientMetadata('https://client.example/id.json')).rejects.toThrow('match its URL exactly');expect(dns).toHaveBeenCalledTimes(1);});
 it('never follows metadata redirects',async()=>{mockResponse({},302);await expect(fetchClientMetadata('https://client.example/redirect.json')).rejects.toThrow('redirects are not followed');expect(https).toHaveBeenCalledTimes(1);});
 it('accepts matching public metadata with a complete redirect list',async()=>{const client_id='https://client.example/valid.json';mockResponse({client_id,client_name:'Example',redirect_uris:['https://client.example/callback']});const client=await fetchClientMetadata(client_id);expect(client.client_id).toBe(client_id);expect(client.redirect_uris).toEqual(['https://client.example/callback']);expect(client.token_endpoint_auth_method).toBe('none');});
});
