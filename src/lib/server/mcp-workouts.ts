import 'server-only';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import {idSchema,schemas} from '@/lib/domain/schema';
import type {Collection,StoredRecord,WorkoutSession} from '@/lib/domain/types';
import {getRecord,listRecords,saveRecord} from './records';
import {HttpError} from './http';
import {permissions,readAnnotations,writeAnnotations,requireScope,result,toolError,type McpAccess} from './mcp-shared';

const version=z.number().int().positive();
const named=z.string().trim().min(1).max(200);
const searchFields={query:z.string().max(200).default(''),limit:z.number().int().min(1).max(100).default(30)};
const mutationFields={expectedVersion:z.number().int().nonnegative(),mutationId:z.uuid()};
const recordFields={id:idSchema,version,updatedAt:z.iso.datetime({offset:true}),deleted:z.boolean().optional()};
const exerciseOutput=z.strictObject({...recordFields,collection:z.literal('exercises'),data:schemas.exercises});
const workoutOutput=z.strictObject({...recordFields,collection:z.literal('workouts'),data:schemas.workouts});
const exerciseSearchOutput=z.strictObject({records:z.array(z.strictObject({
 id:idSchema,name:z.string(),version,tracking:schemas.exercises.shape.tracking,primaryMuscle:z.string(),secondaryMuscles:z.array(z.string()),archived:z.boolean(),
}))});
const workoutSearchOutput=z.strictObject({records:z.array(z.strictObject({
 id:idSchema,title:z.string(),version,date:schemas.workouts.shape.date,startedAt:z.iso.datetime({offset:true}),status:schemas.workouts.shape.status,locationId:idSchema.nullable(),exerciseCount:z.number().int().nonnegative(),exerciseNames:z.array(z.string()),
}))});
const locationsOutput=z.strictObject({records:z.array(z.strictObject({id:idSchema,name:z.string(),version,archived:z.boolean()}))});

async function liveRecords<C extends Collection>(access:McpAccess,collection:C):Promise<StoredRecord<C>[]> {
 const records=await listRecords(access.db,access.ownerId,collection);
 return records.filter(record=>record.collection===collection&&!record.deleted) as StoredRecord<C>[];
}
function locationIds(workout:WorkoutSession|undefined) {
 return new Set(workout?[workout.locationId,...workout.exercises.map(exercise=>exercise.locationId)].filter((id):id is string=>typeof id==='string'):[]);
}
function assertUnique(values:string[],message:string) {
 if(new Set(values).size!==values.length)throw new HttpError(400,message);
}

async function saveWorkout(access:McpAccess,workout:WorkoutSession,expectedVersion:number,mutationId:string) {
 requireScope(access,'workouts:write');
 const current=await getRecord(access.db,access.ownerId,'workouts',workout.id) as StoredRecord<'workouts'>|null;
 // An old retry may already have committed. Let the shared atomic ledger return
 // its cached acknowledgement (or a conflict) before checking new references.
 if((current?.version??0)!==expectedVersion)return saveRecord(access.db,access.ownerId,'workouts',workout.id,workout,expectedVersion,mutationId);
 const prior=current?.data;
 assertUnique(workout.exercises.map(exercise=>exercise.id),'Workout exercise IDs must be unique.');
 for(const exercise of workout.exercises)assertUnique(exercise.sets.map(set=>set.id),'Set IDs must be unique within each exercise.');
 if(JSON.stringify([...workout.healthWorkoutIds].sort())!==JSON.stringify([...(prior?.healthWorkoutIds??[])].sort()))throw new HttpError(400,'Preserve existing Health workout links. This tool cannot add or change Health associations.');
 if(workout.routineId!==prior?.routineId)throw new HttpError(400,'Preserve the existing routine link. This tool cannot assign routines.');
 for(const exercise of workout.exercises){
  const previous=prior?.exercises.find(item=>item.id===exercise.id);
  if(JSON.stringify([...(exercise.healthWorkoutIds??[])].sort())!==JSON.stringify([...(previous?.healthWorkoutIds??[])].sort()))throw new HttpError(400,'Preserve existing Health workout links. This tool cannot add or change Health associations.');
  if(exercise.routineExerciseId!==previous?.routineExerciseId)throw new HttpError(400,'Preserve existing routine exercise links. New workout exercises must omit routineExerciseId.');
 }
 if(prior?.exercises.some(previous=>previous.healthWorkoutIds?.length&&!workout.exercises.some(exercise=>exercise.id===previous.id)))throw new HttpError(400,'Unlink this exercise from Apple Health in the app before removing it through MCP.');
 const previousExercises=new Set(prior?.exercises.map(exercise=>exercise.exerciseId)??[]);
 const addedExercises=new Set(workout.exercises.map(exercise=>exercise.exerciseId).filter(id=>!previousExercises.has(id)));
 const previousLocations=locationIds(prior);
 const addedLocations=[...locationIds(workout)].filter(id=>!previousLocations.has(id));
 const [exercises,locations]=await Promise.all([
  addedExercises.size?liveRecords(access,'exercises'):Promise.resolve([]),
  addedLocations.length?liveRecords(access,'locations'):Promise.resolve([]),
 ]);
 const knownExercises=new Set(exercises.map(record=>record.id));
 const knownLocations=new Set(locations.map(record=>record.id));
 if([...addedExercises].some(id=>!knownExercises.has(id)))throw new HttpError(400,'An exercise ID is unknown. Search exercises or save the new exercise definition before saving this workout.');
 if(addedLocations.some(id=>!knownLocations.has(id)))throw new HttpError(400,'A location ID is unknown. Use list_locations, or leave the location null if it is unknown.');
 return saveRecord(access.db,access.ownerId,'workouts',workout.id,workout,expectedVersion,mutationId);
}

export function registerWorkoutTools(server:McpServer,access:McpAccess) {
 async function get(collection:'exercises'|'workouts',id:string){
  requireScope(access,'workouts:read');
  const record=await getRecord(access.db,access.ownerId,collection,id);
  if(!record||record.deleted)throw new HttpError(404,'Record not found');
  return result(record);
 }
 server.registerTool('search_exercises',{
  description:'Search the exercise library by name and optional muscle group (primary or secondary). Returns existing IDs and versions. Use these IDs when adding exercises to a workout. Archived definitions are hidden unless includeArchived is true.',
  inputSchema:z.object({...searchFields,muscleGroup:z.string().max(200).optional(),includeArchived:z.boolean().default(false)}),
  outputSchema:exerciseSearchOutput,annotations:readAnnotations,_meta:permissions('workouts:read'),
 },async({query,muscleGroup,includeArchived,limit})=>{try{
  requireScope(access,'workouts:read');
  const records=await liveRecords(access,'exercises');
  const text=query.trim().toLowerCase();const muscle=muscleGroup?.trim().toLowerCase();
  return result({records:records.filter(({data})=>(includeArchived||!data.archived)&&data.name.toLowerCase().includes(text)&&(!muscle||[data.primaryMuscle,...data.secondaryMuscles].some(group=>group.toLowerCase()===muscle)))
   .sort((a,b)=>a.data.name.localeCompare(b.data.name)||a.id.localeCompare(b.id)).slice(0,limit)
   .map(({id,version,data})=>({id,version,name:data.name,tracking:data.tracking,primaryMuscle:data.primaryMuscle,secondaryMuscles:data.secondaryMuscles,archived:Boolean(data.archived)}))});
 }catch(error){return toolError(error);}});
 server.registerTool('get_exercise',{
  description:'Read a saved exercise definition, including tracking type, muscle groups, unilateral/per-hand flags, notes, and current server version.',
  inputSchema:z.object({id:idSchema}),outputSchema:exerciseOutput,annotations:readAnnotations,_meta:permissions('workouts:read'),
 },async({id})=>{try{return await get('exercises',id);}catch(error){return toolError(error);}});
 server.registerTool('save_exercise',{
  description:'Create or update an exercise definition. Search before creating to avoid duplicates. For a new definition use a fresh UUID and expectedVersion 0. For edits get_exercise first and preserve unmentioned fields. Muscle groups are free-form. This does not change snapshots in previously logged workouts. Reuse mutationId only for the same retry.',
  inputSchema:z.object({exercise:schemas.exercises.extend({name:named}),...mutationFields}),outputSchema:exerciseOutput,annotations:writeAnnotations,_meta:permissions('workouts:write'),
 },async({exercise,expectedVersion,mutationId})=>{try{
  requireScope(access,'workouts:write');
  return result(await saveRecord(access.db,access.ownerId,'exercises',exercise.id,exercise,expectedVersion,mutationId));
 }catch(error){return toolError(error);}});
 server.registerTool('search_workouts',{
  description:'Find workout sessions by title or exercise name, inclusive local-calendar date range, or saved gym. Set fromDate and toDate to the same YYYY-MM-DD for one day. Returns most recent first and preserves multiple workouts on the same day. Get a full workout before editing it.',
  inputSchema:z.object({...searchFields,fromDate:schemas.workouts.shape.date.optional(),toDate:schemas.workouts.shape.date.optional(),locationId:idSchema.optional()}).refine(input=>!input.fromDate||!input.toDate||input.fromDate<=input.toDate,{message:'fromDate must not be after toDate',path:['toDate']}),
  outputSchema:workoutSearchOutput,annotations:readAnnotations,_meta:permissions('workouts:read'),
 },async({query,fromDate,toDate,locationId,limit})=>{try{
  requireScope(access,'workouts:read');
  const records=await liveRecords(access,'workouts');const text=query.trim().toLowerCase();
  return result({records:records.filter(({data})=>(!fromDate||data.date>=fromDate)&&(!toDate||data.date<=toDate)&&(!locationId||locationIds(data).has(locationId))&&[data.title,...data.exercises.map(exercise=>exercise.name)].some(name=>name.toLowerCase().includes(text)))
   .sort((a,b)=>b.data.date.localeCompare(a.data.date)||Date.parse(b.data.startedAt)-Date.parse(a.data.startedAt)||a.id.localeCompare(b.id)).slice(0,limit)
   .map(({id,version,data})=>({id,version,title:data.title,date:data.date,startedAt:data.startedAt,status:data.status,locationId:data.locationId,exerciseCount:data.exercises.length,exerciseNames:data.exercises.map(exercise=>exercise.name)}))});
 }catch(error){return toolError(error);}});
 server.registerTool('get_workout',{
  description:'Read one complete workout session and its server version: exercises, equipment, locations, targets, actual sets, warmups, partial and L/R reps/loads, drops/rest pauses, cardio and notes. Unknown actuals remain null. Stored Health IDs are associations only; this does not expose imported Health data.',
  inputSchema:z.object({id:idSchema}),outputSchema:workoutOutput,annotations:readAnnotations,_meta:permissions('workouts:read'),
 },async({id})=>{try{return await get('workouts',id);}catch(error){return toolError(error);}});
 server.registerTool('save_workout',{
  description:'Create or replace one complete workout session. For edits call get_workout first: retain all existing exercise/set IDs and every unmentioned field. Use expectedVersion and a fresh mutationId; on 409 refetch and review instead of overwriting. For creation use a fresh workout UUID, expectedVersion 0, healthWorkoutIds [], and omit routine links. Use real exercise IDs from search/save_exercise and real gym IDs from list_locations. Every session exercise and set needs its own unique UUID. Omit exercise.locationId to inherit the session gym; null means no gym. Preserve existing Health/routine links on updates. Include explicit lb/kg units, local date and a known offset timestamp for startedAt; ask for unknown start times. Null/unfinished/fractional/L/R results are valid; never fill actuals from target reps. Targets are plans, not logged results. Library definitions are snapshots inside the workout. Keep mutationId unchanged only when retrying the identical request.',
  inputSchema:z.object({workout:schemas.workouts.extend({title:named}),...mutationFields}),outputSchema:workoutOutput,annotations:writeAnnotations,_meta:permissions('workouts:write'),
 },async({workout,expectedVersion,mutationId})=>{try{return result(await saveWorkout(access,workout,expectedVersion,mutationId));}catch(error){return toolError(error);}});
 server.registerTool('list_locations',{
  description:'Look up saved gyms/locations and their IDs for workout logging. Read-only; add a new gym in the app settings. Archived locations are hidden unless includeArchived is true.',
  inputSchema:z.object({includeArchived:z.boolean().default(false)}),outputSchema:locationsOutput,annotations:readAnnotations,_meta:permissions('workouts:read'),
 },async({includeArchived})=>{try{
  requireScope(access,'workouts:read');
  const records=await liveRecords(access,'locations');
  return result({records:records.filter(({data})=>includeArchived||!data.archived).sort((a,b)=>a.data.name.localeCompare(b.data.name)).map(({id,version,data})=>({id,version,name:data.name,archived:Boolean(data.archived)}))});
 }catch(error){return toolError(error);}});
}
