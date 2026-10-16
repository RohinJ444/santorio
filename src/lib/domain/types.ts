/** Shared application contract. Each aggregate is saved atomically and versioned by the API. */
export type Entity = { id: string };
export type Source = 'manual' | 'apple_health';
export type ProfileRecord = Entity & {
  name: string; birthday: string; sex: 'male' | 'female' | null;
  heightCm: number | null; heightSource: Source; heightUpdatedAt?: string;
  activity: 'sedentary' | 'light' | 'moderate' | 'very';
  weightUnit: 'lb' | 'kg'; timezone: string; defaultLocationId?: string;
  goals: { balanceTarget: number; proteinG: number; steps: number; waterL: number };
  onboardingComplete: boolean;
};
export type Location = Entity & { name: string; notes?: string; archived?: boolean };
export type Tracking = 'weight_reps' | 'assisted_reps' | 'reps' | 'duration' | 'cardio';
export type ExerciseDefinition = Entity & {
  name: string; tracking: Tracking; primaryMuscle: string; secondaryMuscles: string[];
  perHand: boolean; unilateral: boolean; notes?: string; archived?: boolean;
};
export type Targets = { sets: number; reps: number | null; repsMax?: number | null };
export type SetSegment = {
  weight: number | null; reps: number | null;
  leftReps?: number | null; rightReps?: number | null;
  leftWeight?: number | null; rightWeight?: number | null;
  link?: 'drop' | 'pause'; restSeconds?: number | null;
};
export type TrainingSet = Entity & {
  warmup: boolean; completed?: boolean; segments: SetSegment[]; notes?: string;
  targetReps?: number | null; targetRepsMax?: number | null;
  durationMinutes?: number | null;
};
export type SessionExercise = Entity & {
  exerciseId: string; routineExerciseId?: string; name: string; tracking: Tracking;
  primaryMuscle: string; secondaryMuscles: string[];
  equipment: string; locationId?: string | null; perHand: boolean; unilateral: boolean;
  weightUnit: 'lb' | 'kg'; targets: Targets; sets: TrainingSet[]; notes: string;
  healthWorkoutIds?: string[];
  cardio?: { minutes: number | null; distance: number | null; distanceUnit: 'mi' | 'km'; speed: number | null; incline: number | null };
};
export type WorkoutSession = Entity & {
  date: string; title: string; locationId: string | null; status: 'active' | 'complete';
  startedAt: string; completedAt?: string; notes: string; exercises: SessionExercise[];
  routineId?: string; healthWorkoutIds: string[];
};
export type Routine = Entity & { name: string; locationId: string | null; exercises: SessionExercise[]; notes: string };
/** Unknown is null/absent. Never fill unreported nutrients with zero. */
export type NutrientValue = { key: string; label: string; unit: string; amount: number | null; source?: string; estimated?: boolean };
export type FoodRecord = Entity & {
  name: string; brand: string; revision: number;
  basis: { quantity: number; unit: string; grams?: number | null };
  nutrients: NutrientValue[]; sourceUrl: string; notes: string; ingredientsText: string;
  archived?: boolean;
};
/** An ingredient holds its food revision in full, preserving historic nutrition and conversions. */
export type RecipeIngredient = Entity & { food: FoodRecord; quantity: number; unit: string; note?: string };
export type RecipeRecord = Entity & {
  name: string; familyId?: string; revision: number; ingredients: RecipeIngredient[];
  anchorIngredientId: string | null; notes: string; archived?: boolean;
};
export type PrepBatch = Entity & {
  name: string; date: string; recipeId: string | null; ingredients: RecipeIngredient[];
  anchorIngredientId: string | null; notes: string; archived?: boolean;
};
export type MealGroup = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack' | 'Supplements';
export type DiaryEntry = Entity & {
  date: string; time: string; meal: MealGroup; name: string; kind: 'food' | 'prep';
  ingredients: RecipeIngredient[]; multiplier: number; estimated: boolean;
  batchId: string | null; anchorIngredientId: string | null; notes: string; portionCustomized?: boolean;
};
export type DayMetrics = Entity & {
  date: string; steps: number | null; waterL: number;
  activeEnergy: number | null; restingEnergy: number | null; exerciseMinutes: number | null;
  source: Source; importedAt?: string; completeDay?: boolean;
  healthSources?: Partial<Record<'steps' | 'activeEnergy' | 'restingEnergy' | 'exerciseMinutes', string>>;
};
export type Measurement = Entity & { date: string; kind: 'weight_kg' | 'height_cm'; value: number; source: Source; recordedAt: string };
export type HealthWorkout = Entity & {
  externalId: string; date: string; name: string; start: string; end: string;
  durationMinutes: number; activeEnergy: number | null; totalEnergy: number | null;
  heartRate: { time: string; bpm: number; min?: number; max?: number }[]; importedAt: string;
  heartRateSummary?: { min?: number; avg?: number; max?: number };
  sourceName?: string; sourceIdentifier?: string; isIndoor?: boolean; distanceKm?: number;
};
export type Collections = {
  profiles: ProfileRecord; locations: Location; exercises: ExerciseDefinition; routines: Routine;
  workouts: WorkoutSession; foods: FoodRecord; recipes: RecipeRecord; batches: PrepBatch;
  diary: DiaryEntry; metrics: DayMetrics; measurements: Measurement; healthWorkouts: HealthWorkout;
};
export type Collection = keyof Collections;
export const COLLECTIONS: Collection[] = ['profiles','locations','exercises','routines','workouts','foods','recipes','batches','diary','metrics','measurements','healthWorkouts'];
export type RecordsState = { [K in Collection]: Record<string, Collections[K]> };
export type StoredRecord<K extends Collection = Collection> = { collection: K; id: string; data: Collections[K]; version: number; updatedAt: string; deleted?: boolean };
export type BootstrapResponse = { user: { id: string; email: string }; records: StoredRecord[] };
export function emptyRecords(): RecordsState { return Object.fromEntries(COLLECTIONS.map(k => [k, {}])) as RecordsState; }
export const newId = () => crypto.randomUUID();
export const MUSCLES = ['Chest','Back','Shoulders','Biceps','Triceps','Quads','Hamstrings','Glutes','Calves','Core','Full body','Cardio','Other'];
export function defaultProfile(): ProfileRecord {
  return { id: 'profile', name: '', birthday: '', sex: null, heightCm: null, heightSource: 'manual', activity: 'light', weightUnit: 'lb', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles', goals: { balanceTarget: 150, proteinG: 150, steps: 10000, waterL: 3 }, onboardingComplete: false };
}
