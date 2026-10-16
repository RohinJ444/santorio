"use client";

/**
 * Home insights: a modular grid. Each tile is an entry in INSIGHTS with a span
 * (1 = half width, 2 = full) and a render function over shared, precomputed data.
 * Add, remove or reorder tiles by editing the registry.
 */
import type { ReactNode } from "react";
import { parseIso } from "@/lib/dates";
import { fmtInt } from "@/lib/energy";
import { daySeries, KCAL_PER_LB, weeklySessions, type DayPoint } from "@/lib/insights";
import { useStore } from "@/lib/store";
import type { WeighIn } from "@/lib/types";
import { Plus } from "../ui/icons";
import { Bars, Lines } from "./charts";
import s from "./insights.module.css";

type Data = {
  week: DayPoint[];
  fortnight: DayPoint[];
  sessions: { end: string; sessions: number; sample: boolean }[];
  weighIns: WeighIn[];
  proteinGoal: number;
};

type Insight = { id: string; span: 1 | 2; render: (d: Data) => ReactNode };

const dayLetter = (iso: string) => parseIso(iso).toLocaleDateString("en-US", { weekday: "narrow" });
const signed = (n: number) => `${n < 0 ? "−" : "+"}${fmtInt(Math.abs(n))}`;
const anySample = (pts: { sample: boolean }[]) => pts.some((p) => p.sample);

export const INSIGHTS: Insight[] = [
  {
    id: "energy-out-week",
    span: 2,
    render: ({ week }) => {
      const avg = week.reduce((a, p) => a + p.qout, 0) / week.length;
      return (
        <Tile
          kicker="Energy out · 7 days"
          value={<>≈{fmtInt(avg)}</>}
          unit="kcal/day avg"
          note="Estimated from TDEE, training and movement"
        >
          <Bars values={week.map((p) => p.qout)} labels={week.map((p) => dayLetter(p.date))} highlight={week.length - 1} avg />
        </Tile>
      );
    },
  },
  {
    id: "energy-balance-fortnight",
    span: 2,
    render: ({ fortnight }) => {
      const net = fortnight.reduce((a, p) => a + p.balance, 0);
      return (
        <Tile
          kicker="Energy balance · 14 days"
          value={signed(net)}
          unit={`kcal net · ≈${net < 0 ? "−" : "+"}${Math.abs(net / KCAL_PER_LB).toFixed(1)} lb`}
          note={anySample(fortnight) ? "Unlogged days show sample values" : undefined}
          tone={net < 0 ? "out" : "warn"}
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
        <Lines
          series={[
            { values: fortnight.map((p) => p.qout), color: "var(--out)", dashed: true },
            { values: fortnight.map((p) => p.qin), color: "var(--in)" },
          ]}
        />
        <Legend items={[["var(--in)", "Q in · logged"], ["var(--out)", "Q out · TDEE est."]]} />
      </Tile>
    ),
  },
  {
    id: "weight",
    span: 1,
    render: ({ weighIns }) => {
      const first = weighIns[0];
      const last = weighIns[weighIns.length - 1];
      const delta = last && first ? last.lb - first.lb : 0;
      return (
        <Tile kicker="Weight" value={last ? last.lb.toFixed(1) : "—"} unit={`lb · ${delta <= 0 ? "−" : "+"}${Math.abs(delta).toFixed(1)}`}>
          {weighIns.length > 1 && <Lines series={[{ values: weighIns.map((w) => w.lb), color: "var(--text-2)" }]} height={46} />}
        </Tile>
      );
    },
  },
  {
    id: "training-weeks",
    span: 1,
    render: ({ sessions }) => (
      <Tile kicker="Sessions · 4 wks" value={String(sessions[sessions.length - 1].sessions)} unit="this week">
        <Bars values={sessions.map((w) => w.sessions)} highlight={sessions.length - 1} height={46} />
      </Tile>
    ),
  },
  {
    id: "protein-week",
    span: 1,
    render: ({ week, proteinGoal }) => {
      const hits = week.filter((p) => p.protein >= proteinGoal * 0.95).length;
      return (
        <Tile kicker="Protein goal" value={`${hits}/7`} unit="days hit" tone="in">
          <div className={s.dots}>
            {week.map((p) => (
              <span key={p.date} className={p.protein >= proteinGoal * 0.95 ? s.dotOn : s.dot} title={`${fmtInt(p.protein)} g`} />
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

function Tile({
  kicker,
  value,
  unit,
  note,
  tone,
  children,
}: {
  kicker: string;
  value: ReactNode;
  unit?: string;
  note?: string;
  tone?: "in" | "out" | "warn";
  children?: ReactNode;
}) {
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

export default function Insights() {
  const st = useStore();
  const intake = (date: string) => {
    if (!st.days[date]?.meals.length) return null;
    const n = st.dayNutrients(date);
    return { kcal: n.kcal, protein: n.protein };
  };
  const fortnight = daySeries({ today: st.today, days: 14, tdee: st.tdee, workouts: st.workouts, intake });
  const data: Data = {
    fortnight,
    week: fortnight.slice(-7),
    sessions: weeklySessions(st.today, 4, st.workouts),
    weighIns: st.weighIns,
    proteinGoal: st.goals.proteinG,
  };

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
