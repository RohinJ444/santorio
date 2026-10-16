import type { ExerciseEntry, Workout } from "./types";

export type PrevEntry = { date: string; gym: string; entry: ExerciseEntry };

/**
 * Most recent earlier performance of the same exercise, split by whether it
 * was on the same setup (gym + equipment). Numbers from a different machine
 * aren't comparable, so the UI shows `same` first and labels `other`.
 */
export function previousFor(workouts: Record<string, Workout>, date: string, entry: ExerciseEntry, gym: string) {
  const dates = Object.keys(workouts)
    .filter((d) => d < date)
    .sort()
    .reverse();
  let same: PrevEntry | null = null;
  let other: PrevEntry | null = null;
  for (const d of dates) {
    const wk = workouts[d];
    const match = wk.entries.find((x) => x.exerciseId === entry.exerciseId && x.sets.length > 0);
    if (!match) continue;
    const isSame = wk.gym === gym && (match.equipment ?? "") === (entry.equipment ?? "");
    if (isSame && !same) same = { date: d, gym: wk.gym, entry: match };
    if (!isSame && !other) other = { date: d, gym: wk.gym, entry: match };
    if (same && other) break;
  }
  return { same, other: other && (!same || other.date > same.date) ? other : null };
}

/** Most recent earlier workout per title, for "repeat last" suggestions. */
export function recentTitles(workouts: Record<string, Workout>, date: string, limit = 3) {
  const seen = new Set<string>();
  const out: Workout[] = [];
  for (const d of Object.keys(workouts).sort().reverse()) {
    if (d >= date) continue;
    const w = workouts[d];
    if (seen.has(w.title)) continue;
    seen.add(w.title);
    out.push(w);
    if (out.length >= limit) break;
  }
  return out;
}
