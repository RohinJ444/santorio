'use client';

import { useState } from 'react';
import type { Location, SessionExercise, SetSegment, Targets, TrainingSet, WorkoutSession } from '@/lib/domain/types';
import { applyTargets, blankSet, completedWorkingSets, convertExerciseWeight, displayNumber, effectiveLocationId, exerciseHistory, resultSummary, setHasData, setIsReady, setPrescription, TRACKING_LABELS } from '@/lib/domain/workouts';
import { NumberField, TextField } from './controls';
import s from './workout.module.css';

type Props = {
  exercise: SessionExercise; session: WorkoutSession; sessions: WorkoutSession[]; locations: Record<string, Location>;
  onChange: (exercise: SessionExercise) => void; onRemove: () => void;
  onMove?: (direction: -1 | 1) => void; first?: boolean; last?: boolean;
  onUpdateRoutine?: (targets: Targets) => void;
};

export default function WorkoutExercise({ exercise, session, sessions, locations, onChange, onRemove, onMove, first, last, onUpdateRoutine }: Props) {
  const [removed, setRemoved] = useState<{ set: TrainingSet; index: number } | null>(null);
  const [routineUpdated, setRoutineUpdated] = useState(false);
  const history = exerciseHistory(sessions, session, exercise);
  const previous = history.find(item => item.same);
  const elsewhere = history.find(item => !item.same);
  const weighted = exercise.tracking === 'weight_reps' || exercise.tracking === 'assisted_reps';
  const workCount = completedWorkingSets(exercise);
  const patch = (changes: Partial<SessionExercise>) => onChange({ ...exercise, ...changes });
  const updateSet = (next: TrainingSet) => patch({ sets: exercise.sets.map(set => set.id === next.id ? next : set) });
  const targets = (changes: Partial<Targets>) => {
    setRoutineUpdated(false);
    onChange(applyTargets(exercise, { ...exercise.targets, ...changes }));
  };
  let workIndex = 0;

  return <section className={s.exercise} aria-label={exercise.name}>
    <header className={s.exerciseHeader}>
      <div className={s.grow}>
        <h3>{exercise.name}</h3>
        <p className={s.meta}>{exercise.primaryMuscle}{exercise.secondaryMuscles.length ? ` · ${exercise.secondaryMuscles.join(', ')}` : ''}</p>
        <p className={s.meta}>{TRACKING_LABELS[exercise.tracking]}{exercise.perHand ? ' · per hand' : ''}{exercise.unilateral ? ' · R / L' : ''}</p>
      </div>
      {exercise.tracking !== 'cardio' ? <span className={s.counter}>{workCount}<small> / {exercise.targets.sets} sets</small></span> : <span className={s.badge}>Cardio</span>}
    </header>

    {exercise.tracking === 'assisted_reps' ? <p className={s.assistance}>Weight is assistance. Lower assistance means more bodyweight lifted.</p> : null}

    <details className={s.details}>
      <summary>Targets & setup <span>{exercise.equipment || 'Add machine / setup'}</span></summary>
      <div className={s.detailsBody}>
        {exercise.tracking !== 'cardio' ? <>
          <div className={s.targetGrid}>
            <NumberField label="Target sets" value={exercise.targets.sets} min={1} max={50} step={1} onChange={value => { if (value != null && value >= 1) targets({ sets: Math.min(50, Math.floor(value)) }); }} />
            {exercise.tracking !== 'duration' ? <>
              <NumberField label="Target reps" value={exercise.targets.reps} min={0} step={0.5} onChange={value => targets({ reps: value })} />
              <NumberField label="Up to (optional)" value={exercise.targets.repsMax ?? null} min={0} step={0.5} onChange={value => targets({ repsMax: value })} />
            </> : null}
          </div>
          {exercise.targets.repsMax != null && exercise.targets.reps != null && exercise.targets.repsMax < exercise.targets.reps ? <p className={s.warning}>Upper target is below the starting target.</p> : null}
          <p className={s.hint}>Changes apply to this workout. Existing results stay intact.</p>
          {onUpdateRoutine ? <button type="button" className={s.smallButton} onClick={() => { onUpdateRoutine(exercise.targets); setRoutineUpdated(true); }}>{routineUpdated ? 'Routine targets updated' : 'Update saved routine targets too'}</button> : null}
        </> : null}
        <TextField label="Machine / setup" value={exercise.equipment} onChange={equipment => patch({ equipment })} placeholder="Cable stack · seat 4 · neutral grip" />
        <label className={s.field}>Exercise location<select value={exercise.locationId === undefined ? 'session' : exercise.locationId ?? 'none'} onChange={event => patch({ locationId: event.target.value === 'session' ? undefined : event.target.value === 'none' ? null : event.target.value })}><option value="session">Use workout location</option><option value="none">No location</option>{Object.values(locations).filter(location => !location.archived).map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        {weighted ? <label className={s.field}>Weight unit<select value={exercise.weightUnit} onChange={event => onChange(convertExerciseWeight(exercise, event.target.value as 'lb' | 'kg'))}><option value="lb">lb</option><option value="kg">kg</option></select><span className={s.hint}>Existing weights convert when changed.</span></label> : null}
        <div className={s.actionRow}>
          {onMove ? <><button type="button" className={s.smallButton} disabled={first} onClick={() => onMove(-1)}>Move up</button><button type="button" className={s.smallButton} disabled={last} onClick={() => onMove(1)}>Move down</button></> : null}
          <button type="button" className={s.dangerButton} onClick={onRemove}>Remove exercise</button>
        </div>
      </div>
    </details>

    {previous ? <div className={s.historyLine}><strong>Last here · {previous.session.date}</strong><p>{resultSummary(previous.exercise)}</p></div> : <p className={s.hint}>First recorded workout on this setup.</p>}

    {exercise.tracking === 'cardio' ? <CardioFields exercise={exercise} onChange={onChange} /> : <div className={s.setList}>
      {exercise.sets.map((set, index) => <SetRow key={set.id} set={set} exercise={exercise} index={set.warmup ? null : ++workIndex} onChange={updateSet} onRemove={() => { setRemoved({ set, index }); patch({ sets: exercise.sets.filter(item => item.id !== set.id) }); }} />)}
      <div className={s.actionRow}>
        <button type="button" className={s.smallButton} onClick={() => patch({ sets: [...exercise.sets, blankSet(exercise.targets)] })}>+ Set</button>
        <button type="button" className={s.smallButton} onClick={() => patch({ sets: [...exercise.sets, blankSet(exercise.targets, true)] })}>+ Warmup</button>
      </div>
      {removed ? <div className={s.undo} role="status">Set removed.<button type="button" onClick={() => { const sets = [...exercise.sets]; sets.splice(Math.min(removed.index, sets.length), 0, removed.set); patch({ sets }); setRemoved(null); }}>Undo</button></div> : null}
    </div>}

    <TextField label="Exercise notes" value={exercise.notes} onChange={notes => patch({ notes })} placeholder="Grip, form, how it felt…" multiline />

    {history.length ? <details className={s.details}>
      <summary>History <span>{history.filter(item => item.same).length} on this setup</span></summary>
      <div className={s.detailsBody}>
        {history.slice(0, 12).map(item => <div key={`${item.session.id}-${item.exercise.id}`} className={s.historyLine}>
          <strong>{item.session.date} · {item.same ? 'Same setup' : locations[effectiveLocationId(item.exercise, item.session) ?? '']?.name || 'No location'}</strong>
          {!item.same && item.exercise.equipment ? <span className={s.meta}>{item.exercise.equipment}</span> : null}
          <p>{resultSummary(item.exercise)}</p>
        </div>)}
        {elsewhere ? <p className={s.hint}>Other locations and machines are shown separately, not treated as equivalent loads.</p> : null}
      </div>
    </details> : null}
  </section>;
}

function SetRow({ set, exercise, index, onChange, onRemove }: { set: TrainingSet; exercise: SessionExercise; index: number | null; onChange: (set: TrainingSet) => void; onRemove: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const ready = setIsReady(set, exercise);
  const { reps: target, repsMax: targetMax } = setPrescription(set, exercise);
  const patch = (changes: Partial<TrainingSet>) => onChange({ ...set, ...changes });
  const segment = (segmentIndex: number, changes: Partial<SetSegment>) => patch({ segments: set.segments.map((item, i) => i === segmentIndex ? { ...item, ...changes } : item) });
  const addSegment = (link: 'drop' | 'pause') => {
    const last = set.segments.at(-1);
    patch({ segments: [...set.segments, { weight: link === 'pause' ? last?.weight ?? null : null, reps: null, ...(exercise.unilateral ? { leftWeight: link === 'pause' ? last?.leftWeight ?? null : null, rightWeight: link === 'pause' ? last?.rightWeight ?? null : null, leftReps: null, rightReps: null } : {}), link, restSeconds: null }] });
    setExpanded(true);
  };

  return <fieldset className={`${s.setRow} ${ready ? s.ready : ''}`}>
    <legend className={s.setLegend}>{set.warmup ? 'Warmup' : `Set ${index}`} <span>{target != null && exercise.tracking !== 'duration' ? `target ${displayNumber(target)}${targetMax != null ? `–${displayNumber(targetMax)}` : ''}` : ''}</span></legend>
    {exercise.tracking === 'duration' ? <NumberField label="Minutes" value={set.durationMinutes ?? null} min={0} step={0.5} onChange={durationMinutes => patch({ durationMinutes })} /> : <>
      <SegmentFields segment={set.segments[0] ?? { weight: null, reps: null }} exercise={exercise} target={target} onChange={changes => segment(0, changes)} />
      {set.segments.slice(1).map((item, offset) => <div className={s.extraSegment} key={offset + 1}>
        <div className={s.segmentHeading}><span>{item.link === 'pause' ? 'Rest-pause' : 'Drop'} {offset + 1}</span><button type="button" className={s.iconButton} aria-label={`Remove ${item.link === 'pause' ? 'rest-pause' : 'drop'} segment ${offset + 1}`} onClick={() => patch({ segments: set.segments.filter((_, i) => i !== offset + 1) })}>×</button></div>
        <SegmentFields segment={item} exercise={exercise} target={null} onChange={changes => segment(offset + 1, changes)} />
        <NumberField label="Rest before this segment (seconds)" value={item.restSeconds ?? null} min={0} step={5} onChange={restSeconds => segment(offset + 1, { restSeconds })} />
      </div>)}
    </>}
    <div className={s.setFooter}>
      <span className={ready ? s.recorded : s.hint}>{ready ? 'Recorded' : setHasData(set) ? 'Partial · kept as entered' : 'Blank'}</span>
      <button type="button" className={s.textButton} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Less' : 'Extras / note'}</button>
    </div>
    {expanded ? <div className={s.setExtras}>
      <div className={s.actionRow}>
        <label className={s.checkbox}><input type="checkbox" checked={set.warmup} onChange={event => patch({ warmup: event.target.checked })} />Warmup</label>
        {exercise.tracking !== 'duration' ? <><button type="button" className={s.smallButton} onClick={() => addSegment('drop')}>+ Drop</button><button type="button" className={s.smallButton} onClick={() => addSegment('pause')}>+ Rest-pause</button></> : null}
        <button type="button" className={s.dangerButton} onClick={onRemove}>Remove set</button>
      </div>
      <TextField label="Set note" value={set.notes ?? ''} onChange={notes => patch({ notes })} placeholder="Short rest, partial range…" />
    </div> : null}
  </fieldset>;
}

function SegmentFields({ segment, exercise, target, onChange }: { segment: SetSegment; exercise: SessionExercise; target: number | null; onChange: (changes: Partial<SetSegment>) => void }) {
  const weighted = exercise.tracking === 'weight_reps' || exercise.tracking === 'assisted_reps';
  const weightLabel = `${exercise.tracking === 'assisted_reps' ? 'Assist' : 'Load'} (${exercise.weightUnit}${exercise.perHand ? '/hand' : ''})`;
  const placeholder = target == null ? '—' : `${displayNumber(target)} target`;
  if (exercise.unilateral) return <div className={s.sideGrid}>
    <div className={s.sideColumn}><span className={s.sideLabel}>Right</span>
      {weighted ? <NumberField label={weightLabel} value={segment.rightWeight ?? segment.weight} min={0} step={0.5} onChange={rightWeight => onChange({ rightWeight, leftWeight: segment.leftWeight ?? segment.weight, weight: null })} /> : null}
      <NumberField label="R reps" value={segment.rightReps ?? null} min={0} step={0.5} placeholder={placeholder} onChange={rightReps => onChange({ rightReps })} />
    </div>
    <div className={s.sideColumn}><span className={s.sideLabel}>Left</span>
      {weighted ? <NumberField label={weightLabel} value={segment.leftWeight ?? segment.weight} min={0} step={0.5} onChange={leftWeight => onChange({ leftWeight, rightWeight: segment.rightWeight ?? segment.weight, weight: null })} /> : null}
      <NumberField label="L reps" value={segment.leftReps ?? null} min={0} step={0.5} placeholder={placeholder} onChange={leftReps => onChange({ leftReps })} />
    </div>
  </div>;
  return <div className={s.numberGrid}>
    {weighted ? <NumberField label={weightLabel} value={segment.weight} min={0} step={0.5} onChange={weight => onChange({ weight })} /> : null}
    <NumberField label="Reps" value={segment.reps} min={0} step={0.5} placeholder={placeholder} onChange={reps => onChange({ reps })} />
  </div>;
}

function CardioFields({ exercise, onChange }: { exercise: SessionExercise; onChange: (exercise: SessionExercise) => void }) {
  const cardio = exercise.cardio ?? { minutes: null, distance: null, distanceUnit: 'mi' as const, speed: null, incline: null };
  const patch = (changes: Partial<NonNullable<SessionExercise['cardio']>>) => onChange({ ...exercise, cardio: { ...cardio, ...changes } });
  const changeUnit = (unit: 'mi' | 'km') => {
    if (unit === cardio.distanceUnit) return;
    const factor = unit === 'km' ? 1.609344 : 1 / 1.609344;
    patch({ distanceUnit: unit, distance: cardio.distance == null ? null : Math.round(cardio.distance * factor * 1000) / 1000, speed: cardio.speed == null ? null : Math.round(cardio.speed * factor * 1000) / 1000 });
  };
  return <div className={s.cardioGrid}>
    <NumberField label="Minutes" value={cardio.minutes} min={0} step={0.5} onChange={minutes => patch({ minutes })} />
    <NumberField label={`Distance (${cardio.distanceUnit})`} value={cardio.distance} min={0} step={0.1} onChange={distance => patch({ distance })} />
    <NumberField label={`Speed (${cardio.distanceUnit}/h)`} value={cardio.speed} min={0} step={0.1} onChange={speed => patch({ speed })} />
    <NumberField label="Incline (%)" value={cardio.incline} min={-30} max={100} step={0.5} onChange={incline => patch({ incline })} />
    <label className={s.field}>Distance unit<select value={cardio.distanceUnit} onChange={event => changeUnit(event.target.value as 'mi' | 'km')}><option value="mi">Miles</option><option value="km">Kilometers</option></select></label>
  </div>;
}
