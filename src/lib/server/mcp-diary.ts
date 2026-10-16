import 'server-only';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import {idSchema,schemas,validateRecord} from '@/lib/domain/schema';
import {cloneIngredients,nutrientTotals,portionFraction,REQUIRED_NUTRIENTS} from '@/lib/domain/nutrition';
import type {DiaryEntry,StoredRecord} from '@/lib/domain/types';
import {getRecord,listRecords,replayRecordMutation,saveRecord} from './records';
import {hash} from './security';
import {HttpError} from './http';
import {permissions,readAnnotations,writeAnnotations,requireScope,result,toolError,type McpAccess} from './mcp-shared';

const version=z.number().int().positive();
const positive=z.number().positive().max(1e9);
const named=z.string().trim().min(1).max(200);
const unit=z.string().trim().min(1).max(30);
const recordFields={id:idSchema,version,updatedAt:z.iso.datetime({offset:true}),deleted:z.boolean().optional()};
const totalSchema=z.strictObject({key:z.string(),label:z.string(),unit:z.string(),group:z.string(),amount:z.number().nullable(),partial:z.boolean(),estimated:z.boolean(),known:z.number().int().nonnegative(),total:z.number().int().nonnegative()});
const totalsSchema=z.array(totalSchema);
const diaryOutput=z.strictObject({...recordFields,collection:z.literal('diary'),data:schemas.diary,totals:totalsSchema});
const batchOutput=z.strictObject({...recordFields,collection:z.literal('batches'),data:schemas.batches,totals:totalsSchema});
const searchFields={query:z.string().max(200).default(''),dateFrom:schemas.diary.shape.date.optional(),dateTo:schemas.diary.shape.date.optional(),limit:z.number().int().min(1).max(100).default(30)};
const foodPortion=z.strictObject({foodId:idSchema,foodVersion:version,quantity:positive,unit,note:z.string().max(2000).optional()});
const logInput=z.strictObject({
 id:z.uuid(),date:schemas.diary.shape.date,time:schemas.diary.shape.time.default(''),meal:schemas.diary.shape.meal,name:named,
 estimated:z.boolean().describe('True when the consumed amount is approximate.'),notes:z.string().max(2000).default(''),mutationId:z.uuid(),
 source:z.discriminatedUnion('kind',[
  z.strictObject({kind:z.literal('foods'),items:z.array(foodPortion).min(1).max(100)}),
  z.strictObject({kind:z.literal('batch'),batchId:idSchema,batchVersion:version,portion:z.discriminatedUnion('kind',[
   z.strictObject({kind:z.literal('fraction'),fraction:positive}),
   z.strictObject({kind:z.literal('anchor'),quantity:positive,unit}),
  ])}),
 ]),
});
const editableEntry=schemas.diary.extend({name:named,ingredients:schemas.diary.shape.ingredients.min(1),multiplier:positive});

function withTotals(record:StoredRecord<'diary'>|StoredRecord<'batches'>) {
 return {...record,totals:nutrientTotals(record.data.ingredients,'multiplier' in record.data?record.data.multiplier:1)};
}
function checkRange(dateFrom?:string,dateTo?:string) {
 if(dateFrom&&dateTo&&dateFrom>dateTo)throw new HttpError(400,'dateFrom must be on or before dateTo');
}
async function sourceRecord<C extends 'foods'|'batches'>(access:McpAccess,collection:C,id:string,expectedVersion:number):Promise<StoredRecord<C>> {
 const record=await getRecord(access.db,access.ownerId,collection,id) as StoredRecord<C>|null;
 if(!record||record.deleted||record.data.archived)throw new HttpError(404,`The selected ${collection==='foods'?'food':'batch'} is unavailable`);
 if(record.version!==expectedVersion)throw new HttpError(409,'The food or batch changed. Read its latest version and review the portion before logging.',{current:record});
 return record;
}

async function logMeal(access:McpAccess,input:z.infer<typeof logInput>) {
 requireScope(access,'nutrition:write');
 // Fingerprint the caller's stable request, not mutable library data. A retry
 // must acknowledge the original meal even if its food has since been edited.
 const fingerprint=hash(JSON.stringify({operation:'mcp.log_meal.v1',input}));
 const replay=await replayRecordMutation(access.db,access.ownerId,input.mutationId,fingerprint);
 if(replay)return replay as StoredRecord<'diary'>;
 try {
  const {id,date,time,meal,name,estimated,notes,source}=input;
  let entry:DiaryEntry;
  if(source.kind==='foods') {
   const sources=new Map<string,StoredRecord<'foods'>>();
   for(const item of source.items) {
    let record=sources.get(item.foodId);
    if(!record){record=await sourceRecord(access,'foods',item.foodId,item.foodVersion);sources.set(item.foodId,record);}
    if(record.version!==item.foodVersion)throw new HttpError(400,'Use one current version for each food in a meal');
   }
   entry={id,date,time,meal,name,estimated,notes,kind:'food',batchId:null,anchorIngredientId:null,multiplier:1,
    ingredients:source.items.map(item=>({id:randomUUID(),food:structuredClone(sources.get(item.foodId)!.data),quantity:item.quantity,unit:item.unit,...(item.note===undefined?{}:{note:item.note})}))};
  } else {
   const {data:batch}=await sourceRecord(access,'batches',source.batchId,source.batchVersion);
   const fraction=source.portion.kind==='fraction'?source.portion.fraction:portionFraction(batch,source.portion.quantity,source.portion.unit);
   if(fraction===null||!Number.isFinite(fraction)||fraction<=0)throw new HttpError(400,'This batch has no compatible portion anchor. Use a fraction of the full batch instead.');
   entry={id,date,time,meal,name,estimated,notes,kind:'prep',batchId:batch.id,anchorIngredientId:batch.anchorIngredientId,
    ingredients:cloneIngredients(batch.ingredients),multiplier:fraction};
  }
  // Match the app's validation and nutrient math; neither volume-to-mass guesses
  // nor empty meals may reach the record store.
  validateRecord('diary',editableEntry.parse(entry));
  return await saveRecord(access.db,access.ownerId,'diary',entry.id,entry,0,input.mutationId,false,fingerprint) as StoredRecord<'diary'>;
 } catch(error) {
  // A concurrent identical call may have committed while we resolved sources.
  const completed=await replayRecordMutation(access.db,access.ownerId,input.mutationId,fingerprint);
  if(completed)return completed as StoredRecord<'diary'>;
  throw error;
 }
}

export function registerDiaryTools(server:McpServer,access:McpAccess) {
 server.registerTool('search_diary',{
  description:'Find logged meals in the food diary by inclusive local date range, meal category, and name or ingredient text. Search before logging to avoid duplicates. Results include entry IDs, versions and macro totals; get_diary_entry returns full nutrient details. An empty result means no matching diary entries, not an empty food library.',
  inputSchema:z.strictObject({...searchFields,meal:schemas.diary.shape.meal.optional()}),
  outputSchema:z.strictObject({records:z.array(z.strictObject({id:idSchema,version,date:schemas.diary.shape.date,time:schemas.diary.shape.time,meal:schemas.diary.shape.meal,name:z.string(),kind:schemas.diary.shape.kind,estimated:z.boolean(),totals:totalsSchema})),hasMore:z.boolean()}),
  annotations:readAnnotations,_meta:permissions('nutrition:read'),
 },async({query,dateFrom,dateTo,meal,limit})=>{try{
  requireScope(access,'nutrition:read');checkRange(dateFrom,dateTo);
  const text=query.trim().toLowerCase();
  const matches=(await listRecords(access.db,access.ownerId,'diary') as StoredRecord<'diary'>[])
   .filter(({deleted,data})=>!deleted&&(!dateFrom||data.date>=dateFrom)&&(!dateTo||data.date<=dateTo)&&(!meal||data.meal===meal)&&[data.name,...data.ingredients.map(i=>i.food.name)].some(name=>name.toLowerCase().includes(text)))
   .sort((a,b)=>b.data.date.localeCompare(a.data.date)||b.data.time.localeCompare(a.data.time)||a.id.localeCompare(b.id));
  return result({records:matches.slice(0,limit).map(({id,version,data})=>({id,version,date:data.date,time:data.time,meal:data.meal,name:data.name,kind:data.kind,estimated:data.estimated,
   totals:nutrientTotals(data.ingredients,data.multiplier).filter(n=>REQUIRED_NUTRIENTS.includes(n.key as typeof REQUIRED_NUTRIENTS[number]))})),hasMore:matches.length>limit});
 }catch(error){return toolError(error);}});
 server.registerTool('get_diary_entry',{
  description:'Read a logged meal, its immutable ingredient/nutrient snapshots, portion multiplier, current server version and full calculated nutrient totals. Unknown nutrients remain null; partial marks incomplete totals. Use this before editing, preserving unmentioned fields and ingredient IDs.',
  inputSchema:z.strictObject({id:idSchema}),outputSchema:diaryOutput,annotations:readAnnotations,_meta:permissions('nutrition:read'),
 },async({id})=>{try{
  requireScope(access,'nutrition:read');const record=await getRecord(access.db,access.ownerId,'diary',id) as StoredRecord<'diary'>|null;
  if(!record||record.deleted)throw new HttpError(404,'Diary entry not found');return result(withTotals(record));
 }catch(error){return toolError(error);}});
 server.registerTool('log_meal',{
  description:'Log one physical dish (or one standalone item) to the daily food diary, in Breakfast/Lunch/Dinner/Snack/Supplements. Items eaten alongside each other are separate log_meal calls; a dish lists its components as items. Keep the user’s own amounts in notes. See get_logging_guide. Use source kind foods with saved food IDs, current record versions and consumed quantities; serving means one full nutrient basis, fl oz is volume and oz is mass. Or use kind batch with an existing batch ID/version and a fraction of the entire batch (0.2 = one fifth), or an amount of its anchor ingredient (e.g. dry pasta oz). The server copies nutrient snapshots and calculates totals. Search the diary first; supply a fresh entry UUID and mutationId, reusing BOTH with the identical request on retries. The date is the user’s local YYYY-MM-DD; omit time if unknown. estimated indicates approximate portion size. This creates a diary entry, not just a library record. For edits use get_diary_entry then save_diary_entry. Never invent foods, quantities, or zero values for unknown nutrients.',
  inputSchema:logInput,outputSchema:diaryOutput,annotations:{...writeAnnotations,destructiveHint:false},_meta:permissions('nutrition:write'),
 },async(input)=>{try{return result(withTotals(await logMeal(access,input)));}catch(error){return toolError(error);}});
 server.registerTool('save_diary_entry',{
  description:'Edit an existing logged meal using the complete entry from get_diary_entry and its current expectedVersion (at least 1). Preserve kind, batchId, existing ingredient IDs/food snapshots and all unmentioned fields; do not refresh old meals from the food library. For an added/replacement ingredient, use a fresh ingredient UUID and the complete current food from get_food. For a batch portion the ingredients describe the FULL batch and multiplier is the eaten fraction: never scale both. For one-off plate changes, first multiply each ingredient quantity by the old multiplier, then set multiplier=1, anchorIngredientId=null and portionCustomized=true. Reuse mutationId only for an identical retry. For new meals use log_meal.',
  inputSchema:z.strictObject({entry:editableEntry,expectedVersion:version,mutationId:z.uuid()}),outputSchema:diaryOutput,annotations:writeAnnotations,_meta:permissions('nutrition:write'),
 },async({entry,expectedVersion,mutationId})=>{try{
  requireScope(access,'nutrition:write');
  const current=await getRecord(access.db,access.ownerId,'diary',entry.id) as StoredRecord<'diary'>|null;
  // Let an already committed retry reach the atomic ledger before reference checks.
  if(current?.version===expectedVersion&&current.deleted)throw new HttpError(404,'Diary entry not found');
  if(current?.version===expectedVersion) {
   if(entry.kind!==current.data.kind||entry.batchId!==current.data.batchId)throw new HttpError(400,'Preserve the existing meal kind and batch link');
   for(const ingredient of entry.ingredients) {
    const previous=current.data.ingredients.find(item=>item.id===ingredient.id);
    if(previous) {
     if(!isDeepStrictEqual(ingredient.food,previous.food))throw new HttpError(400,'Preserve food snapshots for existing ingredient IDs. Use a new ingredient ID for a replacement food.');
    } else {
     const food=await getRecord(access.db,access.ownerId,'foods',ingredient.food.id) as StoredRecord<'foods'>|null;
     if(!food||food.deleted||food.data.archived||!isDeepStrictEqual(food.data,ingredient.food))throw new HttpError(409,'A new ingredient must use the complete current food from get_food');
    }
   }
  }
  return result(withTotals(await saveRecord(access.db,access.ownerId,'diary',entry.id,entry,expectedVersion,mutationId) as StoredRecord<'diary'>));
 }catch(error){return toolError(error);}});
 server.registerTool('search_batches',{
  description:'Find existing meal-prep batches by name and inclusive preparation-date range. Returns batch IDs and current record versions for logging a portion with log_meal. Archived or deleted batches are excluded. Templates are available separately through search_recipes.',
  inputSchema:z.strictObject(searchFields),
  outputSchema:z.strictObject({records:z.array(z.strictObject({id:idSchema,version,name:z.string(),date:schemas.batches.shape.date,anchorIngredientId:idSchema.nullable()})),hasMore:z.boolean()}),annotations:readAnnotations,_meta:permissions('nutrition:read'),
 },async({query,dateFrom,dateTo,limit})=>{try{
  requireScope(access,'nutrition:read');checkRange(dateFrom,dateTo);const text=query.trim().toLowerCase();
  const matches=(await listRecords(access.db,access.ownerId,'batches') as StoredRecord<'batches'>[])
   .filter(({deleted,data})=>!deleted&&!data.archived&&data.name.toLowerCase().includes(text)&&(!dateFrom||data.date>=dateFrom)&&(!dateTo||data.date<=dateTo))
   .sort((a,b)=>b.data.date.localeCompare(a.data.date)||a.id.localeCompare(b.id));
  return result({records:matches.slice(0,limit).map(({id,version,data})=>({id,version,name:data.name,date:data.date,anchorIngredientId:data.anchorIngredientId})),hasMore:matches.length>limit});
 }catch(error){return toolError(error);}});
 server.registerTool('get_batch',{
  description:'Get an existing meal-prep batch with its ingredient snapshots, portion anchor, current record version and nutrient totals for the WHOLE batch. Pass a fraction or anchor amount to log_meal to log only the eaten portion. Batch creation/editing remains in the app.',
  inputSchema:z.strictObject({id:idSchema}),outputSchema:batchOutput,annotations:readAnnotations,_meta:permissions('nutrition:read'),
 },async({id})=>{try{
  requireScope(access,'nutrition:read');const record=await getRecord(access.db,access.ownerId,'batches',id) as StoredRecord<'batches'>|null;
  if(!record||record.deleted)throw new HttpError(404,'Batch not found');return result(withTotals(record));
 }catch(error){return toolError(error);}});
}
