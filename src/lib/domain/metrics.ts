import type { DayMetrics } from './types';

const HEALTH_FIELDS = ['steps', 'activeEnergy', 'restingEnergy', 'exerciseMinutes'] as const;

/**
 * Health Auto Export rewrites a day's metrics every hour, while the app writes water (and
 * manual values before an import exists) into the same record. When an import lands between
 * reading the day and saving it, keep the imported fields and reapply the local edit rather than
 * asking which whole record to keep. Two manual edits still conflict (null).
 */
export function rebaseOnImport(draft: DayMetrics, current: DayMetrics): DayMetrics | null {
  const imported = HEALTH_FIELDS.filter(field => current.healthSources ? Object.hasOwn(current.healthSources, field) : current.source === 'apple_health');
  if (!imported.length) return null;
  const owned: (keyof DayMetrics)[] = [...imported, 'source', 'importedAt', 'completeDay', 'healthSources'];
  return { ...draft, ...Object.fromEntries(owned.filter(key => current[key] !== undefined).map(key => [key, current[key]])) };
}
