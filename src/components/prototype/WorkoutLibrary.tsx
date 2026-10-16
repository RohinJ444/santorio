'use client';

import { useEffect, useRef, useState } from 'react';
import { MUSCLES, newId, type ExerciseDefinition, type Location, type Tracking } from '@/lib/domain/types';
import { TRACKING_LABELS } from '@/lib/domain/workouts';
import { Check, ChevronDown, Pencil, Plus } from 'lucide-react';
import { Modal, TextField } from './controls';
import p from './prototype.module.css';
import s from './workout.module.css';

/** Short names so the track dropdown fits beside the muscle dropdowns. */
const TRACK_SHORT: Record<Tracking, string> = { weight_reps: 'Weight', assisted_reps: 'Assisted', reps: 'Reps', duration: 'Time', cardio: 'Cardio' };

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

  const toggle = (muscle: string) => editing && setEditing({ ...editing, secondaryMuscles: editing.secondaryMuscles.includes(muscle) ? editing.secondaryMuscles.filter(value => value !== muscle) : [...editing.secondaryMuscles, muscle] });

  return <Modal title={editing ? newExercise ? 'New exercise' : 'Edit exercise' : onSelect ? 'Add exercise' : 'Exercise library'} onClose={onClose}>
    {editing ? <div className={s.stack}>
      <TextField label="Name" value={editing.name} onChange={name => setEditing({ ...editing, name })} placeholder="Incline dumbbell press" />
      <div className={s.trackRow} data-cardio={editing.tracking === 'cardio'}>
        <label className={s.field}>Track<select value={editing.tracking} onChange={event => {
          const tracking = event.target.value as Tracking;
          const cardio = tracking === 'cardio';
          setEditing({ ...editing, tracking, perHand: tracking === 'weight_reps' || tracking === 'assisted_reps' ? editing.perHand : false, unilateral: cardio || tracking === 'duration' ? false : editing.unilateral,
            // cardio has no muscle groups; switching back starts from Other
            primaryMuscle: cardio ? 'Cardio' : editing.primaryMuscle === 'Cardio' ? 'Other' : editing.primaryMuscle, secondaryMuscles: cardio ? [] : editing.secondaryMuscles });
        }}>{Object.entries(TRACK_SHORT).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {editing.tracking !== 'cardio' ? <>
          <label className={s.field}>Primary<select value={editing.primaryMuscle} onChange={event => setEditing({ ...editing, primaryMuscle: event.target.value, secondaryMuscles: editing.secondaryMuscles.filter(item => item !== event.target.value) })}>{MUSCLES.filter(item => item !== 'Cardio').map(item => <option key={item}>{item}</option>)}</select></label>
          <div className={s.field}>Secondary<MultiSelect label="Secondary muscles" options={MUSCLES.filter(item => item !== editing.primaryMuscle && item !== 'Other' && item !== 'Cardio')} value={editing.secondaryMuscles} onToggle={toggle} /></div>
        </> : null}
      </div>
      {editing.tracking === 'cardio' ? <p className={s.hint}>Logs speed (mph), incline, time and distance, for runs, incline walks and other cardio.</p> : null}
      {editing.tracking !== 'cardio' && editing.tracking !== 'duration' ? <div className={s.toggles}>
        {editing.tracking === 'weight_reps' || editing.tracking === 'assisted_reps' ? <button type="button" className={s.chip} aria-pressed={editing.perHand} onClick={() => setEditing({ ...editing, perHand: !editing.perHand })}>Weight is per hand</button> : null}
        <button type="button" className={s.chip} aria-pressed={editing.unilateral} onClick={() => setEditing({ ...editing, unilateral: !editing.unilateral })}>Right and left separately</button>
      </div> : null}
      <TextField label="Cues (optional)" value={editing.notes ?? ''} onChange={notes => setEditing({ ...editing, notes })} multiline placeholder="Movement cues or what makes this variation distinct" />
      {!newExercise ? <p className={s.hint}>Changes apply the next time you add it. Logged workouts keep their setup.</p> : null}
      {error ? <p className={s.warning} role="alert">{error}</p> : null}
      <div className={s.actionRow}><button type="button" className={p.button} onClick={() => setEditing(null)}>Back</button>{onSelect ? <button type="button" className={`${p.button} ${p.primary}`} onClick={() => save(true)}>Save & add</button> : null}<button type="button" className={onSelect ? p.button : `${p.button} ${p.primary}`} onClick={() => save(false)}>Save</button>{!newExercise ? <button type="button" className={`${s.chip} ${s.danger} ${s.push}`} onClick={() => { onSave({ ...editing, archived: true }); setEditing(null); }}>Archive</button> : null}</div>
    </div> : <div className={s.stack}>
      <input className={p.input} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search exercises" aria-label="Search exercises" />
      <div className={s.filterChips} role="group" aria-label="Filter by muscle">{['', ...MUSCLES].map(item => <button type="button" key={item || 'all'} className={s.chip} aria-pressed={muscle === item} onClick={() => setMuscle(item)}>{item || 'All'}</button>)}</div>
      <div className={s.libraryList}>{matches.map(definition => <div className={s.libraryRow} key={definition.id}>
        {onSelect ? <button type="button" className={s.librarySelect} onClick={() => onSelect(definition)}><strong>{definition.name}</strong><span>{definition.tracking === 'cardio' ? '' : `${definition.primaryMuscle} · `}{TRACKING_LABELS[definition.tracking]}{definition.unilateral ? ' · R/L' : ''}{definition.perHand ? ' · per hand' : ''}</span></button> : <div className={s.librarySelect}><strong>{definition.name}</strong><span>{definition.tracking === 'cardio' ? '' : `${definition.primaryMuscle} · `}{TRACKING_LABELS[definition.tracking]}</span></div>}
        <button type="button" className={s.more} aria-label={`Edit ${definition.name}`} onClick={() => { setEditing({ ...definition, secondaryMuscles: [...definition.secondaryMuscles] }); setNewExercise(false); setError(''); }}><Pencil size={15} /></button>
      </div>)}</div>
      {!matches.length ? <p className={s.empty}>{definitions.length ? 'No matches.' : 'Your library is empty.'}</p> : null}
      <button type="button" className={s.addExercise} onClick={startNew}><Plus size={15} />New exercise{query.trim() ? `: ${query.trim()}` : ''}</button>
      {definitions.some(definition => definition.archived) ? <details><summary className={s.hint}>Archived</summary>{definitions.filter(definition => definition.archived).map(definition => <div className={s.libraryRow} key={definition.id}><span className={s.grow}>{definition.name}</span><button type="button" className={s.chip} onClick={() => onSave({ ...definition, archived: false })}>Restore</button></div>)}</details> : null}
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
  return <Modal title="Location" onClose={onClose}>
    <div className={s.stack}>
      <div className={s.libraryList}>
        {[{ id: null as string | null, name: 'No location' }, ...locations.filter(location => !location.archived).sort((a, b) => a.name.localeCompare(b.name))].map(location => <button type="button" className={s.libraryRow} key={location.id ?? 'none'} aria-pressed={currentId === location.id} onClick={() => onSelect(location.id)}><span className={s.grow} style={{ textAlign: 'left', fontSize: 14 }}>{location.name}</span>{currentId === location.id ? <Check size={16} color="var(--c)" /> : null}</button>)}
      </div>
      <form onSubmit={event => { event.preventDefault(); create(); }} className={s.actionRow} style={{ flexWrap: 'nowrap' }}>
        <input className={p.input} value={name} onChange={event => setName(event.target.value)} placeholder="New location" aria-label="New location" />
        <button type="submit" className={`${p.button} ${p.primary}`}>Add</button>
      </form>
      {error ? <p className={s.warning} role="alert">{error}</p> : null}
      <p className={s.hint}>Your last choice becomes the default for new workouts.</p>
    </div>
  </Modal>;
}

/** A dropdown that holds several choices: shows a short summary, opens a checklist. */
function MultiSelect({ label, options, value, onToggle }: { label: string; options: string[]; value: string[]; onToggle: (option: string) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const chosen = value.filter(item => options.includes(item));
  return <div className={s.multi} ref={root}>
    <button type="button" className={s.multiButton} aria-haspopup="listbox" aria-expanded={open} aria-label={`${label}: ${chosen.join(', ') || 'none'}`} onClick={() => setOpen(!open)}><span>{chosen.length ? chosen.length > 1 ? `${chosen[0]} +${chosen.length - 1}` : chosen[0] : 'None'}</span><ChevronDown size={14} /></button>
    {open ? <div className={s.multiMenu} role="listbox" aria-multiselectable aria-label={label}>{options.map(option => <button type="button" role="option" aria-selected={value.includes(option)} key={option} onClick={() => onToggle(option)}>{option}{value.includes(option) ? <Check size={14} /> : null}</button>)}</div> : null}
  </div>;
}
