'use client';

import { useState } from 'react';
import { MUSCLES, newId, type ExerciseDefinition, type Location, type Tracking } from '@/lib/domain/types';
import { TRACKING_LABELS } from '@/lib/domain/workouts';
import { Modal, TextField } from './controls';
import s from './workout.module.css';

export function ExerciseLibrary({ definitions, onSave, onSelect, onClose }: {
  definitions: ExerciseDefinition[]; onSave: (definition: ExerciseDefinition) => void;
  onSelect?: (definition: ExerciseDefinition) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState('');
  const [editing, setEditing] = useState<ExerciseDefinition | null>(null);
  const [newExercise, setNewExercise] = useState(false);
  const [error, setError] = useState('');
  const matches = definitions.filter(definition => !definition.archived &&
    (!muscle || definition.primaryMuscle === muscle || definition.secondaryMuscles.includes(muscle)) &&
    `${definition.name} ${definition.primaryMuscle} ${definition.secondaryMuscles.join(' ')}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  const startNew = () => {
    setEditing({ id: newId(), name: query.trim(), tracking: 'weight_reps', primaryMuscle: muscle || 'Other', secondaryMuscles: [], perHand: false, unilateral: false, notes: '' });
    setNewExercise(true); setError('');
  };
  const save = (add: boolean) => {
    if (!editing?.name.trim()) { setError('Give the exercise a name.'); return; }
    const definition = { ...editing, name: editing.name.trim(), secondaryMuscles: editing.secondaryMuscles.filter(item => item !== editing.primaryMuscle) };
    onSave(definition);
    if (add && onSelect) { onSelect(definition); return; }
    setEditing(null); setError('');
  };

  return <Modal title={editing ? newExercise ? 'Create exercise' : 'Edit exercise' : onSelect ? 'Add exercise' : 'Exercise library'} onClose={onClose}>
    {editing ? <div className={s.stack}>
      <TextField label="Exercise name" value={editing.name} onChange={name => setEditing({ ...editing, name })} placeholder="Incline dumbbell press" />
      <label className={s.field}>Track<select value={editing.tracking} onChange={event => {
        const tracking = event.target.value as Tracking;
        setEditing({ ...editing, tracking, perHand: tracking === 'weight_reps' || tracking === 'assisted_reps' ? editing.perHand : false, unilateral: tracking === 'cardio' || tracking === 'duration' ? false : editing.unilateral });
      }}>{Object.entries(TRACKING_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className={s.field}>Primary muscle<select value={editing.primaryMuscle} onChange={event => setEditing({ ...editing, primaryMuscle: event.target.value, secondaryMuscles: editing.secondaryMuscles.filter(item => item !== event.target.value) })}>{MUSCLES.map(item => <option key={item}>{item}</option>)}</select></label>
      <fieldset className={s.muscleField}><legend>Secondary muscles</legend><div className={s.muscleChoices}>{MUSCLES.filter(item => item !== editing.primaryMuscle && item !== 'Other' && item !== 'Cardio').map(item => <label className={s.checkbox} key={item}><input type="checkbox" checked={editing.secondaryMuscles.includes(item)} onChange={event => setEditing({ ...editing, secondaryMuscles: event.target.checked ? [...editing.secondaryMuscles, item] : editing.secondaryMuscles.filter(value => value !== item) })} />{item}</label>)}</div></fieldset>
      {editing.tracking === 'weight_reps' || editing.tracking === 'assisted_reps' ? <label className={s.checkbox}><input type="checkbox" checked={editing.perHand} onChange={event => setEditing({ ...editing, perHand: event.target.checked })} />Weight is per hand</label> : null}
      {editing.tracking !== 'cardio' && editing.tracking !== 'duration' ? <label className={s.checkbox}><input type="checkbox" checked={editing.unilateral} onChange={event => setEditing({ ...editing, unilateral: event.target.checked })} />Record right and left separately</label> : null}
      <TextField label="Instructions / description" value={editing.notes ?? ''} onChange={notes => setEditing({ ...editing, notes })} multiline placeholder="Movement cues or what makes this variation distinct" />
      {!newExercise ? <p className={s.hint}>Definition changes apply when adding this exercise again. Existing workout entries keep their recorded setup.</p> : null}
      {error ? <p className={s.warning} role="alert">{error}</p> : null}
      <div className={s.actionRow}><button type="button" className={s.smallButton} onClick={() => setEditing(null)}>Back</button><button type="button" className={s.primaryButton} onClick={() => save(false)}>Save exercise</button>{onSelect ? <button type="button" className={s.primaryButton} onClick={() => save(true)}>Save & add</button> : null}</div>
      {!newExercise ? <button type="button" className={s.dangerButton} onClick={() => { onSave({ ...editing, archived: true }); setEditing(null); }}>Archive from library</button> : null}
    </div> : <div className={s.stack}>
      <TextField label="Search exercises" value={query} onChange={setQuery} placeholder="Name or muscle…" />
      <label className={s.field}>Muscle filter<select value={muscle} onChange={event => setMuscle(event.target.value)}><option value="">All muscles</option>{MUSCLES.map(item => <option key={item}>{item}</option>)}</select></label>
      <button type="button" className={s.primaryButton} onClick={startNew}>+ Create exercise{query.trim() ? `: ${query.trim()}` : ''}</button>
      {!matches.length ? <p className={s.empty}>No matching exercises. Create one with the tracking fields you need.</p> : null}
      <div className={s.libraryList}>{matches.map(definition => <div className={s.libraryRow} key={definition.id}>
        {onSelect ? <button type="button" className={s.librarySelect} onClick={() => onSelect(definition)}><strong>{definition.name}</strong><span>{definition.primaryMuscle} · {TRACKING_LABELS[definition.tracking]}{definition.unilateral ? ' · R/L' : ''}{definition.perHand ? ' · per hand' : ''}</span>{definition.notes ? <small>{definition.notes}</small> : null}</button> : <div className={s.librarySelect}><strong>{definition.name}</strong><span>{definition.primaryMuscle} · {TRACKING_LABELS[definition.tracking]}</span></div>}
        <button type="button" className={s.smallButton} aria-label={`Edit ${definition.name}`} onClick={() => { setEditing({ ...definition, secondaryMuscles: [...definition.secondaryMuscles] }); setNewExercise(false); setError(''); }}>Edit</button>
      </div>)}</div>
      {definitions.some(definition => definition.archived) ? <details className={s.details}><summary>Archived exercises</summary><div className={s.detailsBody}>{definitions.filter(definition => definition.archived).map(definition => <div className={s.libraryRow} key={definition.id}><span>{definition.name}</span><button type="button" className={s.smallButton} onClick={() => onSave({ ...definition, archived: false })}>Restore</button></div>)}</div></details> : null}
    </div>}
  </Modal>;
}

export function LocationPicker({ locations, currentId, onSelect, onCreate, onClose }: { locations: Location[]; currentId: string | null; onSelect: (id: string | null) => void; onCreate: (location: Location) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) { setError('Enter a location name.'); return; }
    const existing = locations.find(location => !location.archived && location.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase());
    if (existing) { onSelect(existing.id); return; }
    const location = { id: newId(), name: trimmed };
    onCreate(location); onSelect(location.id);
  };
  return <Modal title="Workout location" onClose={onClose}>
    <div className={s.stack}>
      <p className={s.hint}>Your last choice becomes the default for new workouts.</p>
      <button type="button" className={s.choiceButton} aria-pressed={currentId === null} onClick={() => onSelect(null)}>No location {currentId === null ? '✓' : ''}</button>
      {locations.filter(location => !location.archived).sort((a, b) => a.name.localeCompare(b.name)).map(location => <button type="button" className={s.choiceButton} key={location.id} aria-pressed={currentId === location.id} onClick={() => onSelect(location.id)}>{location.name}{currentId === location.id ? <span>✓</span> : null}</button>)}
      <form onSubmit={event => { event.preventDefault(); create(); }} className={s.stack}>
        <TextField label="New location" value={name} onChange={setName} placeholder="Gym, home, hotel…" />
        {error ? <p className={s.warning} role="alert">{error}</p> : null}
        <button type="submit" className={s.primaryButton}>Add location & use</button>
      </form>
    </div>
  </Modal>;
}
