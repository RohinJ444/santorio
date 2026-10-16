import { describe, expect, it } from 'vitest';
import { rebaseOnImport } from './metrics';
import type { DayMetrics } from './types';

const blank: DayMetrics = { id: '2026-10-16', date: '2026-10-16', steps: null, waterL: 0, activeEnergy: null, restingEnergy: null, exerciseMinutes: null, source: 'manual' };
const imported = (steps: number, activeEnergy: number, importedAt: string): DayMetrics => ({
  ...blank, steps, activeEnergy, exerciseMinutes: 5, source: 'apple_health', importedAt, completeDay: false,
  healthSources: { steps: 'Apple Health', activeEnergy: 'Apple Health', exerciseMinutes: 'Apple Health' },
});

describe('water saved over an hourly Health import', () => {
  it('keeps the newer imported values and the local water', () => {
    const draft = { ...imported(3000, 200, '2026-10-16T09:00:00.000Z'), waterL: 0.47 };
    const current = imported(3522, 347, '2026-10-16T10:00:00.000Z');
    expect(rebaseOnImport(draft, current)).toEqual({ ...current, waterL: 0.47 });
  });

  it('merges water logged before the day had any import', () => {
    const draft = { ...blank, waterL: 0.24 };
    const current = imported(800, 40, '2026-10-16T08:00:00.000Z');
    expect(rebaseOnImport(draft, current)).toEqual({ ...current, waterL: 0.24 });
  });

  it('keeps manual values the import does not report', () => {
    const draft = { ...blank, restingEnergy: 1700 };
    expect(rebaseOnImport(draft, imported(800, 40, '2026-10-16T08:00:00.000Z'))?.restingEnergy).toBe(1700);
  });

  it('still asks when two manual edits conflict', () => {
    expect(rebaseOnImport({ ...blank, waterL: 1 }, { ...blank, waterL: 2 })).toBeNull();
  });
});
