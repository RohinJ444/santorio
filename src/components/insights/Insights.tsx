"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useData } from "@/lib/data-store";
import { addDays, parseIso } from "@/lib/dates";
import { dailyIntake, latestMeasurement } from "@/lib/domain/home";
import { waterOunces } from "@/lib/domain/water";
import { exerciseHasResults, completedWorkingSets } from "@/lib/domain/workouts";
import { Bars } from "./charts";
import s from "./insights.module.css";

const integer = (value: number) => Math.round(value).toLocaleString("en-US");
const shortDate = (date: string) => parseIso(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function Tile({ kicker, value, unit, note, tone, children }: { kicker: string; value: ReactNode; unit?: string; note?: string; tone?: "in" | "out" | "warn"; children?: ReactNode }) {
  return <div className={s.tile} data-tone={tone}><div className={s.kicker}>{kicker}</div><div className={s.value}>{value}{unit ? <small>{unit}</small> : null}</div>{children ? <div className={s.chart}>{children}</div> : null}{note ? <div className={s.note}>{note}</div> : null}</div>;
}

/** Home insights use recorded data only. Unlogged days never receive sample values. */
export default function Insights() {
  const { records, profile, today } = useData();
  const entries = Object.values(records.diary);
  const days = Array.from({ length: 14 }, (_, index) => addDays(today, index - 13));
  const week = days.slice(-7).map(date => ({ date, ...dailyIntake(entries, date) }));
  const logged = week.filter(day => day.energy !== null);
  const average = logged.length ? logged.reduce((sum, day) => sum + day.energy!, 0) / logged.length : null;
  const healthDays = days.map(date => records.metrics[date]).filter(day => day?.source === "apple_health" && day.completeDay && day.activeEnergy !== null && day.restingEnergy !== null);
  const energyAverage = healthDays.length ? healthDays.reduce((sum, day) => sum + day.activeEnergy! + day.restingEnergy!, 0) / healthDays.length : null;
  const sessions = Object.values(records.workouts).filter(session => session.date >= days[0] && session.date <= today && session.exercises.some(exerciseHasResults));
  const sets = sessions.reduce((sum, session) => sum + session.exercises.reduce((count, exercise) => count + completedWorkingSets(exercise), 0), 0);
  const trainingDays = new Set(sessions.map(session => session.date)).size;
  const weighIn = latestMeasurement(Object.values(records.measurements), "weight_kg", today);
  const weight = weighIn ? weighIn.value * (profile.weightUnit === "lb" ? 1 / 0.45359237 : 1) : null;
  const proteinDays = week.filter(day => day.protein !== null);
  const hits = proteinDays.filter(day => day.protein! >= profile.goals.proteinG).length;
  const metrics = records.metrics[today];

  return <div className={s.grid}>
    <div style={{ gridColumn: "span 2" }}><Tile kicker="Logged intake · 7 days" value={average === null ? "—" : integer(average)} unit={average === null ? undefined : "kcal / logged day"} tone="in" note={logged.length ? `${logged.length} of 7 days have food entries. Only logged days are shown; entries may not represent a full day.` : "Log food to begin your intake history."}>
      {logged.length ? <Bars values={logged.map(day => day.energy!)} labels={logged.map(day => shortDate(day.date))} color="var(--in)" /> : null}
    </Tile></div>
    <div style={{ gridColumn: "span 2" }}><Tile kicker="Health energy · 14 days" value={energyAverage === null ? "—" : `≈${integer(energyAverage)}`} unit={energyAverage === null ? undefined : "kcal / complete day"} tone="out" note={healthDays.length ? `${healthDays.length} complete imported days. Resting + active energy; workouts are already included.` : "Complete-day Apple Health imports will appear here once the exporter is connected."}>
      {healthDays.length ? <Bars values={healthDays.map(day => day.activeEnergy! + day.restingEnergy!)} labels={healthDays.map(day => shortDate(day.date))} /> : null}
    </Tile></div>
    <Tile kicker="Training · 14 days" value={String(sessions.length)} unit="sessions" note={`${trainingDays} training days · ${sets} working sets recorded`}><Link href="/workout" className={s.note}>Open training history →</Link></Tile>
    <Tile kicker="Protein goal · 7 days" value={proteinDays.length ? `${hits}/${proteinDays.length}` : "—"} unit={proteinDays.length ? "logged days hit" : undefined} tone="in" note={`${profile.goals.proteinG} g goal · unlogged days are unknown`}><div className={s.dots}>{week.map(day => <span key={day.date} className={day.protein !== null && day.protein >= profile.goals.proteinG ? s.dotOn : s.dot} title={`${shortDate(day.date)}: ${day.protein === null ? "not logged" : `${integer(day.protein)} g logged`}`} />)}</div></Tile>
    <Tile kicker="Latest weight" value={weight === null ? "—" : weight.toFixed(1)} unit={weight === null ? undefined : profile.weightUnit} note={weighIn ? `${shortDate(weighIn.date)} · ${weighIn.source === "apple_health" ? "Apple Health" : "manual"}` : "Add a measurement in Settings."} />
    <Tile kicker="Water · today" value={waterOunces(metrics?.waterL ?? 0)} unit={`/ ${waterOunces(profile.goals.waterL)} fl oz`} note="Logged water"><Link href="/diet" className={s.note}>Add water →</Link></Tile>
  </div>;
}
