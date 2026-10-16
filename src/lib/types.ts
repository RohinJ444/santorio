export type Sex = "male" | "female" | null;
export type Activity = "sedentary" | "light" | "moderate" | "very";

export type Profile = {
  name: string;
  birthday: string; // YYYY-MM-DD
  sex: Sex;
  heightIn: number;
  activity: Activity;
};

export type WeighIn = { date: string; lb: number };

export type Goals = {
  /** Daily energy balance target in kcal vs TDEE: negative = cut, 0 = maintain, positive = bulk. */
  balanceTarget: number;
  proteinG: number;
  steps: number;
  waterL: number;
};

/* ---------- Training ---------- */

/**
 * One continuous effort within a set. A plain set has one segment.
 * Extra segments model what Notes captured as free text:
 *   drop       "65 (x5) 50 (x3)"   weight changes mid-set
 *   pause      "25 (x6, break, x1)" rest-pause at the same weight
 */
export type Segment = {
  weight: number | "bar" | null; // null = bodyweight
  reps?: number; // fractional for partials: 7.5 = 7½
  sides?: { R: number; L: number }; // per-side reps instead of `reps`
  link?: "drop" | "pause"; // how this segment follows the previous one
};

export type WorkSet = { id: string; warmup?: boolean; segments: Segment[] };

export type ExerciseEntry = {
  id: string;
  exerciseId: string; // stable identity across sessions, so history lines up
  name: string;
  equipment?: string; // machine / setup; results only compare on the same setup
  target?: { sets: number; reps: number };
  assisted?: boolean; // weight is assistance: lower = stronger
  perHand?: boolean; // dumbbells
  cardio?: { mph: number; incline: number; minutes: number };
  sets: WorkSet[];
};

export type Workout = { date: string; title: string; gym: string; entries: ExerciseEntry[] };

/* ---------- Nutrition ---------- */

export type Nutrients = { kcal: number; protein: number; carbs: number; fat: number };

export type Food = { id: string; name: string; per100g: Nutrients };

export type IngredientChange = { kind: "more" | "less" | "swap" | "added"; note: string };

/** Per-serving amount. A logged meal-prep item keeps its own copy, so editing a template never rewrites history. */
export type Ingredient = { foodId: string; grams: number; change?: IngredientChange };

export type MealTemplate = { id: string; name: string; version: number; ingredients: Ingredient[] };

export type FoodItem =
  | { kind: "food"; id: string; foodId: string; grams: number }
  | {
      kind: "prep";
      id: string;
      templateId: string;
      batch: string;
      portion: number;
      ingredients: Ingredient[];
    };

export type Meal = { id: string; name: string; time: string; items: FoodItem[] };

export type DayLog = { date: string; meals: Meal[]; steps?: number; waterL?: number };
