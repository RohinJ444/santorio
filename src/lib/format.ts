import type { Segment, WorkSet } from "./types";

export function fmtReps(r: number) {
  const whole = Math.floor(r);
  const half = r - whole >= 0.5;
  if (!half) return `${whole}`;
  return whole === 0 ? "½" : `${whole}½`;
}

export function fmtWeight(w: Segment["weight"]) {
  if (w === "bar") return "bar";
  if (w == null) return "BW";
  return Number.isInteger(w) ? `${w}` : w.toFixed(1);
}

/** Compact Notes-style summary: "105×6↘90×4", bare weight when the target reps were hit. */
export function setShort(set: WorkSet, targetReps?: number) {
  return set.segments
    .map((sg, i) => {
      const wt = fmtWeight(sg.weight);
      const reps = sg.sides
        ? `R${fmtReps(sg.sides.R)}/L${fmtReps(sg.sides.L)}`
        : sg.reps != null
          ? fmtReps(sg.reps)
          : "";
      if (i === 0) {
        if (sg.sides) return `${wt} ${reps}`;
        if (set.segments.length === 1 && targetReps && sg.reps === targetReps) return wt;
        return `${wt}×${reps}`;
      }
      return sg.link === "pause" ? `‖${reps}` : `↘${wt}×${reps}`;
    })
    .join("");
}

export function setVolume(set: WorkSet, assisted?: boolean) {
  if (set.warmup || assisted) return 0;
  return set.segments.reduce((acc, sg) => {
    if (typeof sg.weight !== "number") return acc;
    const reps = sg.sides ? sg.sides.R + sg.sides.L : (sg.reps ?? 0);
    return acc + sg.weight * reps;
  }, 0);
}
