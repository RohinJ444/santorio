/**
 * Mock data for the visual prototype. Everything here gets replaced by the
 * real backend; shapes match src/lib/types.ts. Dates are relative to "today"
 * so the prototype always has a live-looking day. Workouts are adapted from
 * Rohin's Notes logs. Profile numbers are placeholders.
 */
import { addDays, fmtShort } from "./dates";
import { DEFAULT_BALANCE_TARGET } from "./defaults";
import type {
  DayLog,
  ExerciseEntry,
  Food,
  FoodItem,
  Goals,
  Ingredient,
  Meal,
  MealTemplate,
  Profile,
  Segment,
  WeighIn,
  WorkSet,
  Workout,
} from "./types";

let seq = 0;
export const uid = (p: string) => `${p}${++seq}${Math.random().toString(36).slice(2, 6)}`;

/* ---------- builders ---------- */

const x = (weight: Segment["weight"], reps: number, link?: Segment["link"]): Segment => ({ weight, reps, link });
const rl = (weight: number, R: number, L: number): Segment => ({ weight, sides: { R, L } });
const s = (...segments: Segment[]): WorkSet => ({ id: uid("s"), segments });
const warm = (...segments: Segment[]): WorkSet => ({ id: uid("s"), warmup: true, segments });
const T = (sets: number, reps: number) => ({ sets, reps });
const e = (
  exerciseId: string,
  name: string,
  opts: Partial<Omit<ExerciseEntry, "id" | "exerciseId" | "name" | "sets">>,
  sets: WorkSet[],
): ExerciseEntry => ({ id: uid("e"), exerciseId, name, ...opts, sets });

/* ---------- static catalog ---------- */

export const GYMS = ["Crunch Fitness San Mateo", "Hotel gym · travel"];

const food = (id: string, name: string, kcal: number, protein: number, carbs: number, fat: number): Food => ({
  id,
  name,
  per100g: { kcal, protein, carbs, fat },
});

export const FOODS: Record<string, Food> = Object.fromEntries(
  [
    food("chicken", "Chicken thigh, cooked", 179, 24.8, 0, 8.2),
    food("jasmine", "Jasmine rice, cooked", 129, 2.7, 28, 0.3),
    food("broccoli", "Broccoli, steamed", 35, 2.4, 7.2, 0.4),
    food("greenbeans", "Green beans", 35, 1.9, 7.9, 0.3),
    food("oil", "Olive oil", 884, 0, 0, 100),
    food("soy", "Soy sauce", 53, 8.1, 4.9, 0.6),
    food("sriracha", "Sriracha", 93, 1.9, 19, 0.9),
    food("yogurt", "Greek yogurt, nonfat", 59, 10.3, 3.6, 0.4),
    food("whey", "Whey protein", 400, 80, 8, 6.7),
    food("blueberry", "Blueberries", 57, 0.7, 14.5, 0.3),
    food("banana", "Banana", 89, 1.1, 22.8, 0.3),
    food("beef", "Lean ground beef, cooked", 217, 26.1, 0, 11.7),
    food("potato", "Potatoes, roasted", 93, 2.5, 21, 0.1),
    food("turkey", "Ground turkey, cooked", 203, 27.4, 0, 10.4),
    food("beans", "Black beans", 132, 8.9, 23.7, 0.5),
    food("tomato", "Crushed tomatoes", 32, 1.6, 7.3, 0.3),
    food("egg", "Egg, whole", 143, 12.6, 0.7, 9.5),
    food("toast", "Sourdough", 270, 10.8, 52, 2.4),
  ].map((f) => [f.id, f]),
);

const ing = (foodId: string, grams: number, change?: Ingredient["change"]): Ingredient => ({ foodId, grams, change });

export const TEMPLATES: Record<string, MealTemplate> = {
  bowl: {
    id: "bowl",
    name: "Chicken rice bowl",
    version: 3,
    ingredients: [ing("chicken", 180), ing("jasmine", 200), ing("broccoli", 120), ing("oil", 8), ing("soy", 10)],
  },
  beefpot: {
    id: "beefpot",
    name: "Beef & potatoes",
    version: 2,
    ingredients: [ing("beef", 170), ing("potato", 250), ing("greenbeans", 100), ing("oil", 6)],
  },
  chili: {
    id: "chili",
    name: "Turkey chili",
    version: 1,
    ingredients: [ing("turkey", 150), ing("beans", 120), ing("tomato", 150)],
  },
};

export const PROFILE: Profile = { name: "Rohin", birthday: "2001-03-14", sex: null, heightIn: 70, activity: "moderate" };
export const GOALS: Goals = { balanceTarget: DEFAULT_BALANCE_TARGET, proteinG: 170, steps: 10000, waterL: 3 };

/* ---------- history ---------- */

export function buildMock(today: string) {
  const d = (k: number) => addDays(today, k);
  const workouts: Record<string, Workout> = {};
  const put = (w: Workout) => (workouts[w.date] = w);

  put({
    date: d(-81),
    title: "Chest · Shoulders · Triceps",
    gym: GYMS[0],
    entries: [
      e("bench", "Bench press", { equipment: "Barbell · flat bench", target: T(3, 6) }, [
        warm(x("bar", 10)),
        s(x(105, 5.5)),
        s(x(105, 2)),
        s(x(105, 2.5)),
      ]),
      e("shoulder-press-db", "Shoulder press", { equipment: "Dumbbells · seated", target: T(3, 8), perHand: true }, [
        s(x(25, 6)),
        s(x(25, 4), x(22.5, 1, "drop")),
        s(x(22.5, 5)),
      ]),
      e("skullcrusher", "Barbell skullcrusher", { equipment: "EZ bar", target: T(3, 10) }, [
        s(x(30, 10)),
        s(x(30, 10)),
        s(x(30, 10)),
      ]),
      e("incline-press", "Incline chest press", { equipment: "Dumbbells · incline bench", perHand: true }, [
        s(x(27.5, 7)),
        s(x(27.5, 4)),
      ]),
    ],
  });

  put({
    date: d(-47),
    title: "Back · Biceps",
    gym: GYMS[0],
    entries: [
      e("lat-pulldown", "Lat pulldown", { equipment: "Cable stack · upstairs", target: T(3, 10) }, [
        s(x(100, 10)),
        s(x(105, 10)),
        s(x(105, 6), x(90, 4, "drop")),
      ]),
      e("preacher-curl", "Preacher curl", { equipment: "Dumbbell · preacher bench", target: T(3, 8), perHand: true }, [
        s(rl(20, 7, 8)),
        s(rl(20, 7, 8)),
        s(rl(20, 4, 6)),
      ]),
      e("cable-row-wide", "Wide-grip cable row", { equipment: "Seated row · wide bar", target: T(3, 10) }, [
        s(x(100, 10)),
        s(x(100, 8)),
        s(x(100, 5), x(85, 5, "drop")),
      ]),
      e("hammer-curl", "Standing hammer curl", { equipment: "Dumbbells", target: T(2, 8), perHand: true }, [
        s(x(22.5, 4.5)),
        s(x(22.5, 2.5), x(20, 1, "drop")),
      ]),
      e("pullup-assisted", "Assisted pull-up", { equipment: "Assist machine", target: T(3, 8), assisted: true }, [
        s(x(60, 7)),
        s(x(60, 6)),
      ]),
      e("face-pull", "Face pull", { equipment: "Cable · rope", target: T(3, 10) }, [
        s(x(25, 10)),
        s(x(30, 6), x(25, 4, "drop")),
        s(x(25, 10)),
      ]),
    ],
  });

  put({
    date: d(-11),
    title: "Chest · Shoulders · Triceps",
    gym: GYMS[0],
    entries: [
      e("bench", "Bench press", { equipment: "Barbell · flat bench", target: T(3, 6) }, [
        warm(x("bar", 10)),
        s(x(115, 6)),
        s(x(115, 5)),
        s(x(115, 3)),
      ]),
      e("shoulder-press-db", "Shoulder press", { equipment: "Dumbbells · seated", target: T(3, 8), perHand: true }, [
        s(x(25, 8)),
        s(x(25, 6), x(25, 1, "pause")),
        s(x(25, 5)),
      ]),
      e("triceps-pulldown", "Triceps cable pulldown", { equipment: "Cable · straight bar", target: T(3, 10) }, [
        s(x(35, 10)),
        s(x(35, 10)),
        s(x(35, 5), x(30, 3, "drop"), x(30, 2, "pause")),
      ]),
      e("incline-bench", "Incline bench press", { equipment: "Barbell · incline bench", target: T(3, 8) }, [
        warm(x("bar", 6)),
        s(x(55, 8)),
        s(x(65, 8)),
        s(x(65, 4)),
      ]),
      e("lateral-raise-machine", "Lateral raise", { equipment: "Machine", target: T(3, 8) }, [
        s(x(65, 7.5)),
        s(x(65, 5), x(50, 3, "drop")),
        s(x(65, 5), x(50, 3, "drop")),
      ]),
      e("dip-assisted", "Assisted triceps dip", { equipment: "Assist machine", target: T(3, 8), assisted: true }, [
        s(x(60, 8)),
        s(x(60, 5.5)),
        s(x(80, 6)),
      ]),
      e("ab-crunch-machine", "Abdominal crunch", { equipment: "Machine", target: T(3, 10) }, [s(x(100, 10))]),
    ],
  });

  put({
    date: d(-8),
    title: "Back · Biceps",
    gym: GYMS[1],
    entries: [
      e("lat-pulldown", "Lat pulldown", { equipment: "Plate-loaded pulldown", target: T(3, 10) }, [
        s(x(120, 10)),
        s(x(120, 10)),
        s(x(120, 9)),
      ]),
      e("face-pull", "Face pull", { equipment: "Cable · rope", target: T(3, 12) }, [
        s(x(20, 12)),
        s(x(20, 12)),
        s(x(20, 12)),
      ]),
    ],
  });

  put({
    date: d(-4),
    title: "Cardio · Core",
    gym: GYMS[0],
    entries: [
      e("incline-treadmill", "Incline treadmill", { cardio: { mph: 3.3, incline: 13.5, minutes: 36 } }, []),
      e("hanging-leg-raise", "Suspended leg raise", { equipment: "Captain's chair", target: T(3, 10) }, [
        s(x(null, 10)),
        s(x(null, 10)),
        s(x(null, 10)),
      ]),
      e("ab-crunch-machine", "Abdominal crunch", { equipment: "Machine", target: T(3, 10) }, [
        s(x(135, 10)),
        s(x(135, 10)),
        s(x(135, 10)),
      ]),
    ],
  });

  // Today: in progress. Planned exercises are written ahead and filled in at the gym, like the Notes habit.
  put({
    date: d(0),
    title: "Back · Biceps",
    gym: GYMS[0],
    entries: [
      e("lat-pulldown", "Lat pulldown", { equipment: "Cable stack · upstairs", target: T(3, 10) }, [
        s(x(105, 10)),
        s(x(105, 10)),
        s(x(110, 7)),
      ]),
      e("preacher-curl", "Preacher curl", { equipment: "Dumbbell · preacher bench", target: T(3, 8), perHand: true }, [
        s(rl(20, 8, 8)),
        s(rl(20, 7, 8)),
      ]),
      e("cable-row-wide", "Wide-grip cable row", { equipment: "Seated row · wide bar", target: T(3, 10) }, []),
      e("pullup-assisted", "Assisted pull-up", { equipment: "Assist machine", target: T(3, 8), assisted: true }, []),
      e("hammer-curl", "Standing hammer curl", { equipment: "Dumbbells", target: T(2, 8), perHand: true }, []),
      e("face-pull", "Face pull", { equipment: "Cable · rope", target: T(3, 10) }, []),
    ],
  });

  /* ---------- nutrition ---------- */

  const batch = `Batch · ${fmtShort(d(-3))}`;
  const bowlBatch = (extra: Ingredient[] = []): Ingredient[] => [
    ing("chicken", 200, { kind: "more", note: "+20 g vs template" }),
    ing("jasmine", 200),
    ing("greenbeans", 120, { kind: "swap", note: "swapped for broccoli" }),
    ing("oil", 8),
    ing("soy", 10),
    ...extra,
  ];
  const f = (foodId: string, grams: number): FoodItem => ({ kind: "food", id: uid("i"), foodId, grams });
  const prep = (templateId: string, batchLabel: string, portion: number, ingredients: Ingredient[]): FoodItem => ({
    kind: "prep",
    id: uid("i"),
    templateId,
    batch: batchLabel,
    portion,
    ingredients,
  });
  const meal = (name: string, time: string, items: FoodItem[]): Meal => ({ id: uid("m"), name, time, items });

  const days: Record<string, DayLog> = {
    [d(0)]: {
      date: d(0),
      steps: 6212,
      waterL: 1.75,
      meals: [
        meal("Breakfast", "08:20", [f("yogurt", 250), f("blueberry", 80), f("whey", 30)]),
        meal("Lunch", "12:45", [
          prep("bowl", batch, 1.15, bowlBatch([ing("sriracha", 10, { kind: "added", note: "just this serving" })])),
        ]),
        meal("Snack", "15:30", [f("banana", 120), f("whey", 30)]),
        meal("Dinner", "18:30", [prep("bowl", batch, 1, bowlBatch())]),
      ],
    },
    [d(-1)]: {
      date: d(-1),
      steps: 11408,
      waterL: 3.1,
      meals: [
        meal("Breakfast", "08:05", [f("egg", 150), f("toast", 80)]),
        meal("Lunch", "12:30", [
          prep("beefpot", `Batch · ${fmtShort(d(-6))}`, 1, TEMPLATES.beefpot.ingredients.map((i) => ({ ...i }))),
        ]),
        meal("Snack", "16:10", [f("yogurt", 200), f("whey", 30)]),
        meal("Dinner", "19:15", [
          prep("chili", `Batch · ${fmtShort(d(-5))}`, 1.25, TEMPLATES.chili.ingredients.map((i) => ({ ...i }))),
        ]),
      ],
    },
  };

  const weighIns: WeighIn[] = [
    { date: d(-30), lb: 171.2 },
    { date: d(-23), lb: 170.4 },
    { date: d(-16), lb: 169.8 },
    { date: d(-9), lb: 168.9 },
    { date: d(-2), lb: 168.4 },
  ];

  return { workouts, days, weighIns };
}
