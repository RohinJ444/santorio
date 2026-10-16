'use client';

import { useState, type ReactNode } from 'react';
import { useData } from '@/lib/data-store';
import { DEFAULT_BALANCE_TARGET } from '@/lib/defaults';
import { bodyEstimates, latestMeasurement } from '@/lib/domain/home';
import { pastDateError } from '@/lib/domain/settings';
import { fluidOuncesToLiters, waterOunces } from '@/lib/domain/water';
import { newId, type ProfileRecord } from '@/lib/domain/types';
import { NumberField, Segmented } from './controls';
import s from './settings.module.css';

/** Label on the left, control on the right: one line per setting. */
export function Row({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children?: ReactNode }) {
  return <div className={s.row}><div className={s.rowLabel}>{label}{hint ? <small>{hint}</small> : null}</div><div className={s.rowControl}>{children}</div></div>;
}

const LB = 0.45359237;

export function useProfilePatch() {
  const { profile, upsert } = useData();
  return (values: Partial<ProfileRecord>) => upsert('profiles', { ...profile, ...values });
}

/** Latest weight, its unit, and a new entry, all in one place. `instant` saves today's weight as you type (first run). */
export function WeightRows({ instant = false }: { instant?: boolean }) {
  const { profile, records, today, upsert } = useData();
  const patch = useProfilePatch();
  const [weight, setWeight] = useState<number | null>(null);
  const [date, setDate] = useState(today);
  const [error, setError] = useState('');
  const latest = latestMeasurement(Object.values(records.measurements), 'weight_kg', today);
  const shown = (kg: number) => (kg * (profile.weightUnit === 'lb' ? 1 / LB : 1)).toFixed(1);
  const todays = Object.values(records.measurements).find(m => m.kind === 'weight_kg' && m.source === 'manual' && m.date === today);
  const [entryId] = useState(() => todays?.id ?? newId());
  const unitToggle = <Segmented className={s.unit} label="Weight unit" value={profile.weightUnit} onChange={weightUnit => { setWeight(null); patch({ weightUnit }); }} options={[{ value: 'lb', label: 'lb' }, { value: 'kg', label: 'kg' }]} />;
  if (instant) return <Row label="Weight" hint="Today">
    <NumberField compact className={`${s.input} ${s.short}`} label={`Weight in ${profile.weightUnit}`} value={todays ? Number(shown(todays.value)) : null} min={0.01} max={profile.weightUnit === 'lb' ? 1500 : 680} step={0.1} onChange={value => { if (value !== null && value > 0) upsert('measurements', { id: entryId, date: today, kind: 'weight_kg', value: profile.weightUnit === 'lb' ? value * LB : value, source: 'manual', recordedAt: new Date().toISOString() }); }} />
    {unitToggle}
  </Row>;
  const log = () => {
    const dateError = pastDateError(date, today);
    if (weight === null || weight <= 0) { setError('Enter a weight.'); return; }
    if (dateError) { setError(dateError); return; }
    upsert('measurements', { id: newId(), date, kind: 'weight_kg', value: profile.weightUnit === 'lb' ? weight * LB : weight, source: 'manual', recordedAt: new Date().toISOString() });
    setWeight(null); setError('');
  };
  return <>
    <Row label="Weight" hint={latest ? `${latest.date === today ? 'Today' : latest.date} · ${latest.source === 'apple_health' ? 'Apple Health' : 'manual'}` : 'No entries yet'}>
      <span className={s.readout}>{latest ? shown(latest.value) : '—'}</span>
      {unitToggle}
    </Row>
    <div className={s.logRow}>
      <NumberField compact className={s.input} label={`New weight in ${profile.weightUnit}`} value={weight} onChange={setWeight} min={0.01} max={profile.weightUnit === 'lb' ? 1500 : 680} step={0.1} placeholder={`New, ${profile.weightUnit}`} />
      <input className={s.input} type="date" value={date} max={today} onChange={event => setDate(event.target.value)} aria-label="Weight date" />
      <button type="button" className={s.pill} onClick={log}>Log</button>
    </div>
    {error ? <p className={s.error} role="alert">{error}</p> : null}
  </>;
}

/** Height and its unit together; Apple Health can supply it once imported. */
export function HeightRow() {
  const { profile, records, today } = useData();
  const patch = useProfilePatch();
  const [unit, setUnit] = useState<'in' | 'cm'>(profile.weightUnit === 'lb' ? 'in' : 'cm');
  const factor = unit === 'in' ? 2.54 : 1;
  const imported = Object.values(records.measurements).filter(m => m.kind === 'height_cm' && m.source === 'apple_health' && m.date <= today).sort((a, b) => b.date.localeCompare(a.date) || b.recordedAt.localeCompare(a.recordedAt))[0];
  const estimates = bodyEstimates(profile, Object.values(records.measurements), today);
  return <>
    <Row label="Height" hint={profile.heightSource === 'apple_health' ? 'From Apple Health' : imported ? <button type="button" className={s.link} onClick={() => patch({ heightSource: 'apple_health', heightCm: imported.value, heightUpdatedAt: imported.recordedAt })}>Use Apple Health</button> : undefined}>
      {profile.heightSource === 'manual'
        ? <NumberField compact className={`${s.input} ${s.short}`} label={`Height in ${unit}`} value={profile.heightCm === null ? null : Number((profile.heightCm / factor).toFixed(1))} min={0.01} max={unit === 'in' ? 110 : 280} onChange={value => patch({ heightCm: value === null ? null : value * factor, heightSource: 'manual', heightUpdatedAt: new Date().toISOString() })} />
        : <button type="button" className={s.readout} onClick={() => patch({ heightSource: 'manual' })} title="Switch to manual entry">{estimates.heightCm === null ? '—' : (estimates.heightCm / factor).toFixed(1)}</button>}
      <Segmented className={s.unit} label="Height unit" value={unit} onChange={setUnit} options={[{ value: 'in', label: 'in' }, { value: 'cm', label: 'cm' }]} />
    </Row>
  </>;
}

export function BirthdayRow() {
  const { profile, today } = useData();
  const patch = useProfilePatch();
  const [value, setValue] = useState(profile.birthday);
  const [error, setError] = useState('');
  const save = () => { const message = pastDateError(value, today, true); setError(message ?? ''); if (!message) patch({ birthday: value }); };
  return <><Row label="Birthday"><input className={`${s.input} ${s.date}`} type="date" max={today} value={value} aria-invalid={!!error} onChange={event => setValue(event.target.value)} onBlur={save} aria-label="Birthday" /></Row>{error ? <p className={s.error} role="alert">{error}</p> : null}</>;
}

export function EstimateRows() {
  const { profile, records, today } = useData();
  const patch = useProfilePatch();
  const estimates = bodyEstimates(profile, Object.values(records.measurements), today);
  return <>
    <Row label="Sex" hint="For the energy estimate"><Segmented className={s.unit} label="Sex coefficient" value={profile.sex ?? 'unset'} onChange={value => patch({ sex: value === 'unset' ? null : value })} options={[{ value: 'male', label: 'M' }, { value: 'female', label: 'F' }, { value: 'unset', label: '—' }]} /></Row>
    <Row label="Activity"><select className={`${s.input} ${s.select}`} value={profile.activity} onChange={event => patch({ activity: event.target.value as ProfileRecord['activity'] })} aria-label="Usual activity level"><option value="sedentary">Sedentary</option><option value="light">Light</option><option value="moderate">Moderate</option><option value="very">Very active</option></select></Row>
    <Row label="Estimate" hint="Mifflin–St Jeor · resting / full day"><span className={s.readout}>{estimates.bmr === null ? '—' : Math.round(estimates.bmr)}<i> / </i>{estimates.tdee === null ? '—' : Math.round(estimates.tdee)}<i> kcal</i></span></Row>
  </>;
}

/** Cut / Maintain / Bulk, then the daily amount. Below target always means room left to eat. */
export function BalanceRows() {
  const { profile } = useData();
  const patch = useProfilePatch();
  const target = profile.goals.balanceTarget;
  const mode = target < 0 ? 'cut' : target > 0 ? 'bulk' : 'maintain';
  const set = (balanceTarget: number) => patch({ goals: { ...profile.goals, balanceTarget } });
  return <>
    <Row label="Energy balance"><Segmented className={s.unit} label="Energy balance goal" value={mode} onChange={next => { const amount = Math.abs(target) || (next === 'cut' ? 300 : DEFAULT_BALANCE_TARGET); set(next === 'maintain' ? 0 : next === 'cut' ? -amount : amount); }} options={[{ value: 'cut', label: 'Cut' }, { value: 'maintain', label: 'Maintain' }, { value: 'bulk', label: 'Bulk' }]} /></Row>
    {mode !== 'maintain' ? <Row label="Daily target" hint={`${mode === 'cut' ? 'Deficit' : 'Surplus'} vs. what you burn`}><span className={s.with}><b>{mode === 'cut' ? '−' : '+'}</b><NumberField compact className={`${s.input} ${s.short}`} label="Daily target, kcal" value={Math.abs(target)} min={0} max={10000} step={50} onChange={value => { if (value !== null) set(mode === 'cut' ? -value : value); }} /><i>kcal</i></span></Row> : null}
  </>;
}

export function GoalRows() {
  const { profile } = useData();
  const patch = useProfilePatch();
  const goal = (key: keyof ProfileRecord['goals'], value: number | null) => { if (value !== null) patch({ goals: { ...profile.goals, [key]: value } }); };
  return <>
    <Row label="Protein"><span className={s.with}><NumberField compact className={`${s.input} ${s.short}`} label="Protein goal, grams" value={profile.goals.proteinG} min={0} step={5} onChange={value => goal('proteinG', value)} /><i>g</i></span></Row>
    <Row label="Steps"><span className={s.with}><NumberField compact className={`${s.input} ${s.short}`} label="Steps goal" value={profile.goals.steps} min={0} step={500} onChange={value => goal('steps', value)} /><i>/day</i></span></Row>
    <Row label="Water"><span className={s.with}><NumberField compact className={`${s.input} ${s.short}`} label="Water goal, fluid ounces" value={waterOunces(profile.goals.waterL)} min={0} max={waterOunces(30)} step={8} onChange={value => goal('waterL', value === null ? null : fluidOuncesToLiters(value))} /><i>fl oz</i></span></Row>
  </>;
}
