/**
 * Daily series for the home insights. Days with real logs use them; days
 * without fall back to stable, seeded sample values (marked `sample`) so the
 * charts have shape until the data layer exists.
 */
import { addDays } from "./dates";
import type { Workout } from "./types";

/** Deterministic value in [0, 1) from a string, so sample history is stable across reloads. */
export function seeded(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

export type DayPoint = {
  date: string;
  qin: number;
  qout: number;
  balance: number; // qin - qout; negative = deficit
  protein: number;
  trained: boolean;
  sample: boolean; // intake not logged; value is a placeholder
};

type Inputs = {
  today: string;
  days: number;
  tdee: number;
  workouts: Record<string, Workout>;
  intake: (date: string) => { kcal: number; protein: number } | null;
};

export function daySeries({ today, days, tdee, workouts, intake }: Inputs): DayPoint[] {
  const out: DayPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const trained = !!workouts[date];
    // expenditure: TDEE estimate, nudged up on training days and by daily movement
    const qout = tdee + (trained ? 220 : 0) + (seeded(`${date}o`) - 0.5) * 260;
    const real = intake(date);
    const qin = real?.kcal ?? tdee - 380 + (seeded(`${date}i`) - 0.5) * 700;
    const protein = real?.protein ?? 135 + seeded(`${date}p`) * 60;
    out.push({ date, qin, qout, balance: qin - qout, protein, trained, sample: !real });
  }
  return out;
}

/** Sessions per week for the last `weeks` weeks, oldest first. */
export function weeklySessions(today: string, weeks: number, workouts: Record<string, Workout>) {
  return Array.from({ length: weeks }, (_, k) => {
    const end = addDays(today, -7 * (weeks - 1 - k));
    let real = 0;
    for (let i = 0; i < 7; i++) if (workouts[addDays(end, -i)]) real++;
    const sample = real === 0;
    return { end, sessions: sample ? 2 + Math.round(seeded(`${end}w`) * 2) : real, sample };
  });
}

/** 3,500 kcal per lb of body mass: the common rule of thumb, an approximation. */
export const KCAL_PER_LB = 3500;
