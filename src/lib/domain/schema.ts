import { z } from 'zod';
import type { Collection, Collections } from './types';
import { validateFood, ingredientIssues } from './nutrition';

const text = z.string().max(2000);
const name = z.string().max(200);
export const idSchema = z.string().regex(/^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|profile|\d{4}-\d{2}-\d{2})$/i);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s, 'Invalid date');
const timestamp = z.iso.datetime({ offset: true });
const positive = z.number().finite().nonnegative().max(1e9);
const optionalNumber = positive.nullable();
const source = z.enum(['manual', 'apple_health']);
const tracking = z.enum(['weight_reps','assisted_reps','reps','duration','cardio']);
const entity = { id: idSchema };
const unit = z.string().min(1).max(30);
const targets = z.strictObject({ sets: z.number().int().min(0).max(100), reps: optionalNumber, repsMax: optionalNumber.optional() });
const segment = z.strictObject({ weight: optionalNumber, reps: optionalNumber, leftReps: optionalNumber.optional(), rightReps: optionalNumber.optional(), leftWeight: optionalNumber.optional(), rightWeight: optionalNumber.optional(), link: z.enum(['drop','pause']).optional(), restSeconds: optionalNumber.optional() });
const trainingSet = z.strictObject({ ...entity, warmup: z.boolean(), segments: z.array(segment).max(30), notes: text.optional(), targetReps: optionalNumber.optional(), targetRepsMax: optionalNumber.optional(), durationMinutes: optionalNumber.optional(), completed: z.boolean().optional() });
const sessionExercise = z.strictObject({ ...entity, exerciseId: idSchema, routineExerciseId: idSchema.optional(), name, tracking, primaryMuscle: name, secondaryMuscles: z.array(name).max(30), equipment: name, locationId: idSchema.nullable().optional(), perHand: z.boolean(), unilateral: z.boolean(), weightUnit: z.enum(['lb','kg']), targets, sets: z.array(trainingSet).max(100), notes: text, healthWorkoutIds:z.array(idSchema).max(100).optional(), cardio: z.strictObject({minutes:optionalNumber,distance:optionalNumber,distanceUnit:z.enum(['mi','km']),speed:optionalNumber,incline:z.number().finite().min(-100).max(100).nullable()}).optional() });
export const nutrientSchema = z.strictObject({ key: z.string().regex(/^[a-z][a-z0-9_]{0,79}$/), label: name, unit, amount: optionalNumber, source: z.string().max(2000).optional(), estimated: z.boolean().optional() });
export const foodSchema = z.strictObject({ ...entity, name, brand: name, revision: z.number().int().positive(), basis: z.strictObject({quantity: z.number().positive().max(1e9),unit,grams:z.number().positive().max(1e9).nullable().optional()}), nutrients:z.array(nutrientSchema).max(300), sourceUrl: z.string().max(2000), notes:text,ingredientsText:z.string().max(10000),archived:z.boolean().optional() }).superRefine((food, ctx) => {
  for (const message of validateFood(food)) ctx.addIssue({code:'custom',message,path:['nutrients']});
  const seen = new Set<string>();
  for (const nutrient of food.nutrients) {
    if (seen.has(nutrient.key)) ctx.addIssue({code:'custom',message:`Duplicate nutrient ${nutrient.key}`,path:['nutrients']});
    seen.add(nutrient.key);
  }
  for (const [key, unit] of Object.entries({energy:'kcal',protein:'g',carbs:'g',fat:'g'})) {
    if (!food.nutrients.some(n => n.key === key && n.unit === unit && n.amount !== null)) ctx.addIssue({code:'custom',message:`${key} requires a known amount in ${unit}`,path:['nutrients']});
  }
});
export const ingredientSchema = z.strictObject({ ...entity,food:foodSchema,quantity:positive,unit,note:text.optional() });
const ingredients = z.array(ingredientSchema).max(100);
export const recipeSchema = z.strictObject({ ...entity,name,familyId:idSchema.optional(),revision:z.number().int().positive(),ingredients,anchorIngredientId:idSchema.nullable(),notes:text,archived:z.boolean().optional() });
export const schemas = {
  profiles: z.strictObject({id:z.literal('profile'),name,birthday:z.union([z.literal(''),date]),sex:z.enum(['male','female']).nullable(),heightCm:optionalNumber,heightSource:source,heightUpdatedAt:timestamp.optional(),activity:z.enum(['sedentary','light','moderate','very']),weightUnit:z.enum(['lb','kg']),timezone:z.string().max(100).refine(s=>{try{new Intl.DateTimeFormat('en',{timeZone:s});return true;}catch{return false;}},'Invalid time zone'),defaultLocationId:idSchema.optional(),goals:z.strictObject({balanceTarget:z.number().finite().min(-10000).max(10000),proteinG:positive,steps:positive,waterL:positive}),onboardingComplete:z.boolean()}),
  locations:z.strictObject({...entity,name,notes:text.optional(),archived:z.boolean().optional()}),
  exercises:z.strictObject({...entity,name,tracking,primaryMuscle:name,secondaryMuscles:z.array(name).max(30),perHand:z.boolean(),unilateral:z.boolean(),notes:text.optional(),archived:z.boolean().optional()}),
  routines:z.strictObject({...entity,name,locationId:idSchema.nullable(),exercises:z.array(sessionExercise).max(100),notes:text}),
  workouts:z.strictObject({...entity,date,title:name,locationId:idSchema.nullable(),status:z.enum(['active','complete']),startedAt:timestamp.optional(),completedAt:timestamp.optional(),notes:text,exercises:z.array(sessionExercise).max(100),routineId:idSchema.optional(),healthWorkoutIds:z.array(idSchema).max(100)}),
  foods:foodSchema,
  recipes:recipeSchema,
  batches:z.strictObject({...entity,name,date,recipeId:idSchema.nullable(),ingredients,anchorIngredientId:idSchema.nullable(),notes:text,archived:z.boolean().optional()}),
  diary:z.strictObject({...entity,date,time:z.union([z.literal(''),z.string().regex(/^\d{2}:\d{2}$/).refine(t=>Number(t.slice(0,2))<24&&Number(t.slice(3))<60)]),meal:z.enum(['Breakfast','Lunch','Dinner','Snack','Supplements']),name,kind:z.enum(['food','prep']),ingredients,multiplier:positive,estimated:z.boolean(),portionCustomized:z.boolean().optional(),batchId:idSchema.nullable(),anchorIngredientId:idSchema.nullable(),notes:text}),
  metrics:z.strictObject({...entity,date,steps:optionalNumber,waterL:positive,activeEnergy:optionalNumber,restingEnergy:optionalNumber,exerciseMinutes:optionalNumber,source,importedAt:timestamp.optional(),completeDay:z.boolean().optional(),healthSources:z.strictObject({steps:z.string().max(500).optional(),activeEnergy:z.string().max(500).optional(),restingEnergy:z.string().max(500).optional(),exerciseMinutes:z.string().max(500).optional()}).optional()}),
  measurements:z.strictObject({...entity,date,kind:z.enum(['weight_kg','height_cm']),value:z.number().positive().max(10000),source,recordedAt:timestamp}),
  healthWorkouts:z.strictObject({...entity,externalId:z.string().min(1).max(200),date,name,start:timestamp,end:timestamp,durationMinutes:positive,activeEnergy:optionalNumber,totalEnergy:optionalNumber,heartRate:z.array(z.strictObject({time:timestamp,bpm:z.number().positive().max(400),min:z.number().positive().max(400).optional(),max:z.number().positive().max(400).optional()})).max(30000),importedAt:timestamp,heartRateSummary:z.strictObject({min:z.number().positive().max(400).optional(),avg:z.number().positive().max(400).optional(),max:z.number().positive().max(400).optional()}).optional(),sourceName:name.optional(),sourceIdentifier:z.string().max(500).optional(),isIndoor:z.boolean().optional(),distanceKm:positive.optional()})
} satisfies Record<Collection,z.ZodType>;
export const collectionSchema = z.enum(Object.keys(schemas) as [Collection,...Collection[]]);
export function validateRecord<K extends Collection>(collection: K, data: unknown): Collections[K] {
  const result = schemas[collection].parse(data) as Collections[K];
  if ('ingredients' in result && 'anchorIngredientId' in result && result.anchorIngredientId && !result.ingredients.some(i=>i.id===result.anchorIngredientId)) throw new z.ZodError([{code:'custom',path:['anchorIngredientId'],message:'Anchor must refer to an ingredient in this record'}]);
  if ('ingredients' in result) {
    const issues = ingredientIssues(result.ingredients);
    if (new Set(result.ingredients.map(i=>i.id)).size !== result.ingredients.length) issues.push('Ingredient IDs must be unique');
    if (issues.length) throw new z.ZodError(issues.map(message=>({code:'custom' as const,path:['ingredients'],message})));
  }
  if (collection==='workouts') {
    const workout=result as Collections['workouts'];
    const links=[...workout.healthWorkoutIds,...workout.exercises.flatMap(e=>e.healthWorkoutIds??[])];
    if (new Set(links).size!==links.length) throw new z.ZodError([{code:'custom',path:['healthWorkoutIds'],message:'A Watch workout can be linked only once within a session'}]);
  }
  if (collection==='routines' && (result as Collections['routines']).exercises.some(e=>e.healthWorkoutIds?.length)) throw new z.ZodError([{code:'custom',path:['exercises'],message:'Routines cannot contain Watch workout associations'}]);
  if (collection==='metrics' && 'date' in result && result.id!==result.date) throw new z.ZodError([{code:'custom',path:['id'],message:'Daily metrics ID must match its date'}]);
  return result;
}
export const mutationSchema = z.strictObject({ expectedVersion:z.number().int().nonnegative(), mutationId:z.uuid(), data:z.unknown().optional() });
