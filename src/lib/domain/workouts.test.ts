import { describe, expect, it } from 'vitest';
import { newId, type ExerciseDefinition, type SessionExercise } from './types';
import { applyTargets, blankSet, completedWorkingSets, convertExerciseWeight, effectiveLocationId, exerciseHistory, newSession, newSessionExercise, repeatSession, routineFromSession, sameSetup, setIsReady, setPrescription, shiftDate, workoutInsights } from './workouts';
import { validateRecord } from './schema';

function definition(patch: Partial<ExerciseDefinition> = {}): ExerciseDefinition {
  return { id: newId(), name: 'Dumbbell curl', tracking: 'weight_reps', primaryMuscle: 'Biceps', secondaryMuscles: [], perHand: true, unilateral: false, ...patch };
}
function loggedExercise(patch: Partial<SessionExercise> = {}): SessionExercise {
  const exercise = newSessionExercise(definition(), 'lb');
  exercise.sets[0].segments[0] = { weight: 25, reps: 7.5 };
  return { ...exercise, ...patch };
}

describe('workout logging without a completion button', () => {
  it('keeps partial/null values and infers ready weighted sets', () => {
    const exercise = newSessionExercise(definition(), 'lb');
    const set = exercise.sets[0];
    expect(setIsReady(set, exercise)).toBe(false);
    set.segments[0].weight = 25;
    expect(setIsReady(set, exercise)).toBe(false);
    set.segments[0].reps = 7.5;
    expect(setIsReady(set, exercise)).toBe(true);
    expect(completedWorkingSets(exercise)).toBe(1);
    expect(validateRecord('workouts', { ...newSession('2026-10-16', null), exercises: [exercise] }).exercises[0].sets[1].segments[0].reps).toBeNull();
  });
  it('requires both sides without losing fractional reps or treating zero assistance as missing', () => {
    const exercise = newSessionExercise(definition({ tracking: 'assisted_reps', unilateral: true }), 'kg');
    const set = exercise.sets[0];
    set.segments[0] = { weight: 0, reps: null, rightReps: 6.5, leftReps: null };
    expect(setIsReady(set, exercise)).toBe(false);
    set.segments[0].leftReps = 6;
    expect(setIsReady(set, exercise)).toBe(true);
    set.warmup = true;
    expect(completedWorkingSets(exercise)).toBe(0);
  });
  it('counts a drop/rest-pause chain as one working set and excludes unfinished segments', () => {
    const exercise = loggedExercise();
    exercise.sets[0].segments.push({ link: 'pause', restSeconds: 15, weight: 25, reps: null });
    expect(completedWorkingSets(exercise)).toBe(0);
    exercise.sets[0].segments[1].reps = 2.5;
    exercise.sets[0].segments.push({ link: 'drop', weight: 20, reps: 4 });
    expect(completedWorkingSets(exercise)).toBe(1);
  });
  it('requires reps only for bodyweight tracking and duration for timed exercises', () => {
    const reps = newSessionExercise(definition({ tracking: 'reps' }), 'lb');
    reps.sets[0].segments[0].reps = 8;
    expect(setIsReady(reps.sets[0], reps)).toBe(true);
    const duration = newSessionExercise(definition({ tracking: 'duration' }), 'lb');
    duration.sets[0].durationMinutes = 1.25;
    expect(setIsReady(duration.sets[0], duration)).toBe(true);
  });
});

describe('prescriptions and immutable workout history', () => {
  it('reduces only empty planned sets, preserving partials, warmups, order, and recorded targets', () => {
    const exercise = loggedExercise();
    exercise.sets[0].targetReps = 8;
    exercise.sets[2].segments[0].weight = 20;
    exercise.sets.splice(1, 0, blankSet(exercise.targets, true));
    const before = structuredClone(exercise);
    const updated = applyTargets(exercise, { sets: 1, reps: 10, repsMax: 12 });
    expect(updated.sets.map(set => set.id)).toEqual([exercise.sets[0].id, exercise.sets[1].id, exercise.sets[3].id]);
    expect(updated.sets[0].targetReps).toBe(8);
    expect(updated.sets[2].segments[0].weight).toBe(20);
    expect(exercise).toEqual(before);
  });
  it('keeps explicitly unspecified targets unspecified after editing the exercise prescription', () => {
    const exercise = loggedExercise();
    const updated = applyTargets(exercise, { sets: 3, reps: 8, repsMax: 12 });
    expect(setPrescription(updated.sets[0], updated)).toEqual({ reps: null, repsMax: null });
    expect(setPrescription(updated.sets[1], updated)).toEqual({ reps: 8, repsMax: 12 });
  });
  it('repeats structure with fresh identifiers and no results, notes, or health links', () => {
    const session = newSession('2026-10-15', newId(), 'Back & biceps');
    const cardio = newSessionExercise(definition({ tracking: 'cardio' }), 'lb');
    cardio.cardio = { minutes: 25, distance: 2, speed: 4.8, incline: 4, distanceUnit: 'mi' };
    session.exercises = [loggedExercise({ equipment: 'Cable station 2', notes: 'Elbow sore' }), cardio];
    session.notes = 'Actual workout note'; session.healthWorkoutIds = [newId()]; session.status = 'complete';
    const before = structuredClone(session);
    const copy = repeatSession(session, '2026-10-16');
    expect(copy.id).not.toBe(session.id);
    expect(copy.date).toBe('2026-10-16'); expect(copy.status).toBe('active'); expect(copy.healthWorkoutIds).toEqual([]); expect(copy.notes).toBe('');
    expect(copy.exercises[0].equipment).toBe('Cable station 2'); expect(copy.exercises[0].notes).toBe('');
    expect(copy.exercises[0].sets[0].id).not.toBe(session.exercises[0].sets[0].id);
    expect(copy.exercises[0].sets.every(set => set.segments.every(segment => segment.weight === null && segment.reps === null))).toBe(true);
    expect(copy.exercises[1].cardio?.minutes).toBeNull(); expect(copy.exercises[1].cardio?.distanceUnit).toBe('mi');
    expect(validateRecord('workouts', copy)).toEqual(copy);
    expect(session).toEqual(before);
  });
  it('links duplicate exercise prescriptions to distinct routine entries', () => {
    const session = newSession('2026-10-15', null);
    const original = loggedExercise();
    session.exercises = [original, { ...structuredClone(original), id: newId() }];
    const routine = routineFromSession(session, 'Curl variations');
    const workout = repeatSession(routine, '2026-10-16');
    expect(workout.exercises[0].routineExerciseId).toBe(routine.exercises[0].id);
    expect(workout.exercises[1].routineExerciseId).toBe(routine.exercises[1].id);
    expect(workout.exercises[0].routineExerciseId).not.toBe(workout.exercises[1].routineExerciseId);
    const updated = routineFromSession(workout, 'Updated', routine.id);
    expect(updated.exercises.map(exercise => exercise.id)).toEqual(routine.exercises.map(exercise => exercise.id));
    expect(validateRecord('routines', updated)).toEqual(updated);
  });
  it('converts recorded weights without relabeling numbers, altering reps, or filling unknowns', () => {
    const exercise = loggedExercise({ unilateral: true });
    exercise.sets[0].segments[0] = { weight: null, reps: null, rightWeight: 25, leftWeight: null, rightReps: 7.5, leftReps: null };
    const converted = convertExerciseWeight(exercise, 'kg');
    expect(converted.sets[0].segments[0].rightWeight).toBeCloseTo(11.34, 2);
    expect(converted.sets[0].segments[0].leftWeight).toBeNull(); expect(converted.sets[0].segments[0].rightReps).toBe(7.5);
    expect(exercise.weightUnit).toBe('lb'); expect(exercise.sets[0].segments[0].rightWeight).toBe(25);
  });
});

describe('setup-aware history and basic insights', () => {
  it('distinguishes explicit no-location from inheriting the workout location', () => {
    const session = newSession('2026-10-16', newId());
    const exercise = loggedExercise({ locationId: null });
    expect(effectiveLocationId(exercise, session)).toBeNull();
    expect(effectiveLocationId({ ...exercise, locationId: undefined }, session)).toBe(session.locationId);
    expect(validateRecord('workouts', { ...session, exercises: [exercise] }).exercises[0].locationId).toBeNull();
  });
  it('finds earlier sessions on the same day, separates setups, and permits labeled unit differences', () => {
    const current = newSession('2026-10-16', newId()); current.startedAt = '2026-10-16T18:00:00Z';
    const exercise = loggedExercise({ equipment: 'Cable station 2' }); current.exercises = [exercise];
    const earlier = { ...structuredClone(current), id: newId(), startedAt: '2026-10-16T12:00:00Z', exercises: [{ ...structuredClone(exercise), id: newId(), weightUnit: 'kg' as const, equipment: ' cable   station 2 ' }] };
    const other = { ...structuredClone(earlier), id: newId(), date: '2026-10-15', locationId: newId() };
    expect(sameSetup(exercise, current, earlier.exercises[0], earlier)).toBe(true);
    const history = exerciseHistory([current, other, earlier], current, exercise);
    expect(history.map(item => [item.session.id, item.same])).toEqual([[earlier.id, true], [other.id, false]]);
  });
  it('counts distinct training days and working sets without multiplying drops or secondary muscles', () => {
    const first = newSession('2026-10-16', null); first.exercises = [loggedExercise({ secondaryMuscles: ['Back'] })];
    first.exercises[0].sets[0].segments.push({ weight: 15, reps: 4, link: 'drop' });
    const second = newSession('2026-10-16', null); second.exercises = [loggedExercise()];
    const draft = newSession('2026-10-15', null); draft.exercises = [newSessionExercise(definition(), 'lb')];
    const stats = workoutInsights([first, second, draft], '2026-10-16');
    expect(stats.trainingDays).toBe(1); expect(stats.sessions).toBe(2); expect(stats.sets).toBe(2);
    expect(stats.muscles).toEqual({ Biceps: 2 });
    expect(stats.weeks.at(-1)?.days).toBe(1);
    expect(shiftDate('2026-11-01', -1)).toBe('2026-10-31');
  });
});
