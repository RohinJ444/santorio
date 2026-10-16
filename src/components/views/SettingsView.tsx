"use client";

import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fmtShort } from "@/lib/dates";
import { ACTIVITY, ageOn, fmtInt, fmtSigned } from "@/lib/energy";
import { useStore } from "@/lib/store";
import { fluidOuncesToLiters, waterOunces } from "@/lib/domain/water";
import type { Activity, Sex, WeighIn } from "@/lib/types";
import { Figure } from "../ui/icons";
import { viewMotion } from "./DayHeader";
import v from "./views.module.css";

type Mode = "cut" | "maintain" | "bulk";

export default function SettingsView() {
  const st = useStore();
  const router = useRouter();
  const p = st.profile;
  const g = st.goals;
  const [weighing, setWeighing] = useState<string | null>(null);
  const mode: Mode = st.balanceTarget < 0 ? "cut" : st.balanceTarget > 0 ? "bulk" : "maintain";
  const ft = Math.floor(p.heightIn / 12);
  const inch = p.heightIn % 12;

  return (
    <motion.div className={v.view} {...viewMotion}>
      <div className={v.head}>
        <div className={v.headRow}>
          <button className={v.iconBtn} onClick={() => router.push("/")} aria-label="Back to body">
            <Figure size={20} />
          </button>
          <div className={v.section}>Settings</div>
          <span style={{ width: 42 }} />
        </div>
      </div>

      <Group title="Profile">
        <Row label="Name">
          <input
            className={v.input}
            style={{ width: 140 }}
            value={p.name}
            onChange={(e) => st.updateProfile({ name: e.target.value })}
            aria-label="Name"
          />
        </Row>
        <Row label="Birthday" sub={`${ageOn(p.birthday, st.today)} years`}>
          <input
            className={v.input}
            style={{ width: 150 }}
            type="date"
            value={p.birthday}
            onChange={(e) => e.target.value && st.updateProfile({ birthday: e.target.value })}
            aria-label="Birthday"
          />
        </Row>
        <Row label="Sex" sub="for the BMR formula">
          <Seg<Sex>
            value={p.sex}
            options={[
              ["male", "Male"],
              ["female", "Female"],
            ]}
            onChange={(sex) => st.updateProfile({ sex: p.sex === sex ? null : sex })}
          />
        </Row>
        <Row label="Height">
          <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              className={`${v.input} ${v.inputSm}`}
              inputMode="numeric"
              value={ft}
              onChange={(e) => st.updateProfile({ heightIn: Number(e.target.value || 0) * 12 + inch })}
              aria-label="Feet"
            />
            <span className={v.side}>ft</span>
            <input
              className={`${v.input} ${v.inputSm}`}
              inputMode="numeric"
              value={inch}
              onChange={(e) => st.updateProfile({ heightIn: ft * 12 + Math.min(11, Number(e.target.value || 0)) })}
              aria-label="Inches"
            />
            <span className={v.side}>in</span>
          </span>
        </Row>
        <div className={v.row} style={{ display: "block" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div className={v.rowLabel}>
              Weight
              <small>{st.latestWeighIn ? `latest · ${fmtShort(st.latestWeighIn.date)}` : "no weigh-ins yet"}</small>
            </div>
            {weighing === null ? (
              <button className={v.readout} onClick={() => setWeighing(String(st.latestWeighIn?.lb ?? ""))}>
                {st.latestWeighIn?.lb.toFixed(1)} lb <span className={v.side}>+ log</span>
              </button>
            ) : (
              <span style={{ display: "flex", gap: 6 }}>
                <input
                  className={v.input}
                  inputMode="decimal"
                  autoFocus
                  value={weighing}
                  onChange={(e) => setWeighing(e.target.value)}
                  aria-label="Today's weight in pounds"
                />
                <button
                  className={v.toggle}
                  style={{ height: 36 }}
                  onClick={() => {
                    const lb = Number(weighing);
                    if (lb > 0) st.addWeighIn(lb);
                    setWeighing(null);
                  }}
                >
                  Save
                </button>
              </span>
            )}
          </div>
          <Spark points={st.weighIns} />
        </div>
      </Group>
      <p className={v.hint}>Weight is a log, not a setting: BMR uses the latest weigh-in, and the trend feeds later charts.</p>

      <Group title="Energy">
        <Row label="BMR" sub={p.sex ? "Mifflin–St Jeor" : "Mifflin–St Jeor · set sex for accuracy"}>
          <span className={v.readout}>≈{fmtInt(st.bmr)} kcal</span>
        </Row>
        <Row label="Activity">
          <Seg<Activity>
            value={p.activity}
            options={(Object.keys(ACTIVITY) as Activity[]).map((k) => [k, ACTIVITY[k].label])}
            onChange={(activity) => st.updateProfile({ activity })}
          />
        </Row>
        <Row label="TDEE" sub={`BMR × ${ACTIVITY[p.activity].factor}`}>
          <span className={v.readout}>≈{fmtInt(st.tdee)} kcal</span>
        </Row>
        <Row label="Goal" sub="energy balance vs TDEE">
          <Seg<Mode>
            value={mode}
            options={[
              ["cut", "Cut"],
              ["maintain", "Maintain"],
              ["bulk", "Bulk"],
            ]}
            onChange={(m) => {
              const amount = Math.abs(st.balanceTarget) || (m === "cut" ? 300 : 250);
              st.updateGoals({ balanceTarget: m === "maintain" ? 0 : m === "cut" ? -amount : amount });
            }}
          />
        </Row>
        {mode !== "maintain" && (
          <Row label="Daily target" sub={`${fmtSigned(st.balanceTarget)} kcal a day`}>
            <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                className={v.input}
                inputMode="numeric"
                value={Math.abs(st.balanceTarget)}
                onChange={(e) => {
                  const amount = Math.max(0, Number(e.target.value.replace(/\D/g, "") || 0));
                  st.updateGoals({ balanceTarget: mode === "cut" ? -amount : amount });
                }}
                aria-label="Daily energy balance target in kcal"
              />
              <span className={v.side}>kcal</span>
            </span>
          </Row>
        )}
        <Row label="Calorie goal" sub="TDEE + target">
          <span className={v.readout}>≈{fmtInt(st.calorieGoal)} kcal</span>
        </Row>
      </Group>

      <Group title="Daily goals">
        <NumRow label="Protein" unit="g" value={g.proteinG} onChange={(proteinG) => st.updateGoals({ proteinG })} />
        <NumRow label="Steps" value={g.steps} onChange={(steps) => st.updateGoals({ steps })} />
        <NumRow label="Water" unit="fl oz" value={waterOunces(g.waterL)} onChange={(ounces) => st.updateGoals({ waterL: fluidOuncesToLiters(ounces) })} />
      </Group>

      <Group title="Training">
        <Row label="Default gym">
          <span className={v.rowLabel} style={{ color: "var(--text-2)" }}>
            {st.gyms[0]}
          </span>
        </Row>
        <Row label="Units">
          <Seg value="lb" options={[["lb", "lb"]]} onChange={() => {}} />
        </Row>
      </Group>
      <p className={v.hint}>Prototype: changes live in memory and reset on reload.</p>
    </motion.div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={v.group}>
      <div className={v.groupTitle}>{title}</div>
      <div className={v.rows}>{children}</div>
    </div>
  );
}

function Row({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className={v.row}>
      <div className={v.rowLabel}>
        {label}
        {sub && <small>{sub}</small>}
      </div>
      {children}
    </div>
  );
}

function NumRow({ label, unit, value, onChange }: { label: string; unit?: string; value: number; onChange: (n: number) => void }) {
  return (
    <Row label={label}>
      <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          className={v.input}
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(Number(e.target.value || 0))}
          aria-label={label}
        />
        {unit && <span className={v.side}>{unit}</span>}
      </span>
    </Row>
  );
}

function Seg<T extends string | null>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: [Exclude<T, null>, string][];
  onChange: (v: Exclude<T, null>) => void;
}) {
  return (
    <div className={v.seg}>
      {options.map(([k, label]) => (
        <button key={k} aria-pressed={value === k} onClick={() => onChange(k)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Spark({ points }: { points: WeighIn[] }) {
  if (points.length < 2) return null;
  const xs = points.map((_, i) => (i / (points.length - 1)) * 100);
  const lbs = points.map((p) => p.lb);
  const lo = Math.min(...lbs) - 0.5;
  const hi = Math.max(...lbs) + 0.5;
  const ys = lbs.map((lb) => 40 - ((lb - lo) / (hi - lo)) * 34);
  const d = xs.map((x, i) => `${i ? "L" : "M"}${x},${ys[i]}`).join(" ");
  return (
    <svg className={v.spark} viewBox="0 0 100 46" preserveAspectRatio="none" aria-label="Weight trend">
      <path d={d} fill="none" stroke="var(--out)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
