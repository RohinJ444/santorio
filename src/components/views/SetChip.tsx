"use client";

import { fmtReps, fmtWeight } from "@/lib/format";
import type { WorkSet } from "@/lib/types";
import v from "./views.module.css";

type Props = { set: WorkSet; index?: number; onClick: () => void };

/** One logged set, keeping the detail Notes captured: partials, drops, rest-pause, per-side reps. */
export default function SetChip({ set, index, onClick }: Props) {
  return (
    <button className={`${v.chip} ${set.warmup ? v.chipWarm : ""}`} onClick={onClick}>
      {index != null && <span className={v.chipIdx}>{set.warmup ? "W" : index}</span>}
      {set.segments.map((sg, i) => {
        const reps = sg.sides ? (
          <small>
            <span className={v.side}>R</span>
            {fmtReps(sg.sides.R)} <span className={v.side}>L</span>
            {fmtReps(sg.sides.L)}
          </small>
        ) : (
          <small>×{fmtReps(sg.reps ?? 0)}</small>
        );
        if (i === 0) {
          return (
            <span key={i}>
              {fmtWeight(sg.weight)}
              {sg.sides ? " " : ""}
              {reps}
            </span>
          );
        }
        if (sg.link === "pause") {
          return (
            <span key={i}>
              <span className={v.link} title="rest-pause">
                ‖
              </span>
              <small>{fmtReps(sg.reps ?? 0)}</small>
            </span>
          );
        }
        return (
          <span key={i}>
            <span className={v.link} title="drop">
              ↘
            </span>
            {fmtWeight(sg.weight)}
            {reps}
          </span>
        );
      })}
    </button>
  );
}
