import { newId, type ExerciseDefinition, type Routine, type SessionExercise, type SetSegment, type Targets, type TrainingSet, type WorkoutSession } from './types';

export const TRACKING_LABELS = {
  weight_reps: 'Weight + reps', assisted_reps: 'Assistance + reps', reps: 'Reps only',
  duration: 'Duration', cardio: 'Cardio',
} as const;

export function blankSet(targets: Targets, warmup = false): TrainingSet {
  return { id: newId(), warmup, targetReps: targets.reps, targetRepsMax: targets.repsMax ?? null, segments: [{ weight: null, reps: null }] };
}

export function newSession(date: string, locationId: string | null, title = 'Workout'): WorkoutSession {
  return { id: newId(), date, title, locationId, status: 'active', startedAt: new Date().toISOString(), notes: '', exercises: [], healthWorkoutIds: [] };
}

export function newSessionExercise(definition: ExerciseDefinition, weightUnit: 'lb' | 'kg'): SessionExercise {
  const targets: Targets = { sets: definition.tracking === 'cardio' || definition.tracking === 'duration' ? 1 : 3, reps: null, repsMax: null };
  return {
    id: newId(), exerciseId: definition.id, name: definition.name, tracking: definition.tracking,
    primaryMuscle: definition.primaryMuscle, secondaryMuscles: [...definition.secondaryMuscles],
    equipment: '', perHand: definition.perHand, unilateral: definition.unilateral, weightUnit, targets,
    sets: definition.tracking === 'cardio' ? [] : Array.from({ length: targets.sets }, () => blankSet(targets)), notes: '',
    ...(definition.tracking === 'cardio' ? { cardio: { minutes: null, distance: null, distanceUnit: 'mi' as const, speed: null, incline: null } } : {}),
  };
}

/** Templates contain prescriptions and setup, never results or import associations. */
export function clearExerciseResults(exercise: SessionExercise): SessionExercise {
  return {
    ...exercise, id: newId(), secondaryMuscles: [...exercise.secondaryMuscles], targets: { ...exercise.targets }, notes: '',
    sets: exercise.tracking === 'cardio' ? [] : Array.from({ length: exercise.targets.sets }, () => blankSet(exercise.targets)),
    ...(exercise.tracking === 'cardio' ? { cardio: { minutes: null, distance: null, distanceUnit: exercise.cardio?.distanceUnit ?? 'mi', speed: null, incline: null } } : { cardio: undefined }),
  };
}

export function repeatSession(source: WorkoutSession | Routine, date: string): WorkoutSession {
  return {
    ...newSession(date, source.locationId, 'title' in source ? source.title : source.name),
    exercises: source.exercises.map(exercise => ({ ...clearExerciseResults(exercise), ...(!('title' in source) ? { routineExerciseId: exercise.id } : {}) })),
    ...('title' in source ? (source.routineId ? { routineId: source.routineId } : {}) : { routineId: source.id }),
  };
}

export function routineFromSession(session: WorkoutSession, name: string, id = newId()): Routine {
  return { id, name, locationId: session.locationId, notes: '', exercises: session.exercises.map(exercise => ({ ...clearExerciseResults(exercise), ...(session.routineId === id && exercise.routineExerciseId ? { id: exercise.routineExerciseId } : {}), routineExerciseId: undefined })) };
}

/** Adjust planned blanks while retaining every recorded value, even an unfinished set. */
export function applyTargets(exercise: SessionExercise, targets: Targets): SessionExercise {
  let workIndex = 0;
  const retained = exercise.sets.filter(set => set.warmup || workIndex++ < targets.sets || setHasData(set));
  let workCount = retained.filter(set => !set.warmup).length;
  while (workCount++ < targets.sets) retained.push(blankSet(targets));
  return { ...exercise, targets, sets: exercise.tracking === 'cardio' ? exercise.sets : retained.map(set => ({ ...set, ...(!setHasData(set) && !set.warmup ? { targetReps: targets.reps, targetRepsMax: targets.repsMax ?? null } : {}) })) };
}

export function setHasData(set: TrainingSet): boolean {
  return Boolean(set.notes?.trim()) || set.durationMinutes != null || set.segments.some(segment =>
    [segment.weight, segment.reps, segment.leftReps, segment.rightReps, segment.leftWeight, segment.rightWeight, segment.restSeconds].some(value => value != null));
}

export function setPrescription(set: TrainingSet, exercise: SessionExercise) {
  return { reps: set.targetReps === undefined ? exercise.targets.reps : set.targetReps, repsMax: set.targetRepsMax === undefined ? exercise.targets.repsMax : set.targetRepsMax };
}

function nonnegative(value: number | null | undefined): value is number { return value != null && Number.isFinite(value) && value >= 0; }

/** Readiness is inferred. Logging never requires a separate Save or Done tap. */
export function setIsReady(set: TrainingSet, exercise: SessionExercise): boolean {
  if (exercise.tracking === 'duration') return nonnegative(set.durationMinutes) && set.durationMinutes > 0;
  if (!set.segments.length) return false;
  const weighted = exercise.tracking === 'weight_reps' || exercise.tracking === 'assisted_reps';
  return set.segments.every(segment => {
    if (exercise.unilateral) {
      return nonnegative(segment.leftReps) && nonnegative(segment.rightReps) &&
        (!weighted || (nonnegative(segment.leftWeight ?? segment.weight) && nonnegative(segment.rightWeight ?? segment.weight)));
    }
    return nonnegative(segment.reps) && (!weighted || nonnegative(segment.weight));
  });
}

export function completedWorkingSets(exercise: SessionExercise): number {
  return exercise.sets.filter(set => !set.warmup && setIsReady(set, exercise)).length;
}

export function exerciseHasResults(exercise: SessionExercise): boolean {
  return exercise.tracking === 'cardio'
    ? (exercise.cardio?.minutes ?? 0) > 0 || (exercise.cardio?.distance ?? 0) > 0
    : exercise.sets.some(set => setIsReady(set, exercise));
}

export function normalizeSetup(value: string): string { return value.trim().toLocaleLowerCase().replace(/\s+/g, ' '); }

export function effectiveLocationId(exercise: SessionExercise, session: Pick<WorkoutSession, 'locationId'>): string | null {
  return exercise.locationId === undefined ? session.locationId : exercise.locationId;
}

export function sameSetup(a: SessionExercise, aSession: WorkoutSession, b: SessionExercise, bSession: WorkoutSession): boolean {
  return a.exerciseId === b.exerciseId && a.tracking === b.tracking && a.perHand === b.perHand && a.unilateral === b.unilateral &&
    effectiveLocationId(a, aSession) === effectiveLocationId(b, bSession) && normalizeSetup(a.equipment) === normalizeSetup(b.equipment);
}

export type ExerciseHistory = { session: WorkoutSession; exercise: SessionExercise; same: boolean };

export function exerciseHistory(sessions: WorkoutSession[], current: WorkoutSession, exercise: SessionExercise): ExerciseHistory[] {
  return sessions.filter(session => session.id !== current.id && (session.date < current.date || (session.date === current.date && session.startedAt < current.startedAt)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.startedAt.localeCompare(a.startedAt))
    .flatMap(session => session.exercises.filter(item => item.exerciseId === exercise.exerciseId && exerciseHasResults(item))
      .map(item => ({ session, exercise: item, same: sameSetup(exercise, current, item, session) })));
}

export function displayNumber(value: number | null | undefined): string { return value == null ? '—' : Number(value.toFixed(2)).toString(); }

function segmentSummary(segment: SetSegment, exercise: SessionExercise): string {
  const weighted = exercise.tracking === 'weight_reps' || exercise.tracking === 'assisted_reps';
  const weight = (value: number | null | undefined) => `${displayNumber(value)} ${exercise.weightUnit}${exercise.perHand ? '/hand' : ''}${exercise.tracking === 'assisted_reps' ? ' assist' : ''}`;
  if (exercise.unilateral) {
    return `R ${weighted ? weight(segment.rightWeight ?? segment.weight) + ' × ' : ''}${displayNumber(segment.rightReps)} / L ${weighted ? weight(segment.leftWeight ?? segment.weight) + ' × ' : ''}${displayNumber(segment.leftReps)}`;
  }
  return `${weighted ? weight(segment.weight) + ' × ' : ''}${displayNumber(segment.reps)}${weighted ? '' : ' reps'}`;
}

export function setSummary(set: TrainingSet, exercise: SessionExercise): string {
  if (exercise.tracking === 'duration') return `${displayNumber(set.durationMinutes)} min`;
  return set.segments.map((segment, i) => `${i ? segment.link === 'pause' ? ` + pause${segment.restSeconds == null ? '' : ` ${displayNumber(segment.restSeconds)}s`} → ` : ' ↘ ' : ''}${segmentSummary(segment, exercise)}`).join('');
}

export function resultSummary(exercise: SessionExercise): string {
  if (exercise.tracking === 'cardio') {
    const cardio = exercise.cardio;
    if (!cardio) return 'No results';
    return [cardio.minutes != null ? `${displayNumber(cardio.minutes)} min` : '', cardio.distance != null ? `${displayNumber(cardio.distance)} ${cardio.distanceUnit}` : '', cardio.speed != null ? `${displayNumber(cardio.speed)} ${cardio.distanceUnit}/h` : '', cardio.incline != null ? `${displayNumber(cardio.incline)}% incline` : ''].filter(Boolean).join(' · ') || 'No results';
  }
  return exercise.sets.filter(set => !set.warmup && setIsReady(set, exercise)).map(set => setSummary(set, exercise)).join(' · ') || 'No working sets yet';
}

export function convertExerciseWeight(exercise: SessionExercise, unit: 'lb' | 'kg'): SessionExercise {
  if (unit === exercise.weightUnit) return exercise;
  const factor = unit === 'kg' ? 0.45359237 : 1 / 0.45359237;
  const convert = (value: number | null | undefined) => value == null ? value : Math.round(value * factor * 1000) / 1000;
  return { ...exercise, weightUnit: unit, sets: exercise.sets.map(set => ({ ...set, segments: set.segments.map(segment => ({ ...segment, weight: convert(segment.weight) ?? null, leftWeight: convert(segment.leftWeight), rightWeight: convert(segment.rightWeight) })) })) };
}

export function shiftDate(date: string, offset: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

export function workoutInsights(sessions: WorkoutSession[], through: string) {
  const from = shiftDate(through, -27);
  const window = sessions.filter(session => session.date >= from && session.date <= through);
  const days = new Set(window.filter(session => session.exercises.some(exerciseHasResults)).map(session => session.date));
  const muscles: Record<string, number> = {};
  let sets = 0;
  let cardioMinutes = 0;
  for (const session of window) for (const exercise of session.exercises) {
    const count = completedWorkingSets(exercise);
    sets += count;
    if (count) muscles[exercise.primaryMuscle || 'Other'] = (muscles[exercise.primaryMuscle || 'Other'] ?? 0) + count;
    if (exercise.tracking === 'cardio') cardioMinutes += exercise.cardio?.minutes ?? 0;
  }
  const weeks = Array.from({ length: 4 }, (_, index) => {
    const start = shiftDate(from, index * 7);
    const end = shiftDate(start, 6);
    return { start, end, days: [...days].filter(day => day >= start && day <= end).length, sessions: window.filter(session => session.date >= start && session.date <= end && session.exercises.some(exerciseHasResults)).length };
  });
  return { from, through, trainingDays: days.size, sessions: window.filter(session => session.exercises.some(exerciseHasResults)).length, sets, cardioMinutes, muscles, weeks };
}
