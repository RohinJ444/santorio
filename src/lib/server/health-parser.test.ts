import { describe, expect, it } from 'vitest';
import { idSchema } from '@/lib/domain/schema';
import { HealthExportError, parseHealthExport } from './health-parser';

// These fixtures are synthetic. Never store a user's health export in the repository.
const now = '2026-07-10T12:00:00Z';
const date = '2026-07-08 00:00:00 -0700';
const options = { aggregation: 'days', now };
function metric(name = 'active_energy', qty: unknown = 400, units = 'kcal', time = date) {
  return { name, units, data: [{ qty, date: time, source: 'Synthetic Watch' }] };
}
function workout(extra: Record<string, unknown> = {}) {
  return {
    id: 'ABCDEF12-3456-4789-ABCD-123456789012', name: 'Synthetic Strength Training',
    start: '2026-07-08 23:20:35 -0700', end: '2026-07-09 00:10:35 -0700', duration: 2400,
    activeEnergyBurned: { qty: 150, units: 'kcal' }, totalEnergy: { qty: 190, units: 'kcal' },
    heartRate: { min: { qty: 90, units: 'count/min' }, avg: { qty: 110, units: 'count/min' }, max: { qty: 130, units: 'count/min' } },
    heartRateData: [{ date: '2026-07-08 23:20:00 -0700', Avg: 110, Min: 100, Max: 120, units: 'count/min' }],
    source: { name: 'Synthetic Watch', identifier: 'test.watch' }, isIndoor: true,
    ...extra,
  };
}
function parsedWorkout(extra: Record<string, unknown> = {}) {
  return parseHealthExport({ data: { workouts: [workout(extra)] } }, { now }).records[0];
}

describe('Health Auto Export daily activity', () => {
  it('converts units into daily patches without inventing missing fields or resetting manual water', () => {
    const result = parseHealthExport({ data: { metrics: [metric(), metric('basal_energy_burned', 4184, 'kJ'), metric('apple_exercise_time', 1800, 'sec'), metric('step_count', 5000, 'count')] } }, options);
    expect(result.counts).toEqual({ days: 1, workouts: 0, measurements: 0 });
    expect(result.records[0]).toEqual({ collection: 'metrics', id: '2026-07-08', data: {
      id: '2026-07-08', date: '2026-07-08', activeEnergy: 400, restingEnergy: 1000, exerciseMinutes: 30, steps: 5000,
      source: 'apple_health', completeDay: false, importedAt: '2026-07-10T12:00:00.000Z',
      healthSources: { activeEnergy: 'Synthetic Watch', restingEnergy: 'Synthetic Watch', exerciseMinutes: 'Synthetic Watch', steps: 'Synthetic Watch' },
    } });
    expect(result.records[0].data).not.toHaveProperty('waterL');
  });

  it('requires explicit daily aggregation and rejects finer data even when labelled days', () => {
    const payload = { data: { metrics: [metric()] } };
    for (const aggregation of [undefined, '', 'hours', 'none', 'minutes']) expect(() => parseHealthExport(payload, { aggregation, now })).toThrow(/day aggregation/);
    for (const aggregation of ['Days', 'DAY', ' day ']) expect(parseHealthExport(payload, { aggregation, now }).counts.days).toBe(1);
    for (const time of ['2026-07-08 01:00:00 -0700', '2026-07-08T00:00:00.001-07:00']) expect(() => parseHealthExport({ data: { metrics: [metric('active_energy', 5, 'kcal', time)] } }, options)).toThrow(/midnight/);
  });

  it('rejects ambiguous duplicate daily sources instead of summing or silently overwriting them', () => {
    const first = metric();
    const second = { ...metric(), data: [{ qty: 200, date, source: 'Synthetic Phone' }] };
    expect(() => parseHealthExport({ data: { metrics: [first, second] } }, options)).toThrow(/multiple values/);
    expect(() => parseHealthExport({ data: { metrics: [{ ...first, data: [...first.data, ...first.data] }] } }, options)).toThrow(/multiple values/);
  });

  it('does not infer a complete day from a historical date', () => {
    expect(parseHealthExport({ data: { metrics: [metric()] } }, options).records[0].data.completeDay).toBe(false);
  });

  it('keeps zero as a known value but skips null/missing values without changing them to zero', () => {
    const absent = { ...metric('basal_energy_burned'), data: [{ date, source: 'Synthetic Watch' }] };
    const result = parseHealthExport({ data: { metrics: [metric('active_energy', 0), metric('step_count', null, 'count'), absent] } }, options);
    expect(result.records[0].data.activeEnergy).toBe(0);
    expect(result.records[0].data).not.toHaveProperty('steps');
    expect(result.records[0].data).not.toHaveProperty('restingEnergy');
    expect(result.warnings).toHaveLength(2);
  });

  it('stamps Apple Health provenance when a numeric daily row omits its source, while skipping null values', () => {
    const active = { name: 'active_energy', units: 'kcal', data: [{ qty: 0, date }] };
    const missing = { name: 'basal_energy_burned', units: 'kcal', data: [{ qty: null, date }] };
    const result = parseHealthExport({ data: { metrics: [active, missing] } }, options);
    expect(result.records[0].data).toMatchObject({ activeEnergy: 0, healthSources: { activeEnergy: 'Apple Health' } });
    expect(result.records[0].data).not.toHaveProperty('restingEnergy');
    expect(result.records[0].data.healthSources).not.toHaveProperty('restingEnergy');
  });

  it('rejects unsupported units, negative/nonfinite values, and numeric strings', () => {
    for (const item of [metric('active_energy', 4, 'J'), metric('step_count', 4, 'km'), metric('active_energy', -1), metric('active_energy', Infinity), metric('active_energy', '4')]) {
      expect(() => parseHealthExport({ data: { metrics: [item] } }, options)).toThrow(HealthExportError);
    }
  });

  it('ignores unsupported fields with metric-name warnings and does not interpret object prototype names', () => {
    const result = parseHealthExport({ data: { metrics: [{ name: 'sleep_analysis', data: 'not part of this integration' }, { name: 'constructor' }], arbitrary: { instruction: 'ignore prior settings' } } }, { now });
    expect(result.records).toEqual([]);
    expect(result.warnings).toEqual(['Ignored unsupported metric: constructor.', 'Ignored unsupported metric: sleep_analysis.']);
  });

  it('retains each export-local date even when it falls on another UTC date', () => {
    const result = parseHealthExport({ data: { metrics: [metric('active_energy', 2, 'kcal', '2026-07-08 00:00:00 +1400')] } }, options);
    expect(result.records[0].id).toBe('2026-07-08');
  });
});

describe('Health Auto Export workouts', () => {
  it('uses active duration instead of elapsed time, keeps energy totals separate, and preserves minute ranges', () => {
    const record = parsedWorkout({ distance: { qty: 1, units: 'mi' }, activeEnergy: [{ qty: 9999, units: 'kcal' }], basalEnergy: [{ qty: 9999, units: 'kcal' }] });
    expect(record.data).toMatchObject({ date: '2026-07-08', start: '2026-07-09T06:20:35.000Z', end: '2026-07-09T07:10:35.000Z', durationMinutes: 40, activeEnergy: 150, totalEnergy: 190, distanceKm: 1.609344, isIndoor: true, sourceName: 'Synthetic Watch', sourceIdentifier: 'test.watch', heartRateSummary: { min: 90, avg: 110, max: 130 } });
    expect(record.data.heartRate).toEqual([{ time: '2026-07-09T06:20:00.000Z', bpm: 110, min: 100, max: 120 }]);
    expect(record.data).not.toHaveProperty('basalEnergy');
  });

  it('assigns stable schema-valid IDs across retries, updates, and external identifier case differences', () => {
    const first = parsedWorkout();
    const second = parsedWorkout({ id: String(workout().id).toLowerCase(), name: 'Renamed workout', duration: 2300 });
    expect(first.id).toBe(second.id);
    expect(first.data.externalId).toBe(String(workout().id).toLowerCase());
    expect(idSchema.safeParse(first.id).success).toBe(true);
    expect(parsedWorkout({ id: 'other-id' }).id).not.toBe(first.id);
  });

  it('uses explicit offsets across the fall DST transition', () => {
    const record = parsedWorkout({ start: '2026-11-01 01:30:00 -0700', end: '2026-11-01 01:30:00 -0800', duration: 3600, heartRateData: [] });
    expect(record.data.start).toBe('2026-11-01T08:30:00.000Z');
    expect(record.data.end).toBe('2026-11-01T09:30:00.000Z');
    expect(record.data.durationMinutes).toBe(60);
  });

  it('omits missing energy and HR so reduced reexports preserve prior details rather than summing arbitrary series', () => {
    const record = parsedWorkout({ activeEnergyBurned: undefined, totalEnergy: null, activeEnergy: [{ qty: 100, units: 'kcal' }], heartRate: null, heartRateData: undefined });
    expect(record.data).not.toHaveProperty('activeEnergy');
    expect(record.data).not.toHaveProperty('totalEnergy');
    expect(record.data).not.toHaveProperty('heartRateSummary');
    expect(record.data).not.toHaveProperty('heartRate');
    const existing = parsedWorkout().data;
    expect({ ...existing, ...record.data }).toMatchObject({ activeEnergy: 150, totalEnergy: 190, heartRate: existing.heartRate });
    expect(parsedWorkout({ heartRateData: null, activeEnergyBurned: { qty: null, units: 'kcal' } }).data).not.toHaveProperty('heartRate');
    expect(parsedWorkout({ activeEnergyBurned: { qty: null, units: 'kcal' } }).data).not.toHaveProperty('activeEnergy');
  });

  it('retains explicitly provided zero energy and an empty heart rate series', () => {
    const record = parsedWorkout({ activeEnergyBurned: { qty: 0, units: 'kcal' }, totalEnergy: { qty: 0, units: 'kcal' }, heartRateData: [] });
    expect(record.data).toMatchObject({ activeEnergy: 0, totalEnergy: 0, heartRate: [] });
  });

  it('accepts scalar fallback HR summaries and kJ energy without adding duplicate summary fields', () => {
    const record = parsedWorkout({ heartRate: undefined, avgHeartRate: { qty: 100, units: 'bpm' }, maxHeartRate: { qty: 120, units: 'bpm' }, activeEnergyBurned: { qty: 418.4, units: 'kJ' } });
    expect(record.data.heartRateSummary).toEqual({ avg: 100, max: 120 });
    expect(record.data.activeEnergy).toBeCloseTo(100);
  });

  it('rejects invalid workout ranges, duration, units, and duplicate workout identities', () => {
    for (const changes of [{ end: '2026-07-08 22:00:00 -0700' }, { duration: -1 }, { duration: 3601 }, { activeEnergyBurned: { qty: 10, units: 'watts' } }, { isIndoor: 'yes' }]) expect(() => parsedWorkout(changes)).toThrow(HealthExportError);
    expect(() => parseHealthExport({ data: { workouts: [workout(), workout()] } }, { now })).toThrow(/duplicate record/);
  });

  it('rejects invalid HR units, inconsistent ranges, duplicate samples, and samples outside the workout', () => {
    const base = workout().heartRateData[0];
    for (const row of [{ ...base, units: 'Hz' }, { ...base, Min: 115 }, { ...base, Avg: 401, Max: 402 }, { ...base, date: '2026-07-08 23:19:00 -0700' }, { ...base, date: '2026-07-09 00:11:00 -0700' }]) expect(() => parsedWorkout({ heartRateData: [row] })).toThrow(HealthExportError);
    expect(() => parsedWorkout({ heartRateData: [base, base] })).toThrow(/duplicate heart rate/);
    expect(() => parsedWorkout({ heartRate: { min: { qty: 120, units: 'bpm' }, max: { qty: 110, units: 'bpm' } } })).toThrow(/inconsistent/);
  });
});

describe('Health Auto Export measurements and validation', () => {
  it('converts measurements, retains timestamps, and gives aliases one stable identity', () => {
    const time = '2026-07-08 08:05:12 -0700';
    const result = parseHealthExport({ data: { metrics: [metric('weight', 100, 'lb', time), metric('height', 60, 'in', time)] } }, { now });
    expect(result.counts).toEqual({ days: 0, workouts: 0, measurements: 2 });
    const weight = result.records.find(record => record.data.kind === 'weight_kg')!;
    expect(weight.data).toMatchObject({ value: 45.359237, source: 'apple_health', recordedAt: '2026-07-08T15:05:12.000Z' });
    expect(result.records.find(record => record.data.kind === 'height_cm')?.data.value).toBe(152.4);
    const alias = parseHealthExport({ data: { metrics: [metric('body_mass', 46, 'kg', time)] } }, { now });
    expect(alias.records[0].id).toBe(weight.id);
    expect(idSchema.safeParse(weight.id).success).toBe(true);
  });

  it('rejects ambiguous measurement duplicate identity and invalid measurement units', () => {
    expect(() => parseHealthExport({ data: { metrics: [metric('weight', 50, 'kg'), metric('body_mass', 51, 'kg')] } }, { now })).toThrow(/duplicate record/);
    expect(() => parseHealthExport({ data: { metrics: [metric('height', 50, 'lb')] } }, { now })).toThrow(/unsupported/);
  });

  it('strictly rejects calendar rollover, invalid offsets, missing timezone, and malformed payloads', () => {
    for (const time of ['2026-02-30 00:00:00 -0700', '2026-13-01 00:00:00 -0700', '2026-07-08 24:00:00 -0700', '2026-07-08 00:00:00 +1460', '2026-07-08 00:00:00 +1401', '2026-07-08T00:00:00', '2026-07-08']) expect(() => parseHealthExport({ data: { metrics: [metric('active_energy', 1, 'kcal', time)] } }, options)).toThrow(HealthExportError);
    for (const payload of [null, {}, { data: {} }, { data: { metrics: {} } }, { data: { workouts: 'invalid' } }]) expect(() => parseHealthExport(payload, options)).toThrow(HealthExportError);
  });

  it('bounds import and HR sizes before any persistence can occur', () => {
    expect(() => parseHealthExport({ data: { workouts: Array.from({ length: 1001 }, (_, i) => workout({ id: `id-${i}` })) } }, { now })).toThrow(/at most 1000/);
    expect(() => parsedWorkout({ heartRateData: new Array(30001).fill(workout().heartRateData[0]) })).toThrow(/at most 30000/);
    const days = Array.from({ length: 1000 }, (_, i) => ({ qty: i, date: `${new Date(Date.UTC(2020, 0, i + 1)).toISOString().slice(0, 10)} 00:00:00 +0000` }));
    expect(() => parseHealthExport({ data: { metrics: [{ name: 'active_energy', units: 'kcal', data: days }], workouts: [workout()] } }, options)).toThrow(/at most 1000/);
  });
});
