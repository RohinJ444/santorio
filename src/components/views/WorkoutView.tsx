"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { fmtShort } from "@/lib/dates";
import { fmtInt } from "@/lib/energy";
import { setShort, setVolume } from "@/lib/format";
import { previousFor, recentTitles, type PrevEntry } from "@/lib/history";
import { useStore } from "@/lib/store";
import type { ExerciseEntry, Workout } from "@/lib/types";
import { ChevronRight, Pin, Plus } from "../ui/icons";
import DayHeader, { useSwipeDays, viewMotion } from "./DayHeader";
import LogSetSheet from "./LogSetSheet";
import SetChip from "./SetChip";
import v from "./views.module.css";

type Editing = { entryId: string; setId?: string } | null;

export default function WorkoutView() {
  const st = useStore();
  const wk = st.workouts[st.date];
  const [editing, setEditing] = useState<Editing>(null);
  const swipe = useSwipeDays(st.shiftDate);

  const entry = editing && wk?.entries.find((e) => e.id === editing.entryId);
  const editingSet = entry && editing?.setId ? entry.sets.find((s) => s.id === editing.setId) : undefined;
  const seed =
    entry && wk ? (entry.sets.filter((s) => !s.warmup).at(-1) ?? lastSame(st.workouts, st.date, entry, wk.gym)) : undefined;

  return (
    <motion.div className={v.view} {...viewMotion} {...swipe}>
      <DayHeader q="out" label="Training" />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={st.date}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.25 } }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
        >
          {wk ? (
            <>
              <Session wk={wk} />
              {wk.entries.map((e) => (
                <ExerciseCard
                  key={e.id}
                  entry={e}
                  prev={previousFor(st.workouts, st.date, e, wk.gym)}
                  onLog={(setId) => setEditing({ entryId: e.id, setId })}
                />
              ))}
              <button className={v.addRow}>
                <Plus size={18} /> Add exercise
              </button>
            </>
          ) : (
            <EmptyDay />
          )}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {entry && (
          <LogSetSheet
            key="sheet"
            entry={entry}
            editing={editingSet}
            seed={seed ?? undefined}
            onClose={() => setEditing(null)}
            onSave={(set) => {
              st.saveSet(st.date, entry.id, set);
              setEditing(null);
            }}
            onDelete={
              editingSet
                ? () => {
                    st.deleteSet(st.date, entry.id, editingSet.id);
                    setEditing(null);
                  }
                : undefined
            }
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function lastSame(workouts: Record<string, Workout>, date: string, entry: ExerciseEntry, gym: string) {
  const prev = previousFor(workouts, date, entry, gym).same;
  return prev?.entry.sets.find((s) => !s.warmup) ?? null;
}

function Session({ wk }: { wk: Workout }) {
  const done = wk.entries.filter((e) => e.sets.length > 0 || e.cardio).length;
  const sets = wk.entries.reduce((n, e) => n + e.sets.filter((s) => !s.warmup).length, 0);
  const volume = wk.entries.reduce((n, e) => n + e.sets.reduce((a, s) => a + setVolume(s, e.assisted), 0), 0);
  return (
    <div className={v.card}>
      <div className={v.sessionTop}>
        <div>
          <div className={v.kicker}>Session</div>
          <div className={v.sessionTitle}>{wk.title}</div>
        </div>
      </div>
      <button className={v.gym}>
        <Pin size={14} />
        {wk.gym}
        <ChevronRight size={14} />
      </button>
      <div className={v.stats}>
        <div className={v.stat}>
          <b>
            {done}/{wk.entries.length}
          </b>
          <span>exercises</span>
        </div>
        <div className={v.stat}>
          <b>{sets}</b>
          <span>work sets</span>
        </div>
        <div className={v.stat}>
          <b>{fmtInt(volume)}</b>
          <span>lb volume</span>
        </div>
      </div>
    </div>
  );
}

function ExerciseCard({
  entry,
  prev,
  onLog,
}: {
  entry: ExerciseEntry;
  prev: { same: PrevEntry | null; other: PrevEntry | null };
  onLog: (setId?: string) => void;
}) {
  const target = entry.target;
  const work = entry.sets.filter((s) => !s.warmup).length;
  const empties = target ? Math.max(0, target.sets - work) : 0;
  let n = 0;

  return (
    <div className={v.card}>
      <div className={v.exHead}>
        <div className={v.exName}>{entry.name}</div>
        {target && (
          <div className={v.exTarget}>
            {target.sets}×{target.reps}
          </div>
        )}
      </div>
      {(entry.equipment || entry.assisted || entry.perHand) && (
        <div className={v.exMeta}>
          {entry.equipment}
          {entry.perHand && <span className={v.badge}>per hand</span>}
          {entry.assisted && <span className={`${v.badge} ${v.badgeWarn}`}>assist · lower = stronger</span>}
        </div>
      )}

      {entry.cardio ? (
        <div className={v.cardio}>
          <div>
            <b>{entry.cardio.mph}</b>
            <span>mph</span>
          </div>
          <div>
            <b>{entry.cardio.incline}%</b>
            <span>incline</span>
          </div>
          <div>
            <b>{entry.cardio.minutes}</b>
            <span>min</span>
          </div>
        </div>
      ) : (
        <div className={v.chips}>
          {entry.sets.map((s) => (
            <SetChip key={s.id} set={s} index={s.warmup ? undefined : ++n} onClick={() => onLog(s.id)} />
          ))}
          {Array.from({ length: empties }, (_, i) => (
            <button key={`e${i}`} className={`${v.chip} ${v.chipEmpty}`} onClick={() => onLog()}>
              — <small>×{target!.reps}</small>
            </button>
          ))}
          <button className={`${v.chip} ${v.chipAdd}`} onClick={() => onLog()} aria-label="Add set">
            <Plus size={18} />
          </button>
        </div>
      )}

      {(prev.same || prev.other) && (
        <div className={v.last}>
          {prev.same && (
            <div className={v.lastRow}>
              <span>
                <b>Last here</b> · {fmtShort(prev.same.date)}
              </span>
              <span className={v.lastVal}>{summary(prev.same.entry)}</span>
            </div>
          )}
          {prev.other && (
            <div className={`${v.lastRow} ${v.lastOther}`}>
              <span>
                {fmtShort(prev.other.date)} · {prev.other.gym.split(" · ")[0]}
                {prev.other.entry.equipment && prev.other.entry.equipment !== entry.equipment && (
                  <> · {prev.other.entry.equipment}</>
                )}
              </span>
              <span className={v.lastVal}>{summary(prev.other.entry)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function summary(e: ExerciseEntry) {
  if (e.cardio) return `${e.cardio.mph} mph · ${e.cardio.incline}% · ${e.cardio.minutes} min`;
  return e.sets
    .filter((s) => !s.warmup)
    .map((s) => setShort(s, e.target?.reps))
    .join(" · ");
}

function EmptyDay() {
  const st = useStore();
  const recent = recentTitles(st.workouts, st.date);
  return (
    <div className={v.empty}>
      <div className={v.emptyTitle}>No training logged</div>
      Rest day, or start from a recent session.
      <div style={{ marginTop: 18 }}>
        {recent.map((w) => (
          <button key={w.date} className={v.suggest} onClick={() => st.startWorkout(st.date, w)}>
            <div>
              <b>{w.title}</b>
              <span>
                {w.entries.length} exercises · last {fmtShort(w.date)} · {w.gym.split(" · ")[0]}
              </span>
            </div>
            <ChevronRight size={18} />
          </button>
        ))}
        <button className={v.addRow} onClick={() => st.startWorkout(st.date)}>
          <Plus size={18} /> Start empty
        </button>
      </div>
    </div>
  );
}
