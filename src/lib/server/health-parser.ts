import { createHash } from 'node:crypto';

type ObjectValue = Record<string, unknown>;
type ImportCollection = 'metrics' | 'measurements' | 'healthWorkouts';
export type HealthImportRecord = { collection: ImportCollection; id: string; data: ObjectValue };
export type HealthExportResult = {
  records: HealthImportRecord[];
  warnings: string[];
  counts: { days: number; workouts: number; measurements: number };
};

export class HealthExportError extends Error {
  constructor(message: string) { super(message); this.name = 'HealthExportError'; }
}

const dailyFields = {
  active_energy: { field: 'activeEnergy', kind: 'energy' },
  basal_energy_burned: { field: 'restingEnergy', kind: 'energy' },
  apple_exercise_time: { field: 'exerciseMinutes', kind: 'minutes' },
  step_count: { field: 'steps', kind: 'count' },
} as const;
const measurementFields = {
  weight: { field: 'weight_kg', kind: 'weight' },
  body_mass: { field: 'weight_kg', kind: 'weight' },
  height: { field: 'height_cm', kind: 'height' },
} as const;
type QuantityKind = 'energy' | 'minutes' | 'count' | 'weight' | 'height' | 'distance' | 'heartRate';
const unitFactors: Record<QuantityKind, Record<string, number>> = {
  energy: { kcal: 1, kj: 1 / 4.184 },
  minutes: { min: 1, minutes: 1, s: 1 / 60, sec: 1 / 60, seconds: 1 / 60 },
  count: { count: 1, counts: 1 },
  weight: { kg: 1, lb: 0.45359237, lbs: 0.45359237 },
  height: { cm: 1, m: 100, in: 2.54 },
  distance: { km: 1, m: 0.001, mi: 1.609344 },
  heartRate: { 'count/min': 1, bpm: 1 },
};

function fail(message: string): never { throw new HealthExportError(message); }
function object(value: unknown, label: string): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
  return value as ObjectValue;
}
function array(value: unknown, label: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) fail(`${label} must be an array with at most ${max} items.`);
  return value;
}
function text(value: unknown, label: string, max = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(`${label} must be nonempty text with at most ${max} characters.`);
  return value.trim();
}
function optionalText(value: unknown, label: string, max = 200): string | undefined {
  return value === undefined || value === null ? undefined : text(value, label, max);
}
function number(value: unknown, label: string, max = 1e9): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) fail(`${label} must be a finite nonnegative number no greater than ${max}.`);
  return value;
}
function quantity(value: unknown, units: unknown, kind: QuantityKind, label: string): number | null {
  const unit = text(units, `${label} units`, 30).toLowerCase();
  const factor = unitFactors[kind][unit];
  if (factor === undefined) fail(`${label} uses unsupported ${kind} units.`);
  if (value === undefined || value === null) return null;
  const result = number(value, label) * factor;
  if (!Number.isFinite(result) || result > 1e9) fail(`${label} is outside the supported range.`);
  if (kind === 'heartRate' && (result <= 0 || result > 400)) fail(`${label} must be between 0 and 400 bpm.`);
  if ((kind === 'weight' || kind === 'height') && (result <= 0 || result > 10000)) fail(`${label} is outside the supported measurement range.`);
  return result;
}
function scalarQuantity(value: unknown, kind: QuantityKind, label: string): number | null {
  if (value === undefined || value === null) return null;
  const entry = object(value, label);
  return quantity(entry.qty, entry.units, kind, label);
}

/** Read the explicit offset, retaining the export's calendar day across UTC boundaries and DST. */
function timestamp(value: unknown, label: string) {
  const raw = text(value, label, 60);
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2}):(\d{2})(\.\d{1,3})? ?(Z|[+-]\d{2}:?\d{2})$/.exec(raw);
  if (!match) fail(`${label} must include a date, time, and explicit UTC offset.`);
  const [, date, hour, minute, second, fraction = '', zone] = match;
  const midnight = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(midnight) || new Date(midnight).toISOString().slice(0, 10) !== date || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) fail(`${label} is not a valid date and time.`);
  const compactZone = zone.replace(':', '');
  if (zone !== 'Z' && (Number(compactZone.slice(1, 3)) > 14 || Number(compactZone.slice(3)) > 59 || (Number(compactZone.slice(1, 3)) === 14 && Number(compactZone.slice(3)) !== 0))) fail(`${label} has an invalid UTC offset.`);
  const offset = zone === 'Z' ? 'Z' : `${compactZone.slice(0, 3)}:${compactZone.slice(3)}`;
  const millis = Date.parse(`${date}T${hour}:${minute}:${second}${fraction}${offset}`);
  if (!Number.isFinite(millis)) fail(`${label} is not a valid timestamp.`);
  return { date, iso: new Date(millis).toISOString(), millis, midnight: hour === '00' && minute === '00' && second === '00' && Number(fraction || 0) === 0 };
}

/** Stable UUID identity allows retries to update the same record without storing source identifiers as record IDs. */
function stableId(parts: string[]): string {
  const bytes = createHash('sha256').update(JSON.stringify(['health-auto-export-v2', ...parts])).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function workoutRecord(value: unknown, importedAt: string): HealthImportRecord {
  const item = object(value, 'Workout');
  const externalId = text(item.id, 'Workout id').toLowerCase();
  const id = stableId(['workout', externalId]);
  const start = timestamp(item.start, 'Workout start');
  const end = timestamp(item.end, 'Workout end');
  if (end.millis < start.millis) fail('Workout end must not be before its start.');
  const durationMinutes = number(item.duration, 'Workout duration', 31 * 24 * 60 * 60) / 60;
  if (durationMinutes * 60000 > end.millis - start.millis + 1000) fail('Workout active duration cannot exceed its elapsed time.');
  const data: ObjectValue = {
    id, externalId, date: start.date, name: text(item.name, 'Workout name'),
    start: start.iso, end: end.iso, durationMinutes, importedAt,
  };
  // A reexport can disable optional details. Omission preserves previously imported values.
  const activeEnergy = scalarQuantity(item.activeEnergyBurned, 'energy', 'Workout active energy');
  const totalEnergy = scalarQuantity(item.totalEnergy, 'energy', 'Workout total energy');
  if (activeEnergy !== null) data.activeEnergy = activeEnergy;
  if (totalEnergy !== null) data.totalEnergy = totalEnergy;
  if (item.source !== undefined && item.source !== null) {
    const source = typeof item.source === 'string' ? { name: item.source } : object(item.source, 'Workout source');
    const sourceName = optionalText(source.name, 'Workout source name');
    const sourceIdentifier = optionalText(source.identifier, 'Workout source identifier', 500);
    if (sourceName) data.sourceName = sourceName;
    if (sourceIdentifier) data.sourceIdentifier = sourceIdentifier;
  }
  if (item.isIndoor !== undefined && item.isIndoor !== null) {
    if (typeof item.isIndoor !== 'boolean') fail('Workout isIndoor must be a boolean.');
    data.isIndoor = item.isIndoor;
  }
  const distanceKm = scalarQuantity(item.distance, 'distance', 'Workout distance');
  if (distanceKm !== null) data.distanceKm = distanceKm;
  const rawSummary = item.heartRate === undefined || item.heartRate === null ? {} : object(item.heartRate, 'Workout heart rate summary');
  const summary: Record<string, number> = {};
  for (const key of ['min', 'avg', 'max'] as const) {
    const value = scalarQuantity(rawSummary[key] ?? item[`${key}HeartRate`], 'heartRate', `Workout ${key} heart rate`);
    if (value !== null) summary[key] = value;
  }
  validateHeartRateOrder(summary.min, summary.avg, summary.max);
  if (Object.keys(summary).length) data.heartRateSummary = summary;
  const seenTimes = new Set<string>();
  if (item.heartRateData !== undefined && item.heartRateData !== null) data.heartRate = array(item.heartRateData, 'Workout heart rate data', 30000).flatMap((raw) => {
    const row = object(raw, 'Heart rate sample');
    const time = timestamp(row.date, 'Heart rate sample time');
    // The exporter rounds minute bucket labels down, including the first partial minute.
    if (time.millis < start.millis - 60000 || time.millis > end.millis) fail('Heart rate sample falls outside the workout.');
    if (seenTimes.has(time.iso)) fail('Workout contains duplicate heart rate sample times.');
    seenTimes.add(time.iso);
    const bpm = quantity(row.Avg ?? row.qty, row.units, 'heartRate', 'Heart rate sample');
    const min = quantity(row.Min, row.units, 'heartRate', 'Heart rate minimum');
    const max = quantity(row.Max, row.units, 'heartRate', 'Heart rate maximum');
    if (bpm === null) {
      if (min !== null || max !== null) fail('Heart rate sample requires an average when a range is present.');
      return [];
    }
    validateHeartRateOrder(min ?? undefined, bpm, max ?? undefined);
    return [{ time: time.iso, bpm, ...(min === null ? {} : { min }), ...(max === null ? {} : { max }) }];
  }).sort((a, b) => a.time.localeCompare(b.time));
  return { collection: 'healthWorkouts', id, data };
}

function validateHeartRateOrder(min: number | undefined, avg: number | undefined, max: number | undefined) {
  if ((min !== undefined && max !== undefined && min > max) || (min !== undefined && avg !== undefined && min > avg) || (avg !== undefined && max !== undefined && avg > max)) fail('Heart rate minimum, average, and maximum are inconsistent.');
}

/** Normalize only the supported export fields. Unrecognized metrics never become executable instructions or stored JSON. */
export function parseHealthExport(input: unknown, options: { aggregation?: string; now?: string } = {}): HealthExportResult {
  const payload = object(object(input, 'Health export').data, 'Health export data');
  if (payload.metrics === undefined && payload.workouts === undefined) fail('Health export data must contain metrics or workouts.');
  const importedAt = timestamp(options.now ?? new Date().toISOString(), 'Import time').iso;
  const warnings = new Set<string>();
  const days = new Map<string, ObjectValue>();
  const records: HealthImportRecord[] = [];
  const seenMetricDays = new Set<string>();
  const seenRecords = new Set<string>();
  const addRecord = (record: HealthImportRecord) => {
    const identity = `${record.collection}:${record.id}`;
    if (seenRecords.has(identity)) fail('Health export contains duplicate record identities.');
    seenRecords.add(identity);
    records.push(record);
    if (records.length + days.size > 1000) fail('Health export may contain at most 1000 records.');
  };
  for (const raw of array(payload.metrics ?? [], 'Health metrics', 300)) {
    const metric = object(raw, 'Health metric');
    const metricName = text(metric.name, 'Health metric name', 100);
    const daily = Object.hasOwn(dailyFields, metricName) ? dailyFields[metricName as keyof typeof dailyFields] : undefined;
    const measurement = Object.hasOwn(measurementFields, metricName) ? measurementFields[metricName as keyof typeof measurementFields] : undefined;
    if (!daily && !measurement) {
      warnings.add(`Ignored unsupported metric: ${metricName}.`);
      continue;
    }
    if (daily && !/^days?$/i.test(options.aggregation?.trim() ?? '')) fail('Daily activity requires explicit day aggregation. Set Summarize Data on and Time Grouping to Days.');
    for (const rawRow of array(metric.data, `Metric ${metricName} data`, 1000)) {
      const row = object(rawRow, `Metric ${metricName} row`);
      const time = timestamp(row.date, `Metric ${metricName} date`);
      const value = quantity(row.qty, metric.units, (daily ?? measurement)!.kind, `Metric ${metricName}`);
      const source = optionalText(row.source, `Metric ${metricName} source`, 500);
      if (daily) {
        if (!time.midnight) fail('Daily activity rows must be midnight daily summaries.');
        const identity = `${time.date}:${daily.field}`;
        if (seenMetricDays.has(identity)) fail('Daily activity contains multiple values for one metric and day. Export a single merged daily summary rather than individual sources.');
        seenMetricDays.add(identity);
        if (value === null) { warnings.add(`Skipped missing value for metric: ${metricName}.`); continue; }
        let day = days.get(time.date);
        if (!day) {
          day = { id: time.date, date: time.date, source: 'apple_health', importedAt, completeDay: false, healthSources: {} };
          days.set(time.date, day);
          if (records.length + days.size > 1000) fail('Health export may contain at most 1000 records.');
        }
        day[daily.field] = value;
        (day.healthSources as Record<string, string>)[daily.field] = source ?? 'Apple Health';
      } else {
        if (value === null) { warnings.add(`Skipped missing value for metric: ${metricName}.`); continue; }
        const id = stableId(['measurement', measurement!.field, time.iso, source ?? '']);
        addRecord({ collection: 'measurements', id, data: { id, date: time.date, kind: measurement!.field, value, source: 'apple_health', recordedAt: time.iso } });
      }
    }
  }
  for (const raw of array(payload.workouts ?? [], 'Health workouts', 1000)) addRecord(workoutRecord(raw, importedAt));
  for (const [id, data] of days) records.push({ collection: 'metrics', id, data });
  records.sort((a, b) => a.collection.localeCompare(b.collection) || a.id.localeCompare(b.id));
  return {
    records, warnings: [...warnings].sort(),
    counts: { days: days.size, workouts: records.filter(record => record.collection === 'healthWorkouts').length, measurements: records.filter(record => record.collection === 'measurements').length },
  };
}
