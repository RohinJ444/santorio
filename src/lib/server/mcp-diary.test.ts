import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Collection,Collections,DiaryEntry,FoodRecord,PrepBatch} from '@/lib/domain/types';
import {customizePortion,nutrientValue} from '@/lib/domain/nutrition';
vi.mock('server-only',()=>({}));
import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {createSantorioMcp} from './mcp';

const ownerId='cd45c36d-071a-4da7-9e5d-6f656a589408';
const uuid=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const ids={meal:uuid(1),milk:uuid(2),oats:uuid(3),batch:uuid(4),mutation:uuid(5),anchor:uuid(6)};
type Row={owner_id:string;collection:Collection;id:string;data:Collections[Collection];version:number;updated_at:string;deleted:boolean};
type Ledger={owner_id:string;mutation_id:string;fingerprint:string;result:{ok:true;record:Row}};
const rows=new Map<string,Row>();
const ledger=new Map<string,Ledger>();
const from=vi.fn((table:string)=>{
 const filters:Record<string,unknown>={};let bounds=[0,999];
 const selected=()=>[...(table==='records'?rows.values():ledger.values())].filter(row=>Object.entries(filters).every(([key,value])=>row[key as keyof typeof row]===value));
 const builder={select:()=>builder,eq:(key:string,value:unknown)=>{filters[key]=value;return builder;},order:()=>builder,range:(start:number,end:number)=>{bounds=[start,end];return builder;},
  maybeSingle:async()=>({data:structuredClone(selected()[0]??null),error:null}),
  then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:structuredClone(selected().slice(bounds[0],bounds[1]+1)),error:null}).then(resolve)};
 return builder;
});
const rpc=vi.fn(async(_name:string,args:{p_owner_id:string;p_collection:Collection;p_id:string;p_data:Collections[Collection];p_expected_version:number;p_mutation_id:string;p_fingerprint:string;p_deleted:boolean})=>{
 const prior=ledger.get(`${args.p_owner_id}:${args.p_mutation_id}`);
 if(prior)return {data:prior.fingerprint===args.p_fingerprint?structuredClone(prior.result):{ok:false,reason:'mutation_reused'},error:null};
 const key=`${args.p_owner_id}:${args.p_collection}:${args.p_id}`,current=rows.get(key);
 if((current?.version??0)!==args.p_expected_version)return {data:{ok:false,reason:'conflict',current:current??null},error:null};
 const record:Row={owner_id:args.p_owner_id,collection:args.p_collection,id:args.p_id,data:structuredClone(args.p_data),version:args.p_expected_version+1,updated_at:'2026-10-16T19:00:00Z',deleted:args.p_deleted};
 rows.set(key,record);const result={ok:true as const,record:structuredClone(record)};
 ledger.set(`${args.p_owner_id}:${args.p_mutation_id}`,{owner_id:args.p_owner_id,mutation_id:args.p_mutation_id,fingerprint:args.p_fingerprint,result});
 return {data:structuredClone(result),error:null};
});
const db={from,rpc} as unknown as SupabaseClient;
function remember<C extends Collection>(collection:C,data:Collections[C],version=1,deleted=false,owner=ownerId) {
 rows.set(`${owner}:${collection}:${data.id}`,{owner_id:owner,collection,id:data.id,data:structuredClone(data),version,updated_at:'2026-10-16T18:00:00Z',deleted});
}
function food(id:string,name:string,energy:number,protein:number,carbs:number,fat:number):FoodRecord {
 return {id,name,brand:'',revision:1,basis:{quantity:1,unit:'cup'},nutrients:[nutrientValue('energy',energy),nutrientValue('protein',protein),nutrientValue('carbs',carbs),nutrientValue('fat',fat),nutrientValue('vitamin_c',null)],sourceUrl:'Label',notes:'',ingredientsText:''};
}
function milk(){return {...food(ids.milk,'2% milk',130,8,13,5),nutrients:[...food(ids.milk,'2% milk',130,8,13,5).nutrients,{...nutrientValue('calcium',300),estimated:true}]};}
function milkWithCustomNutrients():FoodRecord{return {...milk(),nutrients:[...milk().nutrients,
 {key:'custom_compound',label:'Custom compound',unit:'mg',amount:8,source:'Manufacturer label'},
 {key:'custom_estimate',label:'Custom estimate',unit:'mg',amount:4,source:'Reference estimate',estimated:true},
 {key:'custom_unknown',label:'Custom unknown',unit:'mg',amount:null,source:'Not reported',estimated:true},
 {key:'custom_zero',label:'Custom zero',unit:'g',amount:0,source:'Confirmed absent',estimated:false},
]};}
function oats(){return {...food(ids.oats,'Oats',400,20,60,10),basis:{quantity:100,unit:'g'}};}
function batch():PrepBatch{return {id:ids.batch,name:'Weekly oats',date:'2026-10-15',recipeId:null,notes:'',anchorIngredientId:ids.anchor,ingredients:[{id:ids.anchor,food:oats(),quantity:1000,unit:'g'},{id:uuid(7),food:milk(),quantity:4,unit:'cup'}]};}
function mealArgs(){return {id:ids.meal,date:'2026-10-16',meal:'Breakfast',name:'Oats and milk',estimated:true,mutationId:ids.mutation,source:{kind:'foods',items:[{foodId:ids.milk,foodVersion:1,quantity:6,unit:'fl oz'},{foodId:ids.oats,foodVersion:1,quantity:30,unit:'g'}]}};}
function prepArgs(portion:Record<string,unknown>={kind:'fraction',fraction:0.2}){return {...mealArgs(),source:{kind:'batch',batchId:ids.batch,batchVersion:1,portion}};}
async function call(name:string,args:unknown,scopes=['nutrition:read','nutrition:write']) {
 const server=createSantorioMcp({db,ownerId,scopes,clientId:'https://client.example/metadata.json'});
 const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});await server.connect(transport);
 try {
  const response=await transport.handleRequest(new Request('https://santorio.example/api/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-11-25'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}));
  const body=await response.json();if(body.error)throw new Error(JSON.stringify(body.error));return body.result;
 } finally {await server.close();}
}
const total=(response:Awaited<ReturnType<typeof call>>,key:string)=>response.structuredContent.totals.find((n:{key:string})=>n.key===key);
function savedEntry():DiaryEntry {return structuredClone(rows.get(`${ownerId}:diary:${ids.meal}`)!.data as DiaryEntry);}
beforeEach(()=>{process.env.APP_URL='https://santorio.example';rows.clear();ledger.clear();vi.clearAllMocks();remember('foods',milk());remember('foods',oats());remember('batches',batch());});

describe('direct meal logging through MCP and the shared record service',()=>{
 it('logs a multi-food breakfast, converts 6 fl oz to 3/4 cup, and reads it back from the diary',async()=>{
  const response=await call('log_meal',mealArgs());expect(response.isError).not.toBe(true);
  expect(response.structuredContent).toMatchObject({collection:'diary',version:1,data:{id:ids.meal,date:'2026-10-16',time:'',meal:'Breakfast',estimated:true,multiplier:1,kind:'food'}});
  expect(total(response,'energy').amount).toBeCloseTo(217.5);expect(total(response,'protein').amount).toBeCloseTo(12);
  expect(total(response,'vitamin_c')).toMatchObject({amount:null,partial:true,known:0,total:2});
  expect(total(response,'calcium')).toMatchObject({amount:225,partial:true,estimated:true,known:1,total:2});
  const read=await call('get_diary_entry',{id:ids.meal});expect(read.structuredContent).toEqual(response.structuredContent);
  const search=await call('search_diary',{dateFrom:'2026-10-16',dateTo:'2026-10-16',meal:'Breakfast',query:'milk'});expect(search.structuredContent.records).toHaveLength(1);
  expect(search.structuredContent.records[0].totals).toHaveLength(4);expect(search.structuredContent.hasMore).toBe(false);
  expect(rows.get(`${ownerId}:foods:${ids.milk}`)!.version).toBe(1);
 });
 it('returns valid totals for custom nutrients while preserving sources in snapshots across logging, reading and retry',async()=>{
  const enriched=milkWithCustomNutrients();remember('foods',enriched);
  const response=await call('log_meal',mealArgs());expect(response.isError).not.toBe(true);
  expect(response.structuredContent.data.ingredients[0].food.nutrients).toEqual(enriched.nutrients);
  expect(total(response,'custom_compound')).toMatchObject({amount:6,group:'Other',partial:true,known:1,total:2,estimated:false});
  expect(total(response,'custom_estimate')).toMatchObject({amount:3,estimated:true,partial:true});
  expect(total(response,'custom_unknown')).toMatchObject({amount:null,partial:true,known:0,total:2});
  expect(total(response,'custom_zero')).toMatchObject({amount:0,known:1,partial:true});
  for(const nutrient of enriched.nutrients.filter(n=>n.key.startsWith('custom_')))expect(total(response,nutrient.key)).not.toHaveProperty('source');
  const read=await call('get_diary_entry',{id:ids.meal});expect(read.isError).not.toBe(true);expect(read.structuredContent).toEqual(response.structuredContent);
  const retry=await call('log_meal',mealArgs());expect(retry.isError).not.toBe(true);expect(retry.structuredContent).toEqual(response.structuredContent);
  expect(rpc).toHaveBeenCalledTimes(1);expect(ledger.size).toBe(1);expect([...rows.values()].filter(r=>r.collection==='diary')).toHaveLength(1);
 });
 it.each(['fraction','anchor'])('returns valid custom nutrient totals for batch lookup, %s prep logging and diary edits',async(kind)=>{
  const enriched=milkWithCustomNutrients(),prep=batch();prep.ingredients[1].food=enriched;remember('batches',prep);
  const full=await call('get_batch',{id:ids.batch});expect(full.isError).not.toBe(true);
  expect(total(full,'custom_compound').amount).toBe(32);expect(total(full,'custom_estimate')).toMatchObject({amount:16,estimated:true});
  expect(full.structuredContent.data.ingredients[1].food.nutrients).toEqual(enriched.nutrients);
  const portion=kind==='fraction'?{kind,fraction:0.2}:{kind,quantity:200,unit:'g'};
  const logged=await call('log_meal',prepArgs(portion));expect(logged.isError).not.toBe(true);expect(total(logged,'custom_compound').amount).toBeCloseTo(6.4);
  const entry=savedEntry();entry.multiplier=0.5;
  const edited=await call('save_diary_entry',{entry,expectedVersion:1,mutationId:uuid(8)});expect(edited.isError).not.toBe(true);
  expect(edited.structuredContent.version).toBe(2);expect(total(edited,'custom_compound').amount).toBe(16);
  expect(total(edited,'custom_estimate')).toMatchObject({amount:8,estimated:true});expect(total(edited,'custom_unknown').amount).toBeNull();
  expect(edited.structuredContent.data.ingredients[1].food.nutrients).toEqual(enriched.nutrients);
  for(const response of [full,logged,edited])for(const nutrient of enriched.nutrients.filter(n=>n.key.startsWith('custom_')))expect(total(response,nutrient.key)).not.toHaveProperty('source');
  expect(rpc).toHaveBeenCalledTimes(2);expect((rows.get(`${ownerId}:batches:${ids.batch}`)!.data as PrepBatch).ingredients[1].quantity).toBe(4);
 });
 it.each(['fraction','anchor'])('logs a prep portion using %s without applying the portion twice',async(kind)=>{
  const response=await call('log_meal',prepArgs(kind==='fraction'?{kind,fraction:0.2}:{kind,quantity:200,unit:'g'}));
  expect(response.isError).not.toBe(true);expect(response.structuredContent.data).toMatchObject({kind:'prep',batchId:ids.batch,multiplier:0.2,anchorIngredientId:ids.anchor});
  expect(response.structuredContent.data.ingredients[0].quantity).toBe(1000);expect(total(response,'energy').amount).toBeCloseTo(904);
 });
 it('supports supplements and explicit local date/time without timezone conversion',async()=>{
  const response=await call('log_meal',{...mealArgs(),meal:'Supplements',date:'2026-10-15',time:'23:50'});
  expect(response.structuredContent.data).toMatchObject({meal:'Supplements',date:'2026-10-15',time:'23:50'});
 });
 it('returns the original acknowledgement on retry even after source changes or deletion',async()=>{
  const first=await call('log_meal',mealArgs());remember('foods',{...milk(),revision:2,name:'Changed milk'},2);remember('foods',oats(),2,true);
  const retry=await call('log_meal',mealArgs());expect(retry.structuredContent).toEqual(first.structuredContent);expect(rpc).toHaveBeenCalledTimes(1);
  const read=await call('get_diary_entry',{id:ids.meal});expect(total(read,'energy').amount).toBeCloseTo(217.5);
 });
 it('rejects changed mutation reuse and prevents a second create from overwriting the same meal',async()=>{
  await call('log_meal',mealArgs());
  const changed=await call('log_meal',{...mealArgs(),date:'2026-10-17'});expect(changed.content[0].text).toContain('different change');
  const duplicate=await call('log_meal',{...mealArgs(),mutationId:uuid(8)});expect(duplicate.content[0].text).toContain('changed elsewhere');
  expect([...rows.values()].filter(r=>r.collection==='diary')).toHaveLength(1);
 });
 it('acknowledges concurrent identical creates once',async()=>{
  const [a,b]=await Promise.all([call('log_meal',mealArgs()),call('log_meal',mealArgs())]);
  expect(a.isError).not.toBe(true);expect(b.structuredContent).toEqual(a.structuredContent);
  expect([...rows.values()].filter(r=>r.collection==='diary')).toHaveLength(1);expect(ledger.size).toBe(1);
 });
 it('rejects outdated record versions, even if the food revision number was not changed',async()=>{
  remember('foods',milk(),2);const response=await call('log_meal',mealArgs());expect(response.content[0].text).toContain('changed');expect(rpc).not.toHaveBeenCalled();
 });
 it.each(['missing','deleted','archived'])('rejects %s food sources without saving',async(state)=>{
  if(state==='missing')rows.delete(`${ownerId}:foods:${ids.milk}`);else remember('foods',{...milk(),archived:state==='archived'},1,state==='deleted');
  const response=await call('log_meal',mealArgs());expect(response.content[0].text).toContain('unavailable');expect(rpc).not.toHaveBeenCalled();
 });
 it('does not invent density when asked to convert volume to an exclusively mass-based food',async()=>{
  const args=mealArgs();args.source.items[1].unit='cup';const response=await call('log_meal',args);
  expect(response.isError).toBe(true);expect(response.content[0].text).toContain('Cannot convert');expect(rpc).not.toHaveBeenCalled();
 });
 it('requires a compatible anchor and rejects an empty batch',async()=>{
  remember('batches',{...batch(),anchorIngredientId:null});expect((await call('log_meal',prepArgs({kind:'anchor',quantity:200,unit:'g'}))).content[0].text).toContain('no compatible portion anchor');
  remember('batches',{...batch(),ingredients:[],anchorIngredientId:null});expect((await call('log_meal',prepArgs())).isError).toBe(true);expect(rpc).not.toHaveBeenCalled();
 });
 it.each([
  {date:'2026-02-30'},{time:'24:00'},{name:' '},{source:{kind:'foods',items:[]}},
  {source:{kind:'foods',items:[{foodId:ids.milk,foodVersion:1,quantity:0,unit:'cup'}]}},
  {source:{kind:'batch',batchId:ids.batch,batchVersion:1,portion:{kind:'fraction',fraction:0}}},
 ])('rejects invalid input before database access: %j',async(patch)=>{
  const response=await call('log_meal',{...mealArgs(),...patch});expect(response.isError).toBe(true);expect(from).not.toHaveBeenCalled();expect(rpc).not.toHaveBeenCalled();
 });
 it('enforces nutrition scopes before database access',async()=>{
  expect((await call('log_meal',mealArgs(),['nutrition:read'])).content[0].text).toContain('Missing nutrition:write');
  for(const name of ['search_diary','search_batches'])expect((await call(name,{},['workouts:read'])).content[0].text).toContain('Missing nutrition:read');
  for(const name of ['get_diary_entry','get_batch'])expect((await call(name,{id:ids.meal},['workouts:read'])).content[0].text).toContain('Missing nutrition:read');
  expect(from).not.toHaveBeenCalled();expect(rpc).not.toHaveBeenCalled();
 });
 it('searches only the owner’s entries, excludes deleted entries and respects date/category filters',async()=>{
  await call('log_meal',mealArgs());const base=savedEntry();
  remember('diary',{...base,id:uuid(9),date:'2026-10-14'});remember('diary',{...base,id:uuid(10)},1,true);remember('diary',{...base,id:uuid(11)},1,false,uuid(100));
  const response=await call('search_diary',{dateFrom:'2026-10-15',dateTo:'2026-10-16',meal:'Breakfast'});expect(response.structuredContent.records.map((r:{id:string})=>r.id)).toEqual([ids.meal]);
  expect((await call('search_diary',{dateFrom:'2026-10-17',dateTo:'2026-10-16'})).isError).toBe(true);
  expect((await call('get_diary_entry',{id:uuid(10)})).isError).toBe(true);expect((await call('get_diary_entry',{id:uuid(11)})).isError).toBe(true);
  expect((await call('search_diary',{limit:1})).structuredContent.hasMore).toBe(true);
 });
 it('finds batch versions and full-batch totals, excluding archived batches from search',async()=>{
  remember('batches',{...batch(),id:uuid(10),archived:true});const search=await call('search_batches',{query:'weekly',dateFrom:'2026-10-15',dateTo:'2026-10-15'});
  expect(search.structuredContent.records).toHaveLength(1);expect(search.structuredContent.records[0]).toMatchObject({id:ids.batch,version:1});
  const read=await call('get_batch',{id:ids.batch});expect(total(read,'energy').amount).toBe(4520);
 });
 it('edits consumed amounts using historical snapshots after the food was deleted; retries and conflicts stay safe',async()=>{
  await call('log_meal',mealArgs());remember('foods',milk(),2,true);const entry=savedEntry();entry.ingredients[0].quantity=8;
  const args={entry,expectedVersion:1,mutationId:uuid(8)};const response=await call('save_diary_entry',args);
  expect(response.structuredContent.version).toBe(2);expect(total(response,'energy').amount).toBe(250);
  expect((await call('save_diary_entry',args)).structuredContent).toEqual(response.structuredContent);
  expect((await call('save_diary_entry',{...args,mutationId:uuid(9)})).content[0].text).toContain('changed elsewhere');
 });
 it('customizes a prep portion once, preserving the batch',async()=>{
  await call('log_meal',prepArgs());const entry=customizePortion(savedEntry());entry.ingredients[1].quantity=1;
  const response=await call('save_diary_entry',{entry,expectedVersion:1,mutationId:uuid(8)});
  expect(response.structuredContent.data).toMatchObject({multiplier:1,portionCustomized:true,anchorIngredientId:null,batchId:ids.batch});
  expect(total(response,'energy').amount).toBe(930);expect((rows.get(`${ownerId}:batches:${ids.batch}`)!.data as PrepBatch).ingredients[0].quantity).toBe(1000);
 });
 it('rejects rewriting retained food snapshots or changing the batch link',async()=>{
  await call('log_meal',mealArgs());const entry=savedEntry();entry.ingredients[0].food.nutrients[0].amount=1;
  expect((await call('save_diary_entry',{entry,expectedVersion:1,mutationId:uuid(8)})).content[0].text).toContain('Preserve food snapshots');
  expect((await call('save_diary_entry',{entry:{...savedEntry(),batchId:ids.batch},expectedVersion:1,mutationId:uuid(8)})).content[0].text).toContain('batch link');
 });
 it('allows adding a reviewed saved food but rejects invented new ingredient snapshots',async()=>{
  await call('log_meal',mealArgs());const entry=savedEntry();entry.ingredients.push({id:uuid(12),food:milk(),quantity:1,unit:'cup'});
  const changed=structuredClone(entry);changed.ingredients[2].food.nutrients[0].amount=1;
  expect((await call('save_diary_entry',{entry:changed,expectedVersion:1,mutationId:uuid(8)})).content[0].text).toContain('complete current food');
  const response=await call('save_diary_entry',{entry,expectedVersion:1,mutationId:uuid(8)});expect(response.isError).not.toBe(true);expect(total(response,'energy').amount).toBeCloseTo(347.5);
 });
});
