import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Collection,Collections,ExerciseDefinition,StoredRecord,WorkoutSession} from '@/lib/domain/types';

vi.mock('server-only',()=>({}));
const records=vi.hoisted(()=>({getRecord:vi.fn(),listRecords:vi.fn(),saveRecord:vi.fn()}));
vi.mock('./records',()=>records);

import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {createSantorioMcp} from './mcp';
import {HttpError} from './http';

const ownerId='cd45c36d-071a-4da7-9e5d-6f656a589408';
const ids={workout:'10000000-0000-4000-8000-000000000001',exercise:'20000000-0000-4000-8000-000000000001',location:'30000000-0000-4000-8000-000000000001',sessionExercise:'40000000-0000-4000-8000-000000000001',set:'50000000-0000-4000-8000-000000000001',health:'60000000-0000-4000-8000-000000000001',routine:'70000000-0000-4000-8000-000000000001',routineExercise:'80000000-0000-4000-8000-000000000001',mutation:'90000000-0000-4000-8000-000000000001'};
const secondId='00000000-0000-4000-8000-000000000002';
const db={} as SupabaseClient;
const storedRecords=new Map<string,StoredRecord>();

function stored<K extends Collection>(collection:K,data:Collections[K],version=1,deleted=false):StoredRecord<K>{
 return {collection,id:data.id,data,version,updatedAt:'2026-10-16T09:00:00Z',deleted};
}
function remember<K extends Collection>(collection:K,data:Collections[K],version=1,deleted=false){
 const record=stored(collection,data,version,deleted);
 storedRecords.set(`${collection}:${data.id}`,record);
 return record;
}
function definition():ExerciseDefinition{return {id:ids.exercise,name:'Preacher curl',tracking:'weight_reps',primaryMuscle:'Biceps',secondaryMuscles:[],perHand:true,unilateral:true,notes:''};}
function workout():WorkoutSession{
 return {id:ids.workout,date:'2026-10-15',title:'Back and biceps',locationId:ids.location,status:'active',startedAt:'2026-10-15T18:30:00-07:00',notes:'Keep partial sets',healthWorkoutIds:[],exercises:[{
  id:ids.sessionExercise,exerciseId:ids.exercise,name:'Preacher curl',tracking:'weight_reps',primaryMuscle:'Biceps',secondaryMuscles:[],equipment:'Preacher bench',perHand:true,unilateral:true,weightUnit:'lb',targets:{sets:3,reps:8,repsMax:10},notes:'',
  sets:[{id:ids.set,warmup:false,targetReps:8,targetRepsMax:10,segments:[{weight:20,reps:null,leftReps:8,rightReps:7.5},{weight:15,reps:null,leftReps:3,rightReps:2,link:'drop'},{weight:15,reps:null,leftReps:null,rightReps:1,link:'pause',restSeconds:20}],notes:'Left side unfinished'}],
 }]};
}
async function call(name:string,args:Record<string,unknown>,scopes=['workouts:read','workouts:write']){
 const server=createSantorioMcp({db,ownerId,scopes,clientId:'https://client.example/metadata.json'});
 const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
 await server.connect(transport);
 try{
  const response=await transport.handleRequest(new Request('https://santorio.example/api/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-11-25'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}));
  return await response.json();
 }finally{await server.close();}
}
const saveArgs=(value:WorkoutSession,expectedVersion=0)=>({workout:value,expectedVersion,mutationId:ids.mutation});

beforeEach(()=>{
 process.env.APP_URL='https://santorio.example';
 storedRecords.clear();
 records.getRecord.mockReset().mockImplementation(async(_db:SupabaseClient,_owner:string,collection:Collection,id:string)=>storedRecords.get(`${collection}:${id}`)??null);
 records.listRecords.mockReset().mockImplementation(async(_db:SupabaseClient,_owner:string,collection:Collection)=>[...storedRecords.values()].filter(record=>record.collection===collection));
 records.saveRecord.mockReset().mockImplementation(async(_db:SupabaseClient,_owner:string,collection:Collection,_id:string,data:Collections[Collection],expectedVersion:number)=>stored(collection,data,expectedVersion+1));
 remember('exercises',definition());
 remember('locations',{id:ids.location,name:'Crunch San Mateo'});
});

describe('MCP exercise and workout tools',()=>{
 it('requires workout read access even when nutrition read access exists',async()=>{
  for(const name of ['search_exercises','search_workouts','list_locations']){
   const response=await call(name,{},['nutrition:read']);
   expect(response.result.isError).toBe(true);
   expect(response.result._meta['mcp/www_authenticate'][0]).toContain('scope="workouts:read"');
  }
  expect(records.listRecords).not.toHaveBeenCalled();
  expect(records.getRecord).not.toHaveBeenCalled();
 });
 it('rejects writes with read-only scopes before any database work',async()=>{
  for(const [name,args] of [['save_exercise',{exercise:definition(),expectedVersion:0,mutationId:ids.mutation}],['save_workout',saveArgs(workout())]] as const){
   const response=await call(name,args,['workouts:read','nutrition:write']);
   expect(response.result.isError).toBe(true);
   expect(response.result._meta['mcp/www_authenticate'][0]).toContain('scope="workouts:write"');
  }
  expect(records.getRecord).not.toHaveBeenCalled();
  expect(records.listRecords).not.toHaveBeenCalled();
  expect(records.saveRecord).not.toHaveBeenCalled();
 });
 it('saves new exercise definitions through the owner-scoped record service',async()=>{
  const exercise={...definition(),id:secondId,name:'Single arm cable curl'};
  const response=await call('save_exercise',{exercise,expectedVersion:0,mutationId:ids.mutation});
  expect(response.result.isError).not.toBe(true);
  expect(response.result.structuredContent.data).toEqual(exercise);
  expect(records.saveRecord).toHaveBeenCalledWith(db,ownerId,'exercises',secondId,exercise,0,ids.mutation);
 });
 it('rejects blank exercise names and blank workout titles',async()=>{
  for(const [name,args] of [['save_exercise',{exercise:{...definition(),name:'   '},expectedVersion:0,mutationId:ids.mutation}],['save_workout',saveArgs({...workout(),title:'   '})]] as const){
   const response=await call(name,args);
   expect(response.result.isError).toBe(true);
  }
  expect(records.saveRecord).not.toHaveBeenCalled();
 });
 it('searches exercise muscle groups and hides archived definitions by default',async()=>{
  remember('exercises',{...definition(),id:secondId,name:'Cable curl',archived:true});
  remember('exercises',{...definition(),id:'00000000-0000-4000-8000-000000000003',name:'Bench press',primaryMuscle:'Chest',unilateral:false});
  const response=await call('search_exercises',{query:'curl',muscleGroup:'Biceps'});
  expect(response.result.structuredContent.records.map((record:{id:string})=>record.id)).toEqual([ids.exercise]);
  const includingArchived=await call('search_exercises',{query:'curl',includeArchived:true});
  expect(includingArchived.result.structuredContent.records.map((record:{id:string})=>record.id).sort()).toEqual([ids.exercise,secondId].sort());
 });
 it('lists known gyms without deleted or archived choices by default',async()=>{
  remember('locations',{id:secondId,name:'Old gym',archived:true});
  remember('locations',{id:'00000000-0000-4000-8000-000000000003',name:'Deleted gym'},2,true);
  const response=await call('list_locations',{});
  expect(response.result.structuredContent.records.map((record:{id:string})=>record.id)).toEqual([ids.location]);
  const archived=await call('list_locations',{includeArchived:true});
  expect(archived.result.structuredContent.records.map((record:{id:string})=>record.id).sort()).toEqual([ids.location,secondId].sort());
 });
 it('filters workout searches by dates and location without collapsing multiple sessions',async()=>{
  const first=workout();
  remember('workouts',first);
  remember('workouts',{...first,id:secondId,title:'Back and biceps evening',startedAt:'2026-10-15T20:30:00-07:00'});
  remember('workouts',{...first,id:'00000000-0000-4000-8000-000000000003',date:'2026-10-14'});
  remember('workouts',{...first,id:'00000000-0000-4000-8000-000000000004',locationId:null});
  const response=await call('search_workouts',{query:'biceps',fromDate:'2026-10-15',toDate:'2026-10-15',locationId:ids.location});
  expect(response.result.structuredContent.records.map((record:{id:string})=>record.id).sort()).toEqual([ids.workout,secondId].sort());
 });
 it('retrieves complete workout data and the server version before an edit',async()=>{
  const value=workout();
  const existing=remember('workouts',value,7);
  const response=await call('get_workout',{id:value.id});
  expect(response.result.structuredContent).toEqual(existing);
  expect(records.getRecord).toHaveBeenCalledWith(db,ownerId,'workouts',value.id);
 });
 it('saves partial unilateral sets, fractional reps and drop/pause segments without inventing results',async()=>{
  const value=workout();
  const response=await call('save_workout',saveArgs(value));
  expect(response.result.isError).not.toBe(true);
  expect(response.result.structuredContent.data).toEqual(value);
  expect(records.saveRecord).toHaveBeenCalledWith(db,ownerId,'workouts',value.id,value,0,ids.mutation);
 });
 it('rejects an invented exercise reference',async()=>{
  storedRecords.delete(`exercises:${ids.exercise}`);
  const response=await call('save_workout',saveArgs(workout()));
  expect(response.result.isError).toBe(true);
  expect(records.saveRecord).not.toHaveBeenCalled();
 });
 it('rejects invented workout and exercise-level gym references',async()=>{
  const value=workout();
  for(const candidate of [{...value,locationId:secondId},{...value,exercises:[{...value.exercises[0],locationId:secondId}]}]){
   const response=await call('save_workout',saveArgs(candidate));
   expect(response.result.isError).toBe(true);
  }
  expect(records.saveRecord).not.toHaveBeenCalled();
 });
 it('preserves inherited versus explicitly absent exercise locations',async()=>{
  const value=workout();
  value.exercises.push({...value.exercises[0],id:secondId,locationId:null,sets:[]});
  const response=await call('save_workout',saveArgs(value));
  expect(response.result.isError).not.toBe(true);
  const saved=response.result.structuredContent.data;
  expect(saved.exercises[0]).not.toHaveProperty('locationId');
  expect(saved.exercises[1].locationId).toBeNull();
 });
 it('permits notes edits while preserving deleted historical definition and gym references',async()=>{
  const existing=workout();
  remember('workouts',existing,4);
  storedRecords.delete(`exercises:${ids.exercise}`);
  storedRecords.delete(`locations:${ids.location}`);
  const updated={...existing,notes:'Remembered a detail'};
  const response=await call('save_workout',saveArgs(updated,4));
  expect(response.result.isError).not.toBe(true);
  expect(records.saveRecord).toHaveBeenCalledWith(db,ownerId,'workouts',updated.id,updated,4,ids.mutation);
 });
 it('rejects duplicate exercise or set IDs inside one workout',async()=>{
  const value=workout();
  const duplicates=[{...value,exercises:[value.exercises[0],value.exercises[0]]},{...value,exercises:[{...value.exercises[0],sets:[value.exercises[0].sets[0],value.exercises[0].sets[0]]}]}];
  for(const candidate of duplicates){
   const response=await call('save_workout',saveArgs(candidate));
   expect(response.result.isError).toBe(true);
  }
  expect(records.saveRecord).not.toHaveBeenCalled();
 });
 it('does not let newly created workouts invent Health or routine associations',async()=>{
  const value=workout();
  const candidates=[{...value,exercises:[{...value.exercises[0],healthWorkoutIds:[ids.health]}]},{...value,healthWorkoutIds:[ids.health]},{...value,routineId:ids.routine},{...value,exercises:[{...value.exercises[0],routineExerciseId:ids.routineExercise}]}];
  for(const candidate of candidates){
   const response=await call('save_workout',saveArgs(candidate));
   expect(response.result.isError).toBe(true);
  }
  expect(records.saveRecord).not.toHaveBeenCalled();
 });
 it('preserves existing Health and routine links and rejects reassignment',async()=>{
  const existing={...workout(),healthWorkoutIds:[ids.health],routineId:ids.routine};
  existing.exercises[0].routineExerciseId=ids.routineExercise;
  remember('workouts',existing,3);
  const preserved=await call('save_workout',saveArgs({...existing,notes:'Updated notes'},3));
  expect(preserved.result.isError).not.toBe(true);
  records.saveRecord.mockClear();
  for(const candidate of [{...existing,healthWorkoutIds:[]},{...existing,routineId:secondId},{...existing,exercises:[{...existing.exercises[0],routineExerciseId:secondId}]}]){
   const response=await call('save_workout',saveArgs(candidate,3));
   expect(response.result.isError).toBe(true);
  }
  expect(records.saveRecord).not.toHaveBeenCalled();
 });
 it('preserves exercise-level Watch links and rejects reassignment or removal through MCP',async()=>{
  const existing=workout();
  existing.exercises[0].healthWorkoutIds=[ids.health];
  remember('workouts',existing,3);
  const preserved=await call('save_workout',saveArgs({...existing,notes:'Updated notes'},3));
  expect(preserved.result.isError).not.toBe(true);
  records.saveRecord.mockClear();
  for(const candidate of [{...existing,exercises:[]},{...existing,exercises:[{...existing.exercises[0],healthWorkoutIds:[]}]},{...existing,exercises:[{...existing.exercises[0],healthWorkoutIds:[secondId]}]}]){
   const response=await call('save_workout',saveArgs(candidate,3));
   expect(response.result.isError).toBe(true);
  }
  expect(records.saveRecord).not.toHaveBeenCalled();
 });
 it('lets the shared service return an idempotent acknowledgment before obsolete reference validation',async()=>{
  const original=workout();
  remember('workouts',{...original,notes:'A newer change'},5);
  storedRecords.delete(`exercises:${ids.exercise}`);
  storedRecords.delete(`locations:${ids.location}`);
  const acknowledgment=stored('workouts',original,4);
  records.saveRecord.mockResolvedValueOnce(acknowledgment);
  const response=await call('save_workout',saveArgs(original,3));
  expect(response.result.isError).not.toBe(true);
  expect(response.result.structuredContent).toEqual(acknowledgment);
  expect(records.getRecord).toHaveBeenCalledTimes(1);
  expect(records.getRecord).toHaveBeenCalledWith(db,ownerId,'workouts',original.id);
  expect(records.saveRecord).toHaveBeenCalledWith(db,ownerId,'workouts',original.id,original,3,ids.mutation);
 });
 it('returns the shared version conflict and current record instead of overwriting newer sets',async()=>{
  const original=workout();
  const current=remember('workouts',{...original,notes:'Logged from phone'},5);
  records.saveRecord.mockRejectedValueOnce(new HttpError(409,'This record changed elsewhere. Review the latest version before saving.',{current}));
  const response=await call('save_workout',saveArgs(original,3));
  expect(response.result.isError).toBe(true);
  const error=JSON.parse(response.result.content[0].text);
  expect(error.status).toBe(409);
  expect(error.current).toEqual(current);
  expect(records.saveRecord).toHaveBeenCalledTimes(1);
 });
});
