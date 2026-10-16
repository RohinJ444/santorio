"use client";

/**
 * Home insights: a modular grid. Each tile is an entry in INSIGHTS with a span
 * (1 = half width, 2 = full) and a render function over shared, precomputed data.
 * Only recorded data is drawn; a day without data is a faint dashed placeholder,
 * never a made-up value.
 */
import type { ReactNode } from "react";
import { useData } from "@/lib/data-store";
import { addDays, parseIso } from "@/lib/dates";
import { fmtInt } from "@/lib/energy";
import { bodyEstimates, dailyIntake, energyOut, latestMeasurement } from "@/lib/domain/home";
import { exerciseHasResults } from "@/lib/domain/workouts";
import type { Measurement } from "@/lib/domain/types";
import { Plus } from "../ui/icons";
import { Bars, Lines } from "./charts";
import s from "./insights.module.css";

const KCAL_PER_LB = 3500;
const LB = 0.45359237;

type Day = { date: string; qin: number | null; qout: number | null; balance: number | null; protein: number | null; steps: number | null };
type Data = { week: Day[]; fortnight: Day[]; sessions: number[]; weighIns: Measurement[]; unit: "lb" | "kg"; goals: { proteinG: number; steps: number } };
type Insight = { id: string; span: 1 | 2; render: (d: Data) => ReactNode };

const dayLetter = (iso: string) => parseIso(iso).toLocaleDateString("en-US", { weekday: "narrow" });
const signed = (n: number) => `${n < 0 ? "−" : "+"}${fmtInt(Math.abs(n))}`;
const known = <T,>(values: (T | null)[]) => values.filter((v): v is T => v !== null);

export const INSIGHTS: Insight[] = [
  {
    id: "energy-out-week",
    span: 2,
    render: ({ week }) => {
      const out = known(week.map((p) => p.qout));
      const avg = out.length ? out.reduce((a, b) => a + b, 0) / out.length : null;
      return (
        <Tile kicker="Energy out · 7 days" value={avg === null ? "—" : <>≈{fmtInt(avg)}</>} unit={avg === null ? undefined : "kcal/day avg"} tone="out" note="TDEE estimate, with Apple Health active energy where imported">
          <Bars values={week.map((p) => p.qout)} labels={week.map((p) => dayLetter(p.date))} highlight={week.length - 1} avg />
        </Tile>
      );
    },
  },
  {
    id: "energy-balance-fortnight",
    span: 2,
    render: ({ fortnight }) => {
      const logged = known(fortnight.map((p) => p.balance));
      const net = logged.reduce((a, b) => a + b, 0);
      return (
        <Tile
          kicker="Energy balance · 14 days"
          value={logged.length ? signed(net) : "—"}
          unit={logged.length ? `kcal net · ≈${net < 0 ? "−" : "+"}${Math.abs(net / KCAL_PER_LB).toFixed(1)} lb` : undefined}
          tone={logged.length ? (net < 0 ? "out" : "warn") : undefined}
          note={`${logged.length} of 14 days have food logged`}
        >
          <Bars values={fortnight.map((p) => p.balance)} color="var(--warn)" negColor="var(--out)" highlight={fortnight.length - 1} />
          <Legend items={[["var(--out)", "deficit"], ["var(--warn)", "surplus"]]} />
        </Tile>
      );
    },
  },
  {
    id: "intake-vs-expenditure",
    span: 2,
    render: ({ fortnight }) => (
      <Tile kicker="Intake vs expenditure · 14 days" value={null}>
        <Lines series={[{ values: fortnight.map((p) => p.qout), color: "var(--out)", dashed: true }, { values: fortnight.map((p) => p.qin), color: "var(--in)" }]} />
        <Legend items={[["var(--in)", "Q in · logged"], ["var(--out)", "Q out · TDEE est."]]} />
      </Tile>
    ),
  },
  {
    id: "weight",
    span: 1,
    render: ({ weighIns, unit }) => {
      const shown = (m: Measurement) => m.value * (unit === "lb" ? 1 / LB : 1);
      const last = weighIns.at(-1);
      const delta = last && weighIns[0] ? shown(last) - shown(weighIns[0]) : 0;
      return (
        <Tile kicker="Weight · 30 days" value={last ? shown(last).toFixed(1) : "—"} unit={last ? `${unit}${weighIns.length > 1 ? ` · ${delta <= 0 ? "−" : "+"}${Math.abs(delta).toFixed(1)}` : ""}` : undefined}>
          {weighIns.length > 1 ? <Lines series={[{ values: weighIns.map(shown), color: "var(--text-2)" }]} height={46} /> : <Placeholder height={46} />}
        </Tile>
      );
    },
  },
  {
    id: "training-weeks",
    span: 1,
    render: ({ sessions }) => (
      <Tile kicker="Sessions · 4 wks" value={String(sessions[sessions.length - 1])} unit="this week" tone="out">
        <Bars values={sessions.map((n) => (n ? n : null))} highlight={sessions.length - 1} height={46} zero />
      </Tile>
    ),
  },
  {
    id: "steps-week",
    span: 1,
    render: ({ week, goals }) => {
      const steps = known(week.map((p) => p.steps));
      const avg = steps.length ? steps.reduce((a, b) => a + b, 0) / steps.length : null;
      return (
        <Tile kicker="Steps · 7 days" value={avg === null ? "—" : fmtInt(avg)} unit={avg === null ? undefined : "avg"} tone="out">
          <Bars values={week.map((p) => p.steps)} goal={goals.steps} highlight={week.length - 1} height={46} zero />
        </Tile>
      );
    },
  },
  {
    id: "protein-week",
    span: 1,
    render: ({ week, goals }) => {
      const loggedDays = week.filter((p) => p.protein !== null);
      const hits = loggedDays.filter((p) => p.protein! >= goals.proteinG * 0.95).length;
      return (
        <Tile kicker="Protein goal" value={loggedDays.length ? `${hits}/${loggedDays.length}` : "—"} unit={loggedDays.length ? "logged days hit" : undefined} tone="in">
          <div className={s.dots}>
            {week.map((p) => (
              <span key={p.date} className={p.protein !== null && p.protein >= goals.proteinG * 0.95 ? s.dotOn : s.dot} data-empty={p.protein === null} title={p.protein === null ? "not logged" : `${fmtInt(p.protein)} g`} />
            ))}
          </div>
        </Tile>
      );
    },
  },
  {
    id: "placeholder",
    span: 1,
    render: () => (
      <div className={`${s.tile} ${s.ghost}`}>
        <Plus size={18} />
        <span>Add insight</span>
      </div>
    ),
  },
];

function Tile({ kicker, value, unit, note, tone, children }: { kicker: string; value: ReactNode; unit?: string; note?: string; tone?: "in" | "out" | "warn"; children?: ReactNode }) {
  return (
    <div className={s.tile} data-tone={tone}>
      <div className={s.kicker}>{kicker}</div>
      {value !== null && (
        <div className={s.value}>
          {value}
          {unit && <small>{unit}</small>}
        </div>
      )}
      <div className={s.chart}>{children}</div>
      {note && <div className={s.note}>{note}</div>}
    </div>
  );
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className={s.legend}>
      {items.map(([c, label]) => (
        <span key={label}>
          <i style={{ background: c }} />
          {label}
        </span>
      ))}
    </div>
  );
}

/** Dashed baseline where a chart will be once there's data. */
function Placeholder({ height }: { height: number }) {
  return <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }}><path d={`M0,${height * 0.7} C30,${height * 0.55} 60,${height * 0.8} 100,${height * 0.5}`} fill="none" stroke="var(--line-strong)" strokeDasharray="3 3" strokeWidth={1} vectorEffect="non-scaling-stroke" /></svg>;
}

export default function Insights() {
  const { records, profile, today } = useData();
  const entries = Object.values(records.diary);
  const measurements = Object.values(records.measurements);
  // A day before the first weigh-in uses today's estimate rather than having no expenditure at all.
  const current = bodyEstimates(profile, measurements, today);
  const fortnight: Day[] = Array.from({ length: 14 }, (_, i) => {
    const date = addDays(today, i - 13);
    const intake = dailyIntake(entries, date);
    const estimates = bodyEstimates(profile, measurements, date);
    const qout = energyOut(records.metrics[date], estimates.tdee ?? current.tdee, estimates.bmr ?? current.bmr).value;
    const qin = intake.count > 0 ? intake.energy : null;
    return { date, qin, qout, balance: qin !== null && qout !== null ? qin - qout : null, protein: intake.count > 0 ? intake.protein : null, steps: records.metrics[date]?.steps ?? null };
  });
  const trained = new Set(Object.values(records.workouts).filter((w) => w.exercises.some(exerciseHasResults)).map((w) => w.date));
  const sessions = Array.from({ length: 4 }, (_, k) => Array.from({ length: 7 }, (_, d) => addDays(today, -7 * (3 - k) - d)).filter((date) => trained.has(date)).length);
  const since = addDays(today, -30);
  const weighIns = measurements.filter((m) => m.kind === "weight_kg" && m.date >= since && m.date <= today).sort((a, b) => a.date.localeCompare(b.date) || a.recordedAt.localeCompare(b.recordedAt));
  if (!weighIns.length) {
    const latest = latestMeasurement(measurements, "weight_kg", today);
    if (latest) weighIns.push(latest);
  }
  const data: Data = { fortnight, week: fortnight.slice(-7), sessions, weighIns, unit: profile.weightUnit, goals: profile.goals };

  return (
    <div className={s.grid}>
      {INSIGHTS.map((it) => (
        <div key={it.id} style={{ gridColumn: `span ${it.span}` }}>
          {it.render(data)}
        </div>
      ))}
    </div>
  );
}
