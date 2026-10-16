'use client';

import { memo, useId, useState } from 'react';
import { useData } from '@/lib/data-store';
import type { HealthWorkout, WorkoutSession } from '@/lib/domain/types';
import { displayNumber } from '@/lib/domain/workouts';
import s from './prototype.module.css';
import h from './health.module.css';

type WorkoutLink = { session: WorkoutSession; exerciseId?: string; exerciseName?: string };
function existingLinks(workoutId: string, sessions: WorkoutSession[]): WorkoutLink[] {
  return sessions.flatMap(session => [
    ...(session.healthWorkoutIds.includes(workoutId) ? [{ session }] : []),
    ...session.exercises.filter(exercise => exercise.healthWorkoutIds?.includes(workoutId)).map(exercise => ({ session, exerciseId: exercise.id, exerciseName: exercise.name })),
  ]);
}
const rounded = (value: number | null | undefined) => value == null ? '—' : Math.round(value).toLocaleString();

const HeartRatePlot = memo(function HeartRatePlot({ workout }: { workout: HealthWorkout }) {
  const id = useId();
  const samples = workout.heartRate.filter(point => Number.isFinite(Date.parse(point.time)) && Number.isFinite(point.bpm)).sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  if (!samples.length) return <p className={h.chartNote}>No heart-rate samples were included in this export.</p>;
  const min = Math.min(...samples.map(point => point.bpm));
  const max = Math.max(...samples.map(point => point.bpm));
  const bottom = Math.max(0, Math.floor((min - 5) / 10) * 10);
  const top = Math.ceil((max + 5) / 10) * 10;
  const first = Date.parse(samples[0].time), last = Date.parse(samples[samples.length - 1].time);
  const span = last - first;
  // Keep the chart small even when the exporter includes second-by-second samples.
  const stride = Math.max(1, Math.ceil(samples.length / 400));
  const plotted = samples.filter((_, index) => index % stride === 0 || index === samples.length - 1);
  const x = (time: string) => span ? 40 + (Date.parse(time) - first) / span * 430 : 255;
  const y = (bpm: number) => 125 - (bpm - bottom) / (top - bottom) * 105;
  const points = plotted.map(point => `${x(point.time).toFixed(1)},${y(point.bpm).toFixed(1)}`).join(' ');
  return <>
    <svg className={h.chart} viewBox="0 0 490 155" role="img" aria-labelledby={`${id}-title ${id}-description`}>
      <title id={`${id}-title`}>{workout.name} heart rate</title>
      <desc id={`${id}-description`}>{samples.length} exported samples ranging from {Math.round(min)} to {Math.round(max)} beats per minute over {Math.round(span / 60000)} minutes. Points follow the exported sample times.</desc>
      {[bottom, (bottom + top) / 2, top].map(tick => <g key={tick}><line x1="40" x2="470" y1={y(tick)} y2={y(tick)} /><text x="2" y={y(tick) + 4}>{Math.round(tick)}</text></g>)}
      {plotted.length > 1 ? <polyline points={points} /> : <circle cx={x(plotted[0].time)} cy={y(plotted[0].bpm)} r="3" />}
      <text x="40" y="148">First sample</text><text x="470" y="148" textAnchor="end">+{displayNumber(span / 60000)} min</text>
    </svg>
    <p className={h.chartNote}>Heart rate · bpm. The line connects available samples; it does not fill in missing measurements.</p>
  </>;
});

function WatchWorkout({ workout, sessions, daySessions }: { workout: HealthWorkout; sessions: WorkoutSession[]; daySessions: WorkoutSession[] }) {
  const { upsert, profile } = useData();
  const [target, setTarget] = useState('');
  const [error, setError] = useState('');
  const links = existingLinks(workout.id, sessions);
  const time = (value: string) => new Intl.DateTimeFormat('en-US', { timeZone: profile.timezone, hour: 'numeric', minute: '2-digit' }).format(new Date(value));
  const options = daySessions.flatMap(session => [
    { value: JSON.stringify([session.id]), label: `${session.title || 'Untitled workout'} · whole workout`, session },
    ...session.exercises.map(exercise => ({ value: JSON.stringify([session.id, exercise.id]), label: `${session.title || 'Untitled workout'} → ${exercise.name}`, session, exerciseId: exercise.id })),
  ]);
  const link = () => {
    setError('');
    if (existingLinks(workout.id, sessions).length) { setError('This Watch workout is already linked. Unlink it before moving it.'); return; }
    const option = options.find(item => item.value === target);
    if (!option) { setError('Choose a workout or exercise first.'); return; }
    const session = option.session;
    if ('exerciseId' in option) upsert('workouts', { ...session, exercises: session.exercises.map(exercise => exercise.id === option.exerciseId ? { ...exercise, healthWorkoutIds: [...(exercise.healthWorkoutIds ?? []), workout.id] } : exercise) });
    else upsert('workouts', { ...session, healthWorkoutIds: [...session.healthWorkoutIds, workout.id] });
    setTarget('');
  };
  const unlink = (connection: WorkoutLink) => {
    const session = connection.session;
    if (connection.exerciseId) upsert('workouts', { ...session, exercises: session.exercises.map(exercise => exercise.id === connection.exerciseId ? { ...exercise, healthWorkoutIds: exercise.healthWorkoutIds?.filter(id => id !== workout.id) } : exercise) });
    else upsert('workouts', { ...session, healthWorkoutIds: session.healthWorkoutIds.filter(id => id !== workout.id) });
    setError('');
  };
  return <article className={h.watchCard}>
    <div className={h.watchHeader}><h3>{workout.name}</h3><div className={h.activeEnergy}>{rounded(workout.activeEnergy)}<small>active kcal</small></div></div>
    <p className={h.watchMeta}>{time(workout.start)}–{time(workout.end)} · {displayNumber(workout.durationMinutes)} min{workout.isIndoor != null ? ` · ${workout.isIndoor ? 'Indoor' : 'Outdoor'}` : ''}{workout.distanceKm != null ? ` · ${displayNumber(workout.distanceKm * (profile.weightUnit === 'lb' ? 0.621371 : 1))} ${profile.weightUnit === 'lb' ? 'mi' : 'km'}` : ''}</p>
    <details className={h.instructions}><summary>Heart rate & export details</summary>
      <dl className={h.stats}><div><dt>Min heart rate</dt><dd>{rounded(workout.heartRateSummary?.min)} bpm</dd></div><div><dt>Average heart rate</dt><dd>{rounded(workout.heartRateSummary?.avg)} bpm</dd></div><div><dt>Max heart rate</dt><dd>{rounded(workout.heartRateSummary?.max)} bpm</dd></div>{workout.totalEnergy != null ? <div><dt>Reported total energy</dt><dd>{rounded(workout.totalEnergy)} kcal</dd></div> : null}</dl>
      <HeartRatePlot workout={workout} />
      <p className={h.chartNote}>{workout.sourceName ? `${workout.sourceName} · ` : ''}Imported {new Intl.DateTimeFormat('en-US', { timeZone: profile.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(workout.importedAt))}. {workout.totalEnergy == null ? 'Total calories were not reported. ' : ''}Workout energy is shown for reference and is not added to daily active energy.</p>
    </details>
    {links.length ? <div className={s.stack}>{links.map(connection => <div className={h.linked} key={`${connection.session.id}/${connection.exerciseId ?? ''}`}><span><strong>Linked to {connection.exerciseName || connection.session.title || 'Untitled workout'}</strong><small>{connection.exerciseName ? `${connection.session.title || 'Workout'} · ` : 'Whole workout · '}{connection.session.date}</small></span><button type="button" className={s.button} onClick={() => unlink(connection)}>Unlink</button></div>)}</div> : daySessions.length ? <div className={h.linkControls}><label className={s.field}>Link Watch session to<select className={s.select} value={target} onChange={event => { setTarget(event.target.value); setError(''); }}><option value="">Choose a workout or exercise</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><button type="button" className={s.button} disabled={!target} onClick={link}>Link</button></div> : <p className={h.linkHint}>Create a workout on this date to link this Watch session to the workout or one of its exercises.</p>}
    {error ? <p className={h.summaryError} role="alert">{error}</p> : null}
  </article>;
}

export default function HealthWorkoutLinks({ date }: { date: string }) {
  const { records } = useData();
  const sessions = Object.values(records.workouts);
  const daySessions = sessions.filter(session => session.date === date).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const workouts = Object.values(records.healthWorkouts).filter(workout => workout.date === date).sort((a, b) => a.start.localeCompare(b.start));
  const unmatched = workouts.filter(workout => !existingLinks(workout.id, sessions).length).length;
  if (!workouts.length) return null;
  return <details className={h.watchPanel} open={!daySessions.length}>
    <summary><span>Apple Watch <span className={h.panelCount}>{workouts.length} {workouts.length === 1 ? 'session' : 'sessions'} · {unmatched} unlinked</span></span></summary>
    <p className={h.linkHint}>Connect an indoor walk to treadmill logging, or a strength session to the whole workout. Each Watch session can be linked once; unlink it first to move it.</p>
    {workouts.map(workout => <WatchWorkout key={workout.id} workout={workout} sessions={sessions} daySessions={daySessions} />)}
  </details>;
}
