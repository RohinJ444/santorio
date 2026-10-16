'use client';

import { useState } from 'react';
import { Check, Dumbbell, Ellipsis, Library, MapPin, Plus, Repeat, Trash2, X } from 'lucide-react';
import { endAfter, zonedClock, zonedInstant, zonedLabel } from '@/lib/domain/time';
import { useData } from '@/lib/data-store';
import { newId, type ExerciseDefinition, type Location, type Routine, type SessionExercise, type Targets, type WorkoutSession } from '@/lib/domain/types';
import { applyTargets, completedWorkingSets, displayNumber, effectiveLocationId, exerciseHasResults, newSession, newSessionExercise, normalizeSetup, repeatSession, resultSummary, routineFromSession, workoutInsights } from '@/lib/domain/workouts';
import { DayNav, Modal, NumberField, SaveStatus, Segmented, TextField, ViewHeader } from './controls';
import WorkoutExercise from './WorkoutExercise';
import HealthWorkoutLinks from './HealthWorkoutLinks';
import { ExerciseLibrary, LocationPicker } from './WorkoutLibrary';
import p from './prototype.module.css';
import s from './workout.module.css';

type LibraryTarget = { kind: 'session'; id: string } | { kind: 'routine'; id: string } | { kind: 'manage' };

export default function WorkoutScreen() {
  const data = useData();
  const { records, profile, upsert, remove } = data;
  const [date, setDate] = useState(data.today);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<'workouts' | 'insights' | 'routines'>('workouts');
  const [starting, setStarting] = useState(false);
  const [library, setLibrary] = useState<LibraryTarget | null>(null);
  const [locationFor, setLocationFor] = useState<{ kind: 'session' | 'routine'; id: string } | null>(null);
  const [routineEditor, setRoutineEditor] = useState<string | null>(null);
  const [savingRoutine, setSavingRoutine] = useState(false);
  const [deleting, setDeleting] = useState<{ kind: 'workouts' | 'routines'; id: string; name: string } | null>(null);
  const [removedExercise, setRemovedExercise] = useState<{ sessionId: string; exercise: SessionExercise; index: number } | null>(null);
  const [notice, setNotice] = useState('');
  const [details, setDetails] = useState(false);
  const zone = profile.timezone;
  const sessions = Object.values(records.workouts).sort((a, b) => b.date.localeCompare(a.date) || (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));
  const routines = Object.values(records.routines).sort((a, b) => a.name.localeCompare(b.name));
  const daySessions = sessions.filter(session => session.date === date).sort((a, b) => (a.startedAt ?? '').localeCompare(b.startedAt ?? ''));
  const selected = daySessions.find(session => session.id === selectedId) ?? daySessions.find(session => session.status === 'active') ?? daySessions.at(-1);
  const routine = routineEditor ? records.routines[routineEditor] : undefined;
  const locations = Object.values(records.locations);
  const definitions = Object.values(records.exercises);

  const chooseDate = (value: string) => { setDate(value); setSelectedId(null); setNotice(''); };
  const openSession = (session: WorkoutSession) => { setDate(session.date); setSelectedId(session.id); setTab('workouts'); };
  const createSession = (source?: WorkoutSession | Routine) => {
    // Logging a past day after the fact: no start time unless you add one.
    const startedAt = date === data.today ? new Date().toISOString() : undefined;
    const session = source ? repeatSession(source, date, startedAt) : newSession(date, profile.defaultLocationId ?? null, daySessions.length ? `Workout ${daySessions.length + 1}` : 'Workout', startedAt);
    upsert('workouts', session); setSelectedId(session.id); setTab('workouts'); setStarting(false); setNotice('');
  };
  const updateExercise = (session: WorkoutSession, next: SessionExercise) => upsert('workouts', { ...session, exercises: session.exercises.map(exercise => exercise.id === next.id ? next : exercise) });
  const addExercise = (definition: ExerciseDefinition) => {
    if (!library || library.kind === 'manage') return;
    let entry = newSessionExercise(definition, profile.weightUnit);
    if (library.kind === 'session') {
      const session = records.workouts[library.id];
      if (!session) return;
      const prior = sessions.filter(item => item.id !== session.id && (item.date < session.date || (item.date === session.date && (item.startedAt ?? '') < (session.startedAt ?? '')))).flatMap(item => item.exercises.map(exercise => ({ item, exercise })))
        .find(({ item, exercise }) => exercise.exerciseId === definition.id && exercise.tracking === definition.tracking && effectiveLocationId(exercise, item) === session.locationId);
      if (prior) entry = applyTargets({ ...entry, equipment: prior.exercise.equipment }, { ...prior.exercise.targets });
      upsert('workouts', { ...session, exercises: [...session.exercises, entry] });
    } else {
      const value = records.routines[library.id];
      if (!value) return;
      upsert('routines', { ...value, exercises: [...value.exercises, entry] });
    }
    setLibrary(null);
  };
  const selectLocation = (id: string | null) => {
    if (!locationFor) return;
    if (locationFor.kind === 'session') {
      const session = records.workouts[locationFor.id];
      if (session) upsert('workouts', { ...session, locationId: id });
    } else {
      const value = records.routines[locationFor.id];
      if (value) upsert('routines', { ...value, locationId: id });
    }
    upsert('profiles', { ...profile, defaultLocationId: id ?? undefined });
    setLocationFor(null);
  };
  const updateRoutineTargets = (session: WorkoutSession, exercise: SessionExercise, targets: Targets) => {
    const value = session.routineId ? records.routines[session.routineId] : undefined;
    if (!value) return;
    const matching = value.exercises.filter(item => item.exerciseId === exercise.exerciseId);
    const sourceId = exercise.routineExerciseId ?? (matching.length === 1 ? matching[0].id : undefined);
    if (!sourceId) return;
    upsert('routines', { ...value, exercises: value.exercises.map(item => item.id === sourceId ? applyTargets(item, { ...targets }) : item) });
  };
  const routineTargetAvailable = (session: WorkoutSession, exercise: SessionExercise) => {
    const value = session.routineId ? records.routines[session.routineId] : undefined;
    return value && (exercise.routineExerciseId ? value.exercises.some(item => item.id === exercise.routineExerciseId) : value.exercises.filter(item => item.exerciseId === exercise.exerciseId).length === 1);
  };

  const sets = selected ? selected.exercises.reduce((total, exercise) => total + completedWorkingSets(exercise), 0) : 0;
  const location = selected ? records.locations[selected.locationId ?? '']?.name : undefined;

  return <main className={`${p.page} ${s.workoutPage}`}>
    <ViewHeader q="out" label="Training" action={<button type="button" className={p.iconBtn} aria-label="Exercise library" onClick={() => setLibrary({ kind: 'manage' })}><Library size={19} /></button>}>
      <DayNav date={date} onChange={chooseDate} markedDates={[...new Set([...sessions.map(session => session.date), ...Object.values(records.healthWorkouts).map(workout => workout.date)])]} label="Training" />
      <SaveStatus />
    </ViewHeader>
    <Segmented label="Training views" value={tab} onChange={setTab} options={[{ value: 'workouts', label: 'Log' }, { value: 'insights', label: 'Insights' }, { value: 'routines', label: 'Routines' }]} />
    {notice ? <p className={s.notice} role="status">{notice}</p> : null}

    {tab === 'workouts' ? <>
      {daySessions.length > 1 ? <nav className={s.sessionBar} aria-label="Workouts on this day">
        {daySessions.map(session => <button type="button" className={s.sessionChip} key={session.id} aria-pressed={session.id === selected?.id} onClick={() => setSelectedId(session.id)}><i data-done={session.status === 'complete'} />{session.title || 'Untitled workout'}</button>)}
        <button type="button" className={s.sessionChip} aria-label="Add another workout" onClick={() => setStarting(true)}><Plus size={15} /></button>
      </nav> : daySessions.length ? null : <div className={s.emptyCard}><Dumbbell size={22} /><h3>{date === data.today ? 'Nothing logged yet today' : 'No workout this day'}</h3><p>Start empty, from a routine, or repeat a recent workout.</p><button type="button" className={`${p.button} ${p.primary}`} onClick={() => setStarting(true)}>Start a workout</button></div>}
      <HealthWorkoutLinks key={date} date={date} />
      {selected ? <>
        <section className={s.sessionHead} aria-label="Workout">
          <input className={s.titleInput} value={selected.title} onChange={event => upsert('workouts', { ...selected, title: event.target.value })} placeholder="Name this workout" aria-label="Workout name" />
          <div className={s.metaRow}>
            <button type="button" className={s.chip} onClick={() => setLocationFor({ kind: 'session', id: selected.id })}><MapPin size={13} />{location || 'Location'}</button>
            <span className={s.stat}><b>{selected.exercises.length}</b> exercises · <b>{sets}</b> sets</span>
            <button type="button" className={`${s.more} ${s.push}`} aria-label="Workout details and actions" onClick={() => setDetails(true)}><Ellipsis size={18} /></button>
          </div>
          {selected.startedAt || selected.completedAt ? <button type="button" className={s.timeLine} onClick={() => setDetails(true)}>{selected.startedAt && selected.completedAt ? `${zonedLabel(selected.startedAt, zone)} – ${zonedLabel(selected.completedAt, zone)}` : selected.startedAt ? selected.status === 'active' ? `${zonedLabel(selected.startedAt, zone)} – now` : `Started ${zonedLabel(selected.startedAt, zone)}` : `Ended ${zonedLabel(selected.completedAt!, zone)}`}</button> : null}
          {selected.notes ? <button type="button" className={s.sessionNote} onClick={() => setDetails(true)}>{selected.notes}</button> : null}
        </section>
        {selected.exercises.map((exercise, index) => <WorkoutExercise
          key={exercise.id} exercise={exercise} session={selected} sessions={sessions} locations={records.locations}
          onChange={next => updateExercise(selected, next)} first={index === 0} last={index === selected.exercises.length - 1}
          onRemove={() => { setRemovedExercise({ sessionId: selected.id, exercise, index }); upsert('workouts', { ...selected, exercises: selected.exercises.filter(item => item.id !== exercise.id) }); }}
          onMove={direction => { const next = [...selected.exercises]; const destination = index + direction; if (destination < 0 || destination >= next.length) return; [next[index], next[destination]] = [next[destination], next[index]]; upsert('workouts', { ...selected, exercises: next }); }}
          onUpdateRoutine={routineTargetAvailable(selected, exercise) ? targets => updateRoutineTargets(selected, exercise, targets) : undefined}
        />)}
        {removedExercise?.sessionId === selected.id ? <div className={s.undo} role="status">{removedExercise.exercise.name} removed<button type="button" onClick={() => { const exercises = [...selected.exercises]; exercises.splice(Math.min(removedExercise.index, exercises.length), 0, removedExercise.exercise); upsert('workouts', { ...selected, exercises }); setRemovedExercise(null); }}>Undo</button></div> : null}
        <button type="button" className={s.addExercise} onClick={() => setLibrary({ kind: 'session', id: selected.id })}><Plus size={16} />Add exercise</button>
        <div className={s.endRow}>
          <button type="button" className={s.finish} data-done={selected.status === 'complete'} onClick={() => upsert('workouts', { ...selected, status: selected.status === 'active' ? 'complete' : 'active', completedAt: selected.status === 'active' ? selected.completedAt ?? (selected.date === data.today ? new Date().toISOString() : undefined) : undefined })}>{selected.status === 'active' ? 'Finish workout' : <><Check size={15} />Finished · reopen</>}</button>
          {daySessions.length === 1 ? <button type="button" className={s.finish} onClick={() => setStarting(true)}><Plus size={15} />Workout</button> : null}
        </div>
      </> : null}
    </> : tab === 'insights' ? <WorkoutInsights sessions={sessions} date={date} locations={records.locations} onOpen={openSession} /> : <>
      <div className={s.sectionHeading}><h2>Routines</h2><button type="button" className={s.chip} onClick={() => { const value: Routine = { id: newId(), name: 'New routine', locationId: profile.defaultLocationId ?? null, exercises: [], notes: '' }; upsert('routines', value); setRoutineEditor(value.id); }}><Plus size={14} />Routine</button></div>
      {!routines.length ? <div className={s.emptyCard}><p>Build a routine here, or save one from a workout. Routines keep exercises, targets and setup; each workout starts with blank results.</p></div> : routines.map(value => <section className={s.routineCard} key={value.id}>
        <div className={s.routineTop}><div className={s.grow}><h3>{value.name || 'Untitled routine'}</h3><p className={s.meta}>{value.exercises.length} exercises · {records.locations[value.locationId ?? '']?.name || 'No location'}</p></div><button type="button" className={s.more} aria-label={`Edit ${value.name || 'routine'}`} onClick={() => setRoutineEditor(value.id)}><Ellipsis size={18} /></button></div>
        {value.exercises.length ? <p className={s.routineList}>{value.exercises.map(exercise => exercise.name).join(' · ')}</p> : null}
        <div className={s.actionRow}><button type="button" className={`${p.button} ${p.primary}`} onClick={() => createSession(value)}>Start</button><button type="button" className={`${s.chip} ${s.danger} ${s.push}`} onClick={() => setDeleting({ kind: 'routines', id: value.id, name: value.name || 'this routine' })}><Trash2 size={14} />Delete</button></div>
      </section>)}
    </>}

    {starting ? <StartWorkout routines={routines} sessions={sessions} locations={records.locations} onStart={createSession} onClose={() => setStarting(false)} /> : null}
    {details && selected ? <Modal title="Workout" onClose={() => setDetails(false)}><div className={s.stack}>
      <label className={s.field}>Date<input type="date" value={selected.date} onChange={event => { const next = event.target.value; if (!next) return; const move = (iso?: string) => iso ? zonedInstant(next, zonedClock(iso, zone), zone) : undefined; const startedAt = move(selected.startedAt); const completedAt = move(selected.completedAt); upsert('workouts', { ...selected, date: next, startedAt, completedAt: completedAt ? endAfter(startedAt, completedAt) : undefined }); setDate(next); setSelectedId(selected.id); }} /></label>
      <div className={s.timeRow}>
        <label className={s.field}>Start<span className={s.timeInput}><input type="time" value={selected.startedAt ? zonedClock(selected.startedAt, zone) : ''} onChange={event => { const startedAt = event.target.value ? zonedInstant(selected.date, event.target.value, zone) : undefined; upsert('workouts', { ...selected, startedAt, completedAt: selected.completedAt ? endAfter(startedAt, zonedInstant(selected.date, zonedClock(selected.completedAt, zone), zone)) : undefined }); }} />{selected.startedAt ? <button type="button" aria-label="Clear start time" onClick={() => upsert('workouts', { ...selected, startedAt: undefined })}><X size={14} /></button> : null}</span></label>
        <label className={s.field}>End<span className={s.timeInput}><input type="time" value={selected.completedAt ? zonedClock(selected.completedAt, zone) : ''} onChange={event => upsert('workouts', { ...selected, completedAt: event.target.value ? endAfter(selected.startedAt, zonedInstant(selected.date, event.target.value, zone)) : undefined })} />{selected.completedAt ? <button type="button" aria-label="Clear end time" onClick={() => upsert('workouts', { ...selected, completedAt: undefined })}><X size={14} /></button> : null}</span></label>
      </div>
      <p className={s.hint}>Optional. Leave them blank for a workout logged after the fact; an end before the start counts as past midnight.</p>
      <TextField label="Notes" value={selected.notes} onChange={notes => upsert('workouts', { ...selected, notes })} multiline placeholder="Energy, focus, anything to remember…" />
      <div className={s.sheetActions}>
        <button type="button" className={s.sheetAction} onClick={() => { setDetails(false); setSavingRoutine(true); }}><Repeat size={16} />Save as routine</button>
        <button type="button" className={s.sheetAction} onClick={() => { setDetails(false); createSession(selected); }}><Plus size={16} />Repeat as another workout today</button>
        <button type="button" className={`${s.sheetAction} ${s.danger}`} onClick={() => { setDetails(false); setDeleting({ kind: 'workouts', id: selected.id, name: selected.title || 'this workout' }); }}><Trash2 size={16} />Delete workout</button>
      </div>
    </div></Modal> : null}
    {library ? <ExerciseLibrary definitions={definitions} onSave={definition => upsert('exercises', definition)} onSelect={library.kind === 'manage' ? undefined : addExercise} onClose={() => setLibrary(null)} /> : null}
    {locationFor ? <LocationPicker locations={locations} currentId={(locationFor.kind === 'session' ? records.workouts[locationFor.id] : records.routines[locationFor.id])?.locationId ?? null} onCreate={location => upsert('locations', location)} onSelect={selectLocation} onClose={() => setLocationFor(null)} /> : null}
    {routine && !library && !locationFor ? <RoutineEditor routine={routine} locationName={records.locations[routine.locationId ?? '']?.name} onChange={value => upsert('routines', value)} onLocation={() => setLocationFor({ kind: 'routine', id: routine.id })} onAdd={() => setLibrary({ kind: 'routine', id: routine.id })} onClose={() => setRoutineEditor(null)} /> : null}
    {savingRoutine && selected ? <SaveRoutine session={selected} existing={selected.routineId ? records.routines[selected.routineId] : undefined} onClose={() => setSavingRoutine(false)} onSave={(name, id) => {
      const value = routineFromSession(selected, name, id);
      upsert('routines', value);
      upsert('workouts', { ...selected, routineId: value.id, exercises: selected.exercises.map((exercise, index) => ({ ...exercise, routineExerciseId: value.exercises[index].id })) });
      setSavingRoutine(false); setNotice(`Saved “${name}” as a routine. Logged results were not copied.`);
    }} /> : null}
    {deleting ? <Modal title={`Delete ${deleting.kind === 'workouts' ? 'workout' : 'routine'}?`} onClose={() => setDeleting(null)}><div className={s.stack}><p className={s.hint}>Delete “{deleting.name}”? {deleting.kind === 'workouts' ? 'Its logged exercises and sets will be removed.' : 'Existing workouts keep their entries.'}</p><div className={s.actionRow}><button type="button" className={p.button} onClick={() => setDeleting(null)}>Keep it</button><button type="button" className={`${p.button} ${p.danger}`} onClick={() => { remove(deleting.kind, deleting.id); setDeleting(null); }}>Delete</button></div></div></Modal> : null}
  </main>;
}

function StartWorkout({ routines, sessions, locations, onStart, onClose }: { routines: Routine[]; sessions: WorkoutSession[]; locations: Record<string, Location>; onStart: (source?: WorkoutSession | Routine) => void; onClose: () => void }) {
  return <Modal title="Start a workout" onClose={onClose}><div className={s.stack}>
    <button type="button" className={`${p.button} ${p.primary}`} onClick={() => onStart()}>Empty workout</button>
    {routines.length ? <><h3 className={s.smallHeading}>Your routines</h3>{routines.map(routine => <button type="button" className={s.choiceButton} key={routine.id} onClick={() => onStart(routine)}><div><strong>{routine.name || 'Untitled routine'}</strong><span>{routine.exercises.length} exercises · {locations[routine.locationId ?? '']?.name || 'No location'}</span></div><Plus size={16} /></button>)}</> : null}
    {sessions.length ? <><h3 className={s.smallHeading}>Repeat a recent workout</h3><p className={s.hint}>Copy exercises and targets with fresh, blank results.</p>{sessions.slice(0, 6).map(session => <button type="button" className={s.choiceButton} key={session.id} onClick={() => onStart(session)}><div><strong>{session.title || 'Untitled workout'}</strong><span>{session.date} · {session.exercises.length} exercises</span></div><Plus size={16} /></button>)}</> : null}
  </div></Modal>;
}

function RoutineEditor({ routine, locationName, onChange, onLocation, onAdd, onClose }: { routine: Routine; locationName?: string; onChange: (routine: Routine) => void; onLocation: () => void; onAdd: () => void; onClose: () => void }) {
  const updateEntry = (next: SessionExercise) => onChange({ ...routine, exercises: routine.exercises.map(exercise => exercise.id === next.id ? next : exercise) });
  return <Modal title="Edit routine" onClose={onClose}><div className={s.stack}>
    <TextField label="Routine name" value={routine.name} onChange={name => onChange({ ...routine, name })} />
    <button type="button" className={s.chip} onClick={onLocation}><MapPin size={13} />{locationName || 'Choose location'}</button>
    <p className={s.hint}>These targets apply to future workouts. Previously logged workouts stay unchanged.</p>
    {routine.exercises.map((exercise, index) => <div className={s.routineExercise} key={exercise.id}>
      <h3>{index + 1}. {exercise.name}</h3>
      {exercise.tracking !== 'cardio' ? <div className={s.targetGrid}>
        <NumberField label="Sets" value={exercise.targets.sets} min={1} max={50} step={1} onChange={value => { if (value != null && value >= 1) updateEntry(applyTargets(exercise, { ...exercise.targets, sets: Math.min(50, Math.floor(value)) })); }} />
        {exercise.tracking !== 'duration' ? <><NumberField label="Reps" value={exercise.targets.reps} min={0} step={0.5} onChange={reps => updateEntry(applyTargets(exercise, { ...exercise.targets, reps }))} /><NumberField label="Up to" value={exercise.targets.repsMax ?? null} min={0} step={0.5} onChange={repsMax => updateEntry(applyTargets(exercise, { ...exercise.targets, repsMax }))} /></> : null}
      </div> : <p className={s.meta}>Cardio</p>}
      <TextField label="Machine / setup" value={exercise.equipment} onChange={equipment => updateEntry({ ...exercise, equipment })} />
      <div className={s.actionRow}><button type="button" className={s.chip} disabled={index === 0} onClick={() => { const exercises = [...routine.exercises]; [exercises[index - 1], exercises[index]] = [exercises[index], exercises[index - 1]]; onChange({ ...routine, exercises }); }}>Up</button><button type="button" className={s.chip} disabled={index === routine.exercises.length - 1} onClick={() => { const exercises = [...routine.exercises]; [exercises[index], exercises[index + 1]] = [exercises[index + 1], exercises[index]]; onChange({ ...routine, exercises }); }}>Down</button><button type="button" className={`${s.chip} ${s.danger}`} onClick={() => onChange({ ...routine, exercises: routine.exercises.filter(item => item.id !== exercise.id) })}>Remove</button></div>
    </div>)}
    <button type="button" className={`${p.button} ${p.primary}`} onClick={onAdd}><Plus size={15} />Add exercise</button>
    <TextField label="Routine notes" value={routine.notes} onChange={notes => onChange({ ...routine, notes })} multiline />
  </div></Modal>;
}

function SaveRoutine({ session, existing, onSave, onClose }: { session: WorkoutSession; existing?: Routine; onSave: (name: string, id?: string) => void; onClose: () => void }) {
  const [name, setName] = useState(existing?.name || session.title);
  return <Modal title="Save routine" onClose={onClose}><div className={s.stack}><TextField label="Routine name" value={name} onChange={setName} /><p className={s.hint}>Save exercises, order, targets, and machine setup. Actual sets, cardio results, notes, and Watch links stay in this workout.</p><button type="button" className={`${p.button} ${p.primary}`} disabled={!name.trim()} onClick={() => onSave(name.trim())}>Save as new routine</button>{existing ? <button type="button" className={s.chip} disabled={!name.trim()} onClick={() => onSave(name.trim(), existing.id)}>Update “{existing.name || 'Untitled routine'}”</button> : null}</div></Modal>;
}

function setupKey(exercise: SessionExercise, session: WorkoutSession) { return [exercise.exerciseId, effectiveLocationId(exercise, session) ?? '', normalizeSetup(exercise.equipment), exercise.tracking, exercise.perHand, exercise.unilateral].join('|'); }

function WorkoutInsights({ sessions, date, locations, onOpen }: { sessions: WorkoutSession[]; date: string; locations: Record<string, Location>; onOpen: (session: WorkoutSession) => void }) {
  const [exerciseId, setExerciseId] = useState('');
  const [chosenSetup, setChosenSetup] = useState('');
  const insights = workoutInsights(sessions, date);
  const all = sessions.filter(session => session.date <= date).flatMap(session => session.exercises.filter(exerciseHasResults).map(exercise => ({ session, exercise })));
  const exercises = [...new Map(all.map(item => [item.exercise.exerciseId, item.exercise.name])).entries()];
  const selectedId = exerciseId || exercises[0]?.[0] || '';
  const history = all.filter(item => item.exercise.exerciseId === selectedId);
  const setups = [...new Map(history.map(item => [setupKey(item.exercise, item.session), item])).entries()];
  const selectedSetup = setups.some(([key]) => key === chosenSetup) ? chosenSetup : setups[0]?.[0];
  const selectedHistory = history.filter(item => setupKey(item.exercise, item.session) === selectedSetup).slice(0, 12);
  const muscles = Object.entries(insights.muscles).sort((a, b) => b[1] - a[1]);
  const maxMuscle = Math.max(1, ...muscles.map(([, count]) => count));
  const recent = sessions.filter(session => session.date >= insights.from && session.date <= date);

  return <div className={s.stack}>
    <div className={s.sectionHeading}><h2>Last 28 days</h2><span className={s.meta}>{insights.from.slice(5)} – {date.slice(5)}</span></div>
    <div className={s.insightStats}><div><b>{insights.trainingDays}</b><span>training days</span></div><div><b>{insights.sessions}</b><span>workouts logged</span></div><div><b>{insights.sets}</b><span>working sets</span></div><div><b>{displayNumber(insights.cardioMinutes)}</b><span>cardio minutes</span></div></div>
    <section className={s.insightCard}><h3>Weekly consistency</h3><p className={s.hint}>Distinct days with recorded exercise, grouped into seven-day periods.</p><div className={s.weekChart} role="img" aria-label={insights.weeks.map(week => `${week.start} through ${week.end}: ${week.days} training days`).join('; ')}>{insights.weeks.map(week => <div className={s.weekColumn} key={week.start}><b>{week.days}</b><div className={s.barTrack}><div style={{ height: `${week.days / 7 * 100}%` }} /></div><span>{week.start.slice(5)}</span></div>)}</div></section>
    <section className={s.insightCard}><h3>Working sets by muscle</h3><p className={s.hint}>Each ready working set counts once under its primary muscle. Warmups and extra drop/rest-pause segments are excluded.</p>{muscles.length ? muscles.map(([muscle, count]) => <div className={s.muscleBar} key={muscle}><span>{muscle}</span><div><i style={{ width: `${count / maxMuscle * 100}%` }} /></div><b>{count}</b></div>) : <p className={s.empty}>Your logged working sets will appear here.</p>}</section>
    <section className={s.insightCard}><h3>Exercise progress</h3><p className={s.hint}>Compare actual sets on the same location and machine setup. Weight units and reps are shown together.</p>{exercises.length ? <>
      <label className={s.field}>Exercise<select value={selectedId} onChange={event => { setExerciseId(event.target.value); setChosenSetup(''); }}>{exercises.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label className={s.field}>Setup<select value={selectedSetup} onChange={event => setChosenSetup(event.target.value)}>{setups.map(([key, item]) => <option key={key} value={key}>{locations[effectiveLocationId(item.exercise, item.session) ?? '']?.name || 'No location'} · {item.exercise.equipment || 'No machine specified'}{item.exercise.perHand ? ' · per hand' : ''}{item.exercise.unilateral ? ' · R/L' : ''}</option>)}</select></label>
      {selectedHistory.map(item => <button type="button" className={s.progressRow} key={`${item.session.id}-${item.exercise.id}`} onClick={() => onOpen(item.session)}><strong>{item.session.date} · {item.session.title || 'Workout'}</strong><span>{resultSummary(item.exercise)}</span></button>)}
    </> : <p className={s.empty}>Log an exercise to start its progress history.</p>}</section>
    <section className={s.insightCard}><h3>Workout history</h3>{recent.length ? recent.map(session => <button type="button" className={s.progressRow} key={session.id} onClick={() => onOpen(session)}><strong>{session.date} · {session.title || 'Untitled workout'}</strong><span>{session.exercises.reduce((total, exercise) => total + completedWorkingSets(exercise), 0)} working sets · {locations[session.locationId ?? '']?.name || 'No location'} · {session.status === 'complete' ? 'Finished' : 'Open'}</span></button>) : <p className={s.empty}>No workouts in this period. Use the calendar to explore another date.</p>}</section>
  </div>;
}
