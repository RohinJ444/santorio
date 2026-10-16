'use client';

import { useState } from 'react';
import { useData } from '@/lib/data-store';
import { bodyEstimates, energyOut } from '@/lib/domain/home';
import { combineTotals, NUTRIENTS, nutrientTotals, type NutrientTotal } from '@/lib/domain/nutrition';
import { nutrientTargets, type Target } from '@/lib/domain/targets';
import { shiftDate } from '@/lib/domain/workouts';
import { Segmented } from './controls';
import n from './nutrition.module.css';

/** Cronometer's grouping, in its order. Energy has its own card above. */
const GROUPS: { title: string; keys: string[] }[] = [
  { title: 'General', keys: ['alcohol', 'caffeine', 'theobromine', 'water'] },
  { title: 'Carbohydrates', keys: ['carbs', 'fiber', 'starch', 'sugar', 'added_sugar', 'sugar_alcohol'] },
  { title: 'Lipids', keys: ['fat', 'saturated_fat', 'monounsaturated_fat', 'polyunsaturated_fat', 'trans_fat', 'cholesterol', 'omega_3', 'omega_6', 'ala', 'epa', 'dha'] },
  { title: 'Protein', keys: ['protein', ...NUTRIENTS.filter(x => x.group === 'Amino acids').map(x => x.key)] },
  { title: 'Vitamins', keys: NUTRIENTS.filter(x => x.group === 'Vitamins').map(x => x.key) },
  { title: 'Minerals', keys: NUTRIENTS.filter(x => x.group === 'Minerals').map(x => x.key) },
];
const CATALOG = new Map(NUTRIENTS.map(x => [x.key, x]));

const fmt = (value: number) => value >= 100 ? Math.round(value).toLocaleString() : value >= 10 ? String(Number(value.toFixed(1))) : String(Number(value.toFixed(2)));
type Amount = { amount: number | null; partial: boolean; unit: string; label: string };

/** Draft: every nutrient against a daily target, for the day or a 7-day average of logged days. */
export default function NutritionGoals({ date }: { date: string }) {
  const { records, profile, today } = useData();
  const [range, setRange] = useState<'day' | 'week'>('day');
  const entries = Object.values(records.diary);
  const measurements = Object.values(records.measurements);
  const days = range === 'day' ? [date] : Array.from({ length: 7 }, (_, i) => shiftDate(date, i - 6));
  const logged = days.map(day => entries.filter(entry => entry.date === day)).filter(list => list.length).map(list => combineTotals(list.map(entry => nutrientTotals(entry.ingredients, entry.multiplier))));
  // An empty day is a day of zero intake, as on the home screen; an average needs at least one logged day.
  if (range === 'day' && !logged.length) logged.push(nutrientTotals([]));

  // Average over logged days. A nutrient no logged food reports stays unknown, never zero.
  const amounts = new Map<string, Amount>();
  const keys = new Set([...NUTRIENTS.map(x => x.key), ...logged.flatMap(day => day.map(t => t.key))]);
  for (const key of keys) {
    const per = logged.map(day => day.find(t => t.key === key));
    const known = per.filter((t): t is NutrientTotal => t?.amount != null);
    const definition = CATALOG.get(key) ?? per.find(Boolean);
    amounts.set(key, { amount: known.length ? known.reduce((sum, t) => sum + t.amount!, 0) / logged.length : null, partial: known.length < logged.length || known.some(t => t.partial), unit: definition?.unit ?? '', label: definition?.label ?? key });
  }

  const current = bodyEstimates(profile, measurements, today);
  const burnedDays = days.filter(day => day <= today).map(day => { const est = bodyEstimates(profile, measurements, day); return energyOut(records.metrics[day], est.tdee ?? current.tdee, est.bmr ?? current.bmr).value; }).filter((v): v is number => v !== null);
  const burned = burnedDays.length ? burnedDays.reduce((a, b) => a + b, 0) / burnedDays.length : null;
  const energyTarget = burned === null ? null : burned + profile.goals.balanceTarget;
  const targets = nutrientTargets({ sex: profile.sex, age: current.age, weightKg: current.weightKg, energy: energyTarget, proteinG: profile.goals.proteinG });
  const consumed = logged.length ? amounts.get('energy')?.amount ?? 0 : null;
  const left = energyTarget !== null ? energyTarget - (consumed ?? 0) : null;

  const macro = (key: 'protein' | 'carbs' | 'fat', kcal: number) => (amounts.get(key)?.amount ?? 0) * kcal;
  const macroKcal = { protein: macro('protein', 4), carbs: macro('carbs', 4), fat: macro('fat', 9) };
  const macroTotal = macroKcal.protein + macroKcal.carbs + macroKcal.fat;

  return <div className={n.stack}>
    <Segmented className={n.rangeToggle} label="Range" value={range} onChange={setRange} options={[{ value: 'day', label: 'This day' }, { value: 'week', label: '7-day average' }]} />
    {range === 'week' ? <p className={n.meta} style={{ marginTop: -8 }}>{logged.length} of 7 days logged · averages use logged days only</p> : null}

    <section className={n.card} aria-label="Energy">
      <div className={n.energyRow}>
        <div><small>Consumed</small><b style={{ color: 'var(--in)' }}>{consumed === null ? '—' : fmt(consumed)}</b></div>
        <div><small>Burned</small><b style={{ color: 'var(--out)' }}>{burned === null ? '—' : `≈${fmt(burned)}`}</b></div>
        <div><small>Target</small><b>{energyTarget === null ? '—' : fmt(energyTarget)}</b></div>
      </div>
      {energyTarget !== null ? <Bar value={consumed ?? 0} target={{ amount: energyTarget, kind: 'min' }} tone="var(--in)" /> : null}
      <p className={n.meta}>{left === null ? 'Add your weight, height, birthday and sex in Settings for an energy target.' : left >= 0 ? `${fmt(left)} kcal to go` : `${fmt(-left)} kcal over`} · target is burned {profile.goals.balanceTarget === 0 ? '± 0' : `${profile.goals.balanceTarget > 0 ? '+' : '−'} ${Math.abs(profile.goals.balanceTarget)}`}</p>
    </section>

    <section className={n.card} aria-label="Macronutrients">
      <h2 className={n.groupTitle}>Macronutrients</h2>
      <div className={n.split} role="img" aria-label={macroTotal ? `Energy from protein ${Math.round(macroKcal.protein / macroTotal * 100)}%, carbs ${Math.round(macroKcal.carbs / macroTotal * 100)}%, fat ${Math.round(macroKcal.fat / macroTotal * 100)}%` : 'No macronutrients logged'}>
        {macroTotal ? (['protein', 'carbs', 'fat'] as const).map(key => <i key={key} data-macro={key} style={{ flexGrow: macroKcal[key] }} />) : <i data-macro="none" />}
      </div>
      <div className={n.splitLegend}>{(['protein', 'carbs', 'fat'] as const).map(key => <span key={key} data-macro={key}>{key} {macroTotal ? `${Math.round(macroKcal[key] / macroTotal * 100)}%` : '—'}</span>)}</div>
      {(['protein', 'carbs', 'fat'] as const).map(key => <NutrientRow key={key} value={amounts.get(key)!} target={targets[key]} />)}
    </section>

    {GROUPS.map(group => <section className={n.card} key={group.title} aria-label={group.title}>
      <h2 className={n.groupTitle}>{group.title}</h2>
      {group.keys.filter(key => !['protein', 'carbs', 'fat'].includes(key)).map(key => amounts.get(key) ? <NutrientRow key={key} value={amounts.get(key)!} target={targets[key]} /> : null)}
    </section>)}

    <p className={n.meta}>Draft. Targets are US Dietary Reference Intakes{profile.sex ? ` for ${profile.sex === 'male' ? 'a man' : 'a woman'}${current.age !== null ? `, ${current.age}` : ''}` : ' (set sex in Settings for vitamin and mineral targets)'}; sodium, caffeine, saturated fat and added sugar are limits. Fat is 30% of the energy target and carbs fill the rest. Amino acids scale with body weight. A dash means no logged food reports it; “+” means some foods don’t.</p>
  </div>;
}

function NutrientRow({ value, target }: { value: Amount; target?: Target }) {
  const pct = target && value.amount !== null ? value.amount / target.amount * 100 : null;
  const over = target?.kind === 'max' && pct !== null && pct > 100;
  return <div className={n.goalRow} data-state={value.amount === null ? 'unknown' : over ? 'over' : pct !== null && pct >= 100 ? 'met' : 'part'}>
    <span className={n.goalName}>{value.label}{target?.kind === 'max' ? <i> max</i> : null}</span>
    {target ? <Bar value={value.amount ?? 0} target={target} /> : <span />}
    <span className={n.goalValue}>{value.amount === null ? '—' : fmt(value.amount)}{value.partial && value.amount !== null ? '+' : ''}{target ? <i> / {fmt(target.amount)}</i> : null} {value.unit}</span>
    <span className={n.goalPct}>{pct === null ? '' : `${Math.round(pct)}%`}</span>
  </div>;
}

function Bar({ value, target, tone }: { value: number; target: Target; tone?: string }) {
  const pct = Math.max(0, value / target.amount * 100);
  return <span className={n.goalBar} data-kind={target.kind} aria-hidden><i style={{ width: `${Math.min(100, pct)}%`, ...(tone ? { background: tone } : {}) }} data-over={target.kind === 'max' && pct > 100} /></span>;
}
