"use client";

/**
 * Prototype state: in-memory only, resets on reload. Exists so the screens
 * are clickable; the real data layer (Supabase, persistence, sync) replaces it.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { addDays, isoLocal, nowTime } from "./dates";
import { add, bmr, itemNutrients, tdee, ZERO } from "./energy";
import { buildMock, GOALS, GYMS, PROFILE, TEMPLATES, uid } from "./mock";
import type { DayLog, FoodItem, Goals, Nutrients, Profile, WeighIn, WorkSet, Workout } from "./types";

type State = {
  today: string;
  date: string; // selected day in the workout / diet views
  profile: Profile;
  goals: Goals;
  weighIns: WeighIn[];
  workouts: Record<string, Workout>;
  days: Record<string, DayLog>;
  gyms: string[];
};

function initialState(): State {
  const today = isoLocal(new Date());
  const mock = buildMock(today);
  return { today, date: today, profile: PROFILE, goals: GOALS, gyms: GYMS, ...mock };
}

const emptyDay = (date: string): DayLog => ({ date, meals: [] });

function useStoreValue() {
  const [state, setState] = useState<State>(initialState);

  const actions = useMemo(() => {
    const mapWorkout = (s: State, date: string, fn: (w: Workout) => Workout): State => {
      const w = s.workouts[date];
      return w ? { ...s, workouts: { ...s.workouts, [date]: fn(w) } } : s;
    };
    const mapDay = (s: State, date: string, fn: (d: DayLog) => DayLog): State => ({
      ...s,
      days: { ...s.days, [date]: fn(s.days[date] ?? emptyDay(date)) },
    });
    const mapItem = (s: State, date: string, itemId: string, fn: (i: FoodItem) => FoodItem) =>
      mapDay(s, date, (d) => ({
        ...d,
        meals: d.meals.map((m) => ({ ...m, items: m.items.map((i) => (i.id === itemId ? fn(i) : i)) })),
      }));

    return {
      shiftDate: (n: number) => setState((s) => ({ ...s, date: addDays(s.date, n) })),
      updateProfile: (p: Partial<Profile>) => setState((s) => ({ ...s, profile: { ...s.profile, ...p } })),
      updateGoals: (g: Partial<Goals>) => setState((s) => ({ ...s, goals: { ...s.goals, ...g } })),
      addWeighIn: (lb: number) =>
        setState((s) => ({
          ...s,
          weighIns: [...s.weighIns.filter((w) => w.date !== s.today), { date: s.today, lb }].sort((a, b) =>
            a.date.localeCompare(b.date),
          ),
        })),
      setGym: (date: string, gym: string) => setState((s) => mapWorkout(s, date, (w) => ({ ...w, gym }))),
      saveSet: (date: string, entryId: string, set: WorkSet) =>
        setState((s) =>
          mapWorkout(s, date, (w) => ({
            ...w,
            entries: w.entries.map((e) =>
              e.id !== entryId
                ? e
                : {
                    ...e,
                    sets: e.sets.some((x) => x.id === set.id)
                      ? e.sets.map((x) => (x.id === set.id ? set : x))
                      : [...e.sets, set],
                  },
            ),
          })),
        ),
      deleteSet: (date: string, entryId: string, setId: string) =>
        setState((s) =>
          mapWorkout(s, date, (w) => ({
            ...w,
            entries: w.entries.map((e) => (e.id !== entryId ? e : { ...e, sets: e.sets.filter((x) => x.id !== setId) })),
          })),
        ),
      /** Start a day's workout from an earlier one: same exercises and setup, empty sets. */
      startWorkout: (date: string, from?: Workout) =>
        setState((s) => ({
          ...s,
          workouts: {
            ...s.workouts,
            [date]: {
              date,
              title: from?.title ?? "Workout",
              gym: from?.gym ?? s.gyms[0],
              entries: (from?.entries ?? []).map((e) => ({ ...e, id: uid("e"), sets: [] })),
            },
          },
        })),
      setPortion: (date: string, itemId: string, portion: number) =>
        setState((s) => mapItem(s, date, itemId, (i) => (i.kind === "prep" ? { ...i, portion } : i))),
      nudgeIngredient: (date: string, itemId: string, foodId: string, delta: number) =>
        setState((s) =>
          mapItem(s, date, itemId, (i) => {
            if (i.kind !== "prep") return i;
            const base = TEMPLATES[i.templateId]?.ingredients.find((t) => t.foodId === foodId)?.grams;
            return {
              ...i,
              ingredients: i.ingredients.map((g) => {
                if (g.foodId !== foodId) return g;
                const grams = Math.max(0, g.grams + delta);
                if (base == null || g.change?.kind === "swap" || g.change?.kind === "added") return { ...g, grams };
                const diff = grams - base;
                return {
                  ...g,
                  grams,
                  change:
                    diff === 0
                      ? undefined
                      : { kind: diff > 0 ? "more" : "less", note: `${diff > 0 ? "+" : "−"}${Math.abs(diff)} g vs template` },
                };
              }),
            };
          }),
        ),
      addWater: (date: string, l: number) =>
        setState((s) =>
          mapDay(s, date, (d) => ({ ...d, waterL: Math.max(0, Math.round(((d.waterL ?? 0) + l) * 100) / 100) })),
        ),
      addFood: (date: string, item: FoodItem) =>
        setState((s) =>
          mapDay(s, date, (d) => {
            const time = nowTime();
            const last = d.meals[d.meals.length - 1];
            if (last && last.name === "Snack" && date === s.today) {
              return { ...d, meals: d.meals.map((m) => (m === last ? { ...m, items: [...m.items, item] } : m)) };
            }
            return { ...d, meals: [...d.meals, { id: uid("m"), name: "Snack", time, items: [item] }] };
          }),
        ),
    };
  }, []);

  const derived = useMemo(() => {
    const latest = state.weighIns[state.weighIns.length - 1];
    const weightLb = latest?.lb ?? 170;
    const dayNutrients = (date: string): Nutrients =>
      (state.days[date]?.meals ?? []).reduce(
        (acc, m) => m.items.reduce((a, i) => add(a, itemNutrients(i)), acc),
        ZERO,
      );
    return {
      latestWeighIn: latest,
      bmr: bmr(state.profile, weightLb, state.today),
      tdee: tdee(state.profile, weightLb, state.today),
      dayNutrients,
    };
  }, [state]);

  return { ...state, ...actions, ...derived };
}

type Store = ReturnType<typeof useStoreValue>;
const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const value = useStoreValue();
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore must be used inside <StoreProvider>");
  return v;
}
