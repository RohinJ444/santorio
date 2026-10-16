'use client';

import { useState, type ReactNode } from 'react';
import { ArrowDownRight, Check, ChevronDown, ChevronUp, Ellipsis, Pause, Plus, StickyNote, Trash2, X } from 'lucide-react';
import type { Location, SessionExercise, SetSegment, Targets, TrainingSet, WorkoutSession } from '@/lib/domain/types';
import { applyTargets, blankSet, completedWorkingSets, convertExerciseWeight, displayNumber, effectiveLocationId, exerciseHistory, resultSummary, setHasData, setIsReady, setPrescription } from '@/lib/domain/workouts';
import { NumberField, Segmented, TextField } from './controls';
import s from './workout.module.css';

type Props = {
  exercise: SessionExercise; session: WorkoutSession; sessions: WorkoutSession[]; locations: Record<string, Location>;
  onChange: (exercise: SessionExercise) => void; onRemove: () => void;
  onMove?: (direction: -1 | 1) => void; first?: boolean; last?: boolean;
  onUpdateRoutine?: (targets: Targets) => void;
};

const shortDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
const weighted = (exercise: SessionExercise) => exercise.tracking === 'weight_reps' || exercise.tracking === 'assisted_reps';

export default function WorkoutExercise({ exercise, session, sessions, locations, onChange, onRemove, onMove, first, last, onUpdateRoutine }: Props) {
  const [removed, setRemoved] = useState<{ set: TrainingSet; index: number } | null>(null);
  const [routineUpdated, setRoutineUpdated] = useState(false);
  const [setup, setSetup] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const history = exerciseHistory(sessions, session, exercise);
  const previous = history.find(item => item.same);
  const workCount = completedWorkingSets(exercise);
  const patch = (changes: Partial<SessionExercise>) => onChange({ ...exercise, ...changes });
  const updateSet = (next: TrainingSet) => patch({ sets: exercise.sets.map(set => set.id === next.id ? next : set) });
  const targets = (changes: Partial<Targets>) => {
    setRoutineUpdated(false);
    onChange(applyTargets(exercise, { ...exercise.targets, ...changes }));
  };
  const unit = `${exercise.tracking === 'assisted_reps' ? 'assist ' : ''}${exercise.weightUnit}${exercise.perHand ? '/hand' : ''}`;
  const meta = [exercise.tracking === 'cardio' ? null : exercise.primaryMuscle, exercise.equipment || null, exercise.unilateral ? 'R / L' : null].filter(Boolean).join(' · ');
  const goal = exercise.targets.reps == null || exercise.tracking === 'duration' ? '' : `${displayNumber(exercise.targets.reps)}${exercise.targets.repsMax != null ? `–${displayNumber(exercise.targets.repsMax)}` : ''}`;
  let workIndex = 0;

  return <section className={s.exercise} aria-label={exercise.name}>
    <header className={s.exHead}>
      <div className={s.grow}>
        <h3>{exercise.name}</h3>
        <p className={s.meta}>{meta}</p>
      </div>
      {exercise.tracking !== 'cardio' ? <span className={s.counter} aria-label={`${workCount} of ${exercise.targets.sets} working sets recorded`}>{workCount}<small>/{exercise.targets.sets}</small></span> : null}
      <button type="button" className={s.more} aria-label={`${exercise.name} targets and setup`} aria-expanded={setup} onClick={() => setSetup(!setup)}><Ellipsis size={18} /></button>
    </header>

    {setup ? <div className={s.setup}>
      {exercise.tracking !== 'cardio' ? <>
        <div className={s.targetRow}>
          <label>Sets<NumberField compact className={s.cellInput} label="Target sets" value={exercise.targets.sets} min={1} max={50} step={1} onChange={value => { if (value != null && value >= 1) targets({ sets: Math.min(50, Math.floor(value)) }); }} /></label>
          {exercise.tracking !== 'duration' ? <>
            <span className={s.times}>×</span>
            <label>Reps<NumberField compact className={s.cellInput} label="Target reps" value={exercise.targets.reps} min={0} step={0.5} placeholder="—" onChange={value => targets({ reps: value })} /></label>
            <span className={s.times}>–</span>
            <label>Up to<NumberField compact className={s.cellInput} label="Target reps, upper end" value={exercise.targets.repsMax ?? null} min={0} step={0.5} placeholder="opt." onChange={value => targets({ repsMax: value })} /></label>
          </> : null}
        </div>
        {exercise.targets.repsMax != null && exercise.targets.reps != null && exercise.targets.repsMax < exercise.targets.reps ? <p className={s.warning}>Upper target is below the starting target.</p> : null}
        {onUpdateRoutine ? <button type="button" className={s.chip} onClick={() => { onUpdateRoutine(exercise.targets); setRoutineUpdated(true); }}>{routineUpdated ? 'Routine targets updated' : 'Save these targets to the routine'}</button> : null}
      </> : null}
      <TextField label="Machine / setup" value={exercise.equipment} onChange={equipment => patch({ equipment })} placeholder="Cable stack · seat 4 · neutral grip" />
      <div className={s.setupGrid}>
        <label className={s.field}>Location<select value={exercise.locationId === undefined ? 'session' : exercise.locationId ?? 'none'} onChange={event => patch({ locationId: event.target.value === 'session' ? undefined : event.target.value === 'none' ? null : event.target.value })}><option value="session">Same as workout</option><option value="none">No location</option>{Object.values(locations).filter(location => !location.archived).map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        {weighted(exercise) ? <div className={s.field}>Unit<Segmented className={s.unit} label="Weight unit" value={exercise.weightUnit} onChange={value => onChange(convertExerciseWeight(exercise, value))} options={[{ value: 'lb', label: 'lb' }, { value: 'kg', label: 'kg' }]} /></div> : null}
      </div>
      {history.length ? <div className={s.history}><span className={s.caption}>History</span>{history.slice(0, 6).map(item => <p key={`${item.session.id}-${item.exercise.id}`}><b>{shortDate(item.session.date)}{item.same ? '' : ` · ${locations[effectiveLocationId(item.exercise, item.session) ?? '']?.name || 'elsewhere'}`}</b>{resultSummary(item.exercise)}</p>)}{history.some(item => !item.same) ? <p className={s.hint}>Other gyms and machines are listed, not compared.</p> : null}</div> : null}
      <div className={s.actionRow}>
        {onMove ? <><button type="button" className={s.chip} disabled={first} onClick={() => onMove(-1)}><ChevronUp size={14} />Up</button><button type="button" className={s.chip} disabled={last} onClick={() => onMove(1)}><ChevronDown size={14} />Down</button></> : null}
        <button type="button" className={`${s.chip} ${s.danger}`} onClick={onRemove}><Trash2 size={14} />Remove</button>
      </div>
    </div> : null}

    {previous ? <p className={s.last}><b>Last · {shortDate(previous.session.date)}</b>{resultSummary(previous.exercise)}</p> : null}
    {exercise.tracking === 'assisted_reps' ? <p className={s.assistance}>Weight is assistance: lower means more of your bodyweight.</p> : null}

    {exercise.tracking === 'cardio' ? <CardioFields exercise={exercise} onChange={onChange} /> : <div className={s.sets} role="group" aria-label={`${exercise.name} sets`}>
      <div className={s.setHead}><span aria-hidden>Set</span>{exercise.tracking === 'duration' ? <span className={s.span2}>Minutes</span> : <>{weighted(exercise) ? <span>{unit}</span> : <span />}<span>Reps{goal ? <b> · {goal}</b> : null}</span></>}<span /></div>
      {exercise.sets.map((set, index) => {
        const label = set.warmup ? 'W' : String(++workIndex);
        const prior = exercise.sets.slice(0, index).reverse().find(item => !item.warmup && item.segments[0]);
        return <SetRow key={set.id} set={set} label={label} exercise={exercise} priorWeight={prior?.segments[0]} onChange={updateSet} onRemove={() => { setRemoved({ set, index }); patch({ sets: exercise.sets.filter(item => item.id !== set.id) }); }} />;
      })}
      {removed ? <div className={s.undo} role="status">Set removed<button type="button" onClick={() => { const sets = [...exercise.sets]; sets.splice(Math.min(removed.index, sets.length), 0, removed.set); patch({ sets }); setRemoved(null); }}>Undo</button></div> : null}
    </div>}

    <div className={s.exFoot}>
      {exercise.tracking !== 'cardio' ? <><button type="button" className={s.chip} onClick={() => patch({ sets: [...exercise.sets, blankSet(exercise.targets)] })}><Plus size={14} />Set</button>
        <button type="button" className={s.chip} onClick={() => patch({ sets: [...exercise.sets, blankSet(exercise.targets, true)] })}><Plus size={14} />Warmup</button></> : null}
      {!exercise.notes && !noteOpen ? <button type="button" className={`${s.chip} ${s.push}`} onClick={() => setNoteOpen(true)}><StickyNote size={14} />Note</button> : null}
    </div>
    {exercise.notes || noteOpen ? <textarea className={s.note} value={exercise.notes} onChange={event => patch({ notes: event.target.value })} placeholder="Grip, form, how it felt…" aria-label={`${exercise.name} notes`} autoFocus={noteOpen && !exercise.notes} onBlur={() => setNoteOpen(false)} rows={2} /> : null}
  </section>;
}

function SetRow({ set, label, exercise, priorWeight, onChange, onRemove }: { set: TrainingSet; label: string; exercise: SessionExercise; priorWeight?: SetSegment; onChange: (set: TrainingSet) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const ready = setIsReady(set, exercise);
  const { reps: target, repsMax: targetMax } = setPrescription(set, exercise);
  const patch = (changes: Partial<TrainingSet>) => onChange({ ...set, ...changes });
  const segment = (segmentIndex: number, changes: Partial<SetSegment>) => patch({ segments: set.segments.map((item, i) => i === segmentIndex ? { ...item, ...changes } : item) });
  const addSegment = (link: 'drop' | 'pause') => {
    const tail = set.segments.at(-1);
    patch({ segments: [...set.segments, { weight: link === 'pause' ? tail?.weight ?? null : null, reps: null, ...(exercise.unilateral ? { leftWeight: link === 'pause' ? tail?.leftWeight ?? null : null, rightWeight: link === 'pause' ? tail?.rightWeight ?? null : null, leftReps: null, rightReps: null } : {}), link, restSeconds: null }] });
  };
  const first = set.segments[0] ?? { weight: null, reps: null };
  const goal = target == null ? '' : `${displayNumber(target)}${targetMax != null ? `–${displayNumber(targetMax)}` : ''}`;
  // ✓ means "did the plan": fill the target reps, and the weight from the set above when this one is blank.
  const hit = () => {
    if (target == null) return;
    const weight = (value: number | null | undefined, fallback: number | null | undefined) => value ?? fallback ?? null;
    const done: SetSegment = exercise.unilateral
      ? { ...first, rightReps: first.rightReps ?? target, leftReps: first.leftReps ?? target, ...(weighted(exercise) ? { rightWeight: weight(first.rightWeight ?? first.weight, priorWeight?.rightWeight ?? priorWeight?.weight), leftWeight: weight(first.leftWeight ?? first.weight, priorWeight?.leftWeight ?? priorWeight?.weight), weight: null } : {}) }
      : { ...first, reps: first.reps ?? target, ...(weighted(exercise) ? { weight: weight(first.weight, priorWeight?.weight) } : {}) };
    patch({ segments: [done, ...set.segments.slice(1)] });
  };
  const canHit = !ready && target != null && exercise.tracking !== 'duration';

  return <div className={s.set} data-ready={ready} data-warmup={set.warmup}>
    {exercise.tracking === 'duration' ? <div className={s.setRow}>
      <SetLabel label={label} open={open} onToggle={() => setOpen(!open)} />
      <NumberField compact className={`${s.cellInput} ${s.span2}`} label={`Set ${label} minutes`} value={set.durationMinutes ?? null} min={0} step={0.5} onChange={durationMinutes => patch({ durationMinutes })} />
      <Done ready={ready} />
    </div> : <>
      <SegmentRow segment={first} exercise={exercise} lead={<SetLabel label={label} open={open} onToggle={() => setOpen(!open)} />} name={`Set ${label}`} onChange={changes => segment(0, changes)} tail={canHit ? <button type="button" className={s.check} aria-label={`Set ${label}: hit the target, ${goal} reps`} onClick={hit}><Check size={16} /></button> : <Done ready={ready} />} />
      {set.segments.slice(1).map((item, offset) => <SegmentRow key={offset + 1} segment={item} exercise={exercise} name={`Set ${label} ${item.link === 'pause' ? 'rest-pause' : 'drop'} ${offset + 1}`}
        lead={<span className={s.linkTag} title={item.link === 'pause' ? 'Rest-pause' : 'Drop'}>{item.link === 'pause' ? <Pause size={12} /> : <ArrowDownRight size={13} />}</span>}
        rest={item.link === 'pause' ? <label className={s.rest}>rest<NumberField compact className={s.cellInput} label="Rest before this segment, seconds" value={item.restSeconds ?? null} min={0} step={5} onChange={restSeconds => segment(offset + 1, { restSeconds })} />s</label> : null}
        onChange={changes => segment(offset + 1, changes)}
        tail={<button type="button" className={s.remove} aria-label={`Remove ${item.link === 'pause' ? 'rest-pause' : 'drop'} ${offset + 1}`} onClick={() => patch({ segments: set.segments.filter((_, i) => i !== offset + 1) })}><X size={14} /></button>} />)}
    </>}
    {set.notes && !open ? <button type="button" className={s.setNote} onClick={() => setOpen(true)}>{set.notes}</button> : null}
    {open ? <div className={s.extras}>
      <div className={s.actionRow}>
        <button type="button" className={s.chip} aria-pressed={set.warmup} onClick={() => patch({ warmup: !set.warmup })}>Warmup</button>
        {exercise.tracking !== 'duration' ? <><button type="button" className={s.chip} onClick={() => addSegment('drop')}><ArrowDownRight size={14} />Drop</button><button type="button" className={s.chip} onClick={() => addSegment('pause')}><Pause size={13} />Rest-pause</button></> : null}
        <button type="button" className={`${s.chip} ${s.danger}`} onClick={onRemove}><Trash2 size={14} />Remove</button>
      </div>
      <input className={s.noteInput} value={set.notes ?? ''} onChange={event => patch({ notes: event.target.value })} placeholder="Set note: short rest, partial range…" aria-label={`Set ${label} note`} />
      {!ready && setHasData(set) ? <p className={s.hint}>Partial sets are kept as entered.</p> : null}
    </div> : null}
  </div>;
}

function SetLabel({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) {
  return <button type="button" className={s.setLabel} aria-expanded={open} aria-label={`${label === 'W' ? 'Warmup' : `Set ${label}`} options`} onClick={onToggle}>{label}</button>;
}

function Done({ ready }: { ready: boolean }) {
  return <span className={s.done} data-ready={ready} aria-hidden>{ready ? <Check size={15} /> : null}</span>;
}

/** One line of a set: two inputs, or R and L lines for one-sided work. */
function SegmentRow({ segment, exercise, lead, rest, name, onChange, tail }: { segment: SetSegment; exercise: SessionExercise; lead: ReactNode; rest?: ReactNode; name: string; onChange: (changes: Partial<SetSegment>) => void; tail: ReactNode }) {
  const weightField = (side: 'right' | 'left' | null) => {
    if (!weighted(exercise)) return <span />;
    const value = side === 'right' ? segment.rightWeight ?? segment.weight : side === 'left' ? segment.leftWeight ?? segment.weight : segment.weight;
    const change = (next: number | null) => side === 'right' ? onChange({ rightWeight: next, leftWeight: segment.leftWeight ?? segment.weight, weight: null }) : side === 'left' ? onChange({ leftWeight: next, rightWeight: segment.rightWeight ?? segment.weight, weight: null }) : onChange({ weight: next });
    return <NumberField compact className={s.cellInput} label={`${name}${side ? ` ${side}` : ''} weight`} value={value} min={0} step={0.5} onChange={change} />;
  };
  if (exercise.unilateral) return <>
    {rest}
    <div className={s.setRow}>{lead}<span className={s.side} data-side="R">{weightField('right')}</span><span className={s.side} data-side="R"><NumberField compact className={s.cellInput} label={`${name} right reps`} value={segment.rightReps ?? null} min={0} step={0.5} onChange={rightReps => onChange({ rightReps })} /></span>{tail}</div>
    <div className={s.setRow}><span /><span className={s.side} data-side="L">{weightField('left')}</span><span className={s.side} data-side="L"><NumberField compact className={s.cellInput} label={`${name} left reps`} value={segment.leftReps ?? null} min={0} step={0.5} onChange={leftReps => onChange({ leftReps })} /></span><span /></div>
  </>;
  return <>{rest}<div className={s.setRow}>{lead}{weightField(null)}<NumberField compact className={s.cellInput} label={`${name} reps`} value={segment.reps} min={0} step={0.5} onChange={reps => onChange({ reps })} />{tail}</div></>;
}

/** Treadmill-style entry in the order Rohin writes it: speed × incline × minutes, then distance. */
function CardioFields({ exercise, onChange }: { exercise: SessionExercise; onChange: (exercise: SessionExercise) => void }) {
  const cardio = exercise.cardio ?? { minutes: null, distance: null, distanceUnit: 'mi' as const, speed: null, incline: null };
  const patch = (changes: Partial<NonNullable<SessionExercise['cardio']>>) => onChange({ ...exercise, cardio: { ...cardio, ...changes } });
  const changeUnit = (unit: 'mi' | 'km') => {
    if (unit === cardio.distanceUnit) return;
    const factor = unit === 'km' ? 1.609344 : 1 / 1.609344;
    patch({ distanceUnit: unit, distance: cardio.distance == null ? null : Math.round(cardio.distance * factor * 1000) / 1000, speed: cardio.speed == null ? null : Math.round(cardio.speed * factor * 1000) / 1000 });
  };
  const perHour = cardio.distanceUnit === 'mi' ? 'mph' : 'km/h';
  // distance follows from speed × time when it wasn't entered (treadmills show speed; runs show distance)
  const derived = cardio.distance == null && cardio.speed != null && cardio.minutes != null ? cardio.speed * cardio.minutes / 60 : null;
  const pace = (cardio.distance ?? derived) && cardio.minutes ? cardio.minutes / (cardio.distance ?? derived)! : null;
  const summary = [cardio.speed != null ? `${displayNumber(cardio.speed)} ${perHour}` : null, cardio.incline != null ? `${displayNumber(cardio.incline)}%` : null, cardio.minutes != null ? `${displayNumber(cardio.minutes)} min` : null].filter(Boolean).join(' × ');
  return <div className={s.cardio}>
    <label><span>Speed <i>{perHour}</i></span><NumberField compact className={s.cellInput} label={`Speed, ${perHour}`} value={cardio.speed} min={0} step={0.1} onChange={speed => patch({ speed })} /></label>
    <label><span>Incline <i>%</i></span><NumberField compact className={s.cellInput} label="Incline, percent" value={cardio.incline} min={-30} max={100} step={0.5} onChange={incline => patch({ incline })} /></label>
    <label><span>Time <i>min</i></span><NumberField compact className={s.cellInput} label="Minutes" value={cardio.minutes} min={0} step={0.5} onChange={minutes => patch({ minutes })} /></label>
    <label><span>Dist <i>{cardio.distanceUnit}</i></span><NumberField compact className={s.cellInput} label={`Distance, ${cardio.distanceUnit}`} value={cardio.distance} min={0} step={0.1} onChange={distance => patch({ distance })} /></label>
    <div className={s.cardioFoot}>
      <Segmented className={s.unitToggle} label="Distance unit" value={cardio.distanceUnit} onChange={changeUnit} options={[{ value: 'mi', label: 'mi' }, { value: 'km', label: 'km' }]} />
      {summary || derived != null || pace != null ? <span className={s.cardioSummary}>{summary}{derived != null ? ` ≈ ${displayNumber(Math.round(derived * 100) / 100)} ${cardio.distanceUnit}` : ''}{pace != null ? `${summary || derived != null ? ' · ' : ''}${Math.floor(Math.round(pace * 60) / 60)}:${String(Math.round(pace * 60) % 60).padStart(2, '0')} /${cardio.distanceUnit}` : ''}</span> : null}
    </div>
  </div>;
}
