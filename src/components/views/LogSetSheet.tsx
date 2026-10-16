"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { fmtReps } from "@/lib/format";
import { uid } from "@/lib/mock";
import type { ExerciseEntry, Segment, WorkSet } from "@/lib/types";
import { Close, Minus, Plus } from "../ui/icons";
import v from "./views.module.css";

type Extra = { link: "drop" | "pause"; weight: number; reps: number };
type Draft = {
  warmup: boolean;
  split: boolean;
  weight: number | null; // null = bodyweight
  reps: number;
  R: number;
  L: number;
  extras: Extra[];
};

type Props = {
  entry: ExerciseEntry;
  editing?: WorkSet;
  seed?: WorkSet; // previous set to prefill from
  onSave: (set: WorkSet) => void;
  onDelete?: () => void;
  onClose: () => void;
};

const num = (w: Segment["weight"]) => (w === "bar" ? 45 : w);

function toDraft(set: WorkSet | undefined, entry: ExerciseEntry): Draft {
  const reps = entry.target?.reps ?? 8;
  if (!set) return { warmup: false, split: false, weight: entry.assisted ? 60 : 0, reps, R: reps, L: reps, extras: [] };
  const [first, ...rest] = set.segments;
  let w = num(first.weight);
  return {
    warmup: !!set.warmup,
    split: !!first.sides,
    weight: w,
    reps: first.reps ?? reps,
    R: first.sides?.R ?? reps,
    L: first.sides?.L ?? reps,
    extras: rest.map((sg) => {
      if (sg.link === "drop") w = num(sg.weight);
      return { link: sg.link ?? "drop", weight: w ?? 0, reps: sg.reps ?? 1 };
    }),
  };
}

function fromDraft(d: Draft, id: string): WorkSet {
  const first: Segment = d.split ? { weight: d.weight, sides: { R: d.R, L: d.L } } : { weight: d.weight, reps: d.reps };
  return {
    id,
    warmup: d.warmup || undefined,
    segments: [
      first,
      ...d.extras.map<Segment>((x) =>
        x.link === "drop" ? { weight: x.weight, reps: x.reps, link: "drop" } : { weight: x.weight, reps: x.reps, link: "pause" },
      ),
    ],
  };
}

function Stepper(props: {
  label: string;
  value: string;
  unit?: string;
  extra?: React.ReactNode;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <div className={v.stepper}>
      <div className={v.stepLabel}>
        {props.label}
        {props.extra}
      </div>
      <div className={v.stepVal}>
        {props.value}
        {props.unit && <small>{props.unit}</small>}
      </div>
      <div className={v.stepBtns}>
        <button className={v.stepBtn} onClick={props.onDec} aria-label={`Decrease ${props.label}`}>
          <Minus size={18} />
        </button>
        <button className={v.stepBtn} onClick={props.onInc} aria-label={`Increase ${props.label}`}>
          <Plus size={18} />
        </button>
      </div>
    </div>
  );
}

function Mini({ value, onDec, onInc }: { value: string; onDec: () => void; onInc: () => void }) {
  return (
    <div className={v.mini}>
      <button onClick={onDec} aria-label="Decrease">
        <Minus size={14} />
      </button>
      <span>{value}</span>
      <button onClick={onInc} aria-label="Increase">
        <Plus size={14} />
      </button>
    </div>
  );
}

/** Bottom sheet for logging a set. Big targets for between-set thumbs; the Notes edge cases are one tap away. */
export default function LogSetSheet({ entry, editing, seed, onSave, onDelete, onClose }: Props) {
  const [d, setD] = useState<Draft>(() => toDraft(editing ?? seed, entry));
  const step = entry.perHand ? 2.5 : 5;
  const half = (r: number) => r % 1 !== 0;
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const bodyweight = d.weight === null;
  const unit = entry.assisted ? "lb assist" : entry.perHand ? "lb ea" : "lb";

  const weightLabel = bodyweight ? "BW" : d.warmup && d.weight === 45 ? "bar" : `${d.weight}`;
  const lastWeight = d.extras.length ? d.extras[d.extras.length - 1].weight : (d.weight ?? 0);

  return (
    <>
      <motion.div
        className={v.backdrop}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className={v.sheet}
        role="dialog"
        aria-label={`Log set: ${entry.name}`}
        initial={{ y: "100%" }}
        animate={{ y: 0, transition: { type: "spring", damping: 30, stiffness: 320 } }}
        exit={{ y: "100%", transition: { duration: 0.22 } }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 110 || info.velocity.y > 600) onClose();
        }}
      >
        <div className={v.grabber} />
        <div className={v.sheetHead}>
          <div>
            <div className={v.sheetTitle}>{entry.name}</div>
            <div className={v.sheetSub}>
              {[entry.equipment, entry.target && `${entry.target.sets}×${entry.target.reps}`, entry.assisted && "lower = stronger"]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>
          <button className={v.closeBtn} onClick={onClose} aria-label="Close">
            <Close size={18} />
          </button>
        </div>

        <div className={v.steppers} style={d.split ? { gridTemplateColumns: "1fr" } : undefined}>
          <Stepper
            label="Weight"
            value={weightLabel}
            unit={bodyweight ? undefined : unit}
            onDec={() => !bodyweight && set({ weight: Math.max(0, (d.weight ?? 0) - step) })}
            onInc={() => !bodyweight && set({ weight: (d.weight ?? 0) + step })}
          />
          {!d.split && (
            <Stepper
              label="Reps"
              value={fmtReps(d.reps)}
              extra={
                <button
                  className={v.side}
                  style={{ color: half(d.reps) ? "var(--c)" : undefined }}
                  onClick={() => set({ reps: half(d.reps) ? Math.floor(d.reps) : d.reps + 0.5 })}
                >
                  +½
                </button>
              }
              onDec={() => set({ reps: Math.max(0, Math.ceil(d.reps) - 1) })}
              onInc={() => set({ reps: Math.floor(d.reps) + 1 })}
            />
          )}
        </div>

        {d.split && (
          <div className={v.steppers} style={{ marginTop: 10 }}>
            <Stepper label="Right" value={fmtReps(d.R)} onDec={() => set({ R: Math.max(0, d.R - 1) })} onInc={() => set({ R: d.R + 1 })} />
            <Stepper label="Left" value={fmtReps(d.L)} onDec={() => set({ L: Math.max(0, d.L - 1) })} onInc={() => set({ L: d.L + 1 })} />
          </div>
        )}

        <div className={v.toggles}>
          <button className={`${v.toggle} ${d.warmup ? v.toggleOn : ""}`} onClick={() => set({ warmup: !d.warmup })}>
            Warm-up
          </button>
          <button className={`${v.toggle} ${d.split ? v.toggleOn : ""}`} onClick={() => set({ split: !d.split })}>
            R / L
          </button>
          <button className={`${v.toggle} ${bodyweight ? v.toggleOn : ""}`} onClick={() => set({ weight: bodyweight ? 0 : null })}>
            Bodyweight
          </button>
          <button
            className={v.toggle}
            onClick={() => set({ extras: [...d.extras, { link: "drop", weight: Math.max(0, lastWeight - step * 2), reps: 3 }] })}
          >
            + Drop
          </button>
          <button className={v.toggle} onClick={() => set({ extras: [...d.extras, { link: "pause", weight: lastWeight, reps: 1 }] })}>
            + Rest-pause
          </button>
        </div>

        {d.extras.map((x, i) => {
          const patch = (p: Partial<Extra>) => set({ extras: d.extras.map((y, j) => (j === i ? { ...y, ...p } : y)) });
          return (
            <div key={i} className={v.segRow}>
              <span className={v.segIcon} title={x.link === "drop" ? "drop" : "rest-pause"}>
                {x.link === "drop" ? "↘" : "‖"}
              </span>
              {x.link === "drop" ? (
                <Mini value={`${x.weight}`} onDec={() => patch({ weight: Math.max(0, x.weight - step) })} onInc={() => patch({ weight: x.weight + step })} />
              ) : (
                <span className={v.side} style={{ textAlign: "center" }}>
                  same weight
                </span>
              )}
              <Mini value={`×${fmtReps(x.reps)}`} onDec={() => patch({ reps: Math.max(0, x.reps - 1) })} onInc={() => patch({ reps: x.reps + 1 })} />
              <button className={v.closeBtn} style={{ width: 30, height: 30 }} onClick={() => set({ extras: d.extras.filter((_, j) => j !== i) })} aria-label="Remove">
                <Close size={14} />
              </button>
            </div>
          );
        })}

        <div className={v.sheetActions}>
          {onDelete && (
            <button className={v.ghost} onClick={onDelete}>
              Delete
            </button>
          )}
          <button className={v.primary} onClick={() => onSave(fromDraft(d, editing?.id ?? uid("s")))}>
            {editing ? "Save set" : "Log set"}
          </button>
        </div>
      </motion.div>
    </>
  );
}
