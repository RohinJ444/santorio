import type { ProfileRecord } from './types';

/**
 * Default daily nutrient targets, the way Cronometer seeds them: US Dietary Reference
 * Intakes (RDA or AI) by sex and age, upper limits where a nutrient is something to stay
 * under, and macros split from the day's energy target. Without a sex coefficient no
 * sex-specific target is invented; those nutrients show without a target.
 * Sources: NIH ODS DRI tables; NASEM 2019 (sodium, potassium); FDA (caffeine).
 */
export type Target = { amount: number; kind: 'min' | 'max' };
export type Targets = Record<string, Target>;

type Row = [key: string, male: number, female: number, kind?: 'max'];
type Band = 'young' | 'adult' | 'older';

// 19–50 values; per-band overrides below. Units match the nutrient catalog.
const DRI: Row[] = [
  ['vitamin_a', 900, 700], ['vitamin_c', 90, 75], ['vitamin_d', 15, 15], ['vitamin_e', 15, 15], ['vitamin_k', 120, 90],
  ['thiamin', 1.2, 1.1], ['riboflavin', 1.3, 1.1], ['niacin', 16, 14], ['pantothenic_acid', 5, 5], ['vitamin_b6', 1.3, 1.3],
  ['biotin', 30, 30], ['folate', 400, 400], ['vitamin_b12', 2.4, 2.4], ['choline', 550, 425],
  ['calcium', 1000, 1000], ['chromium', 35, 25], ['copper', 0.9, 0.9], ['fluoride', 4, 3], ['iodine', 150, 150], ['iron', 8, 18],
  ['magnesium', 400, 310], ['manganese', 2.3, 1.8], ['molybdenum', 45, 45], ['phosphorus', 700, 700], ['potassium', 3400, 2600],
  ['selenium', 55, 55], ['zinc', 11, 8], ['fiber', 38, 25], ['ala', 1.6, 1.1], ['omega_3', 1.6, 1.1], ['omega_6', 17, 12],
  ['sodium', 2300, 2300, 'max'], ['caffeine', 400, 400, 'max'],
];
const BANDS: Record<Band, Partial<Record<string, [number, number]>>> = {
  young: {},
  adult: { magnesium: [420, 320] },
  older: { magnesium: [420, 320], vitamin_b6: [1.7, 1.5], calcium: [1000, 1200], chromium: [30, 20], iron: [8, 8], fiber: [30, 21], omega_6: [14, 11] },
};
// Essential amino acids, mg per kg of body weight per day (WHO/FAO/UNU 2007), as grams.
const AMINO_MG_PER_KG: Record<string, number> = { histidine: 10, isoleucine: 20, leucine: 39, lysine: 30, methionine: 15, phenylalanine: 25, threonine: 15, tryptophan: 4, valine: 26 };

export function nutrientTargets({ sex, age, weightKg, energy, proteinG }: { sex: ProfileRecord['sex']; age: number | null; weightKg: number | null; energy: number | null; proteinG: number }): Targets {
  const targets: Targets = { protein: { amount: proteinG, kind: 'min' } };
  if (sex) {
    const band: Band = age === null || age < 31 ? 'young' : age < 51 ? 'adult' : 'older';
    const pick = (male: number, female: number) => (sex === 'male' ? male : female);
    for (const [key, male, female, kind] of DRI) {
      const override = BANDS[band][key];
      targets[key] = { amount: override ? pick(...override) : pick(male, female), kind: kind ?? 'min' };
    }
    if (age !== null && age > 70) { targets.vitamin_d = { amount: 20, kind: 'min' }; if (sex === 'male') targets.calcium = { amount: 1200, kind: 'min' }; }
  }
  if (weightKg) for (const [key, mg] of Object.entries(AMINO_MG_PER_KG)) targets[key] = { amount: (mg * weightKg) / 1000, kind: 'min' };
  if (energy !== null && energy > 0) {
    targets.energy = { amount: energy, kind: 'min' };
    // Fat takes 30% of energy; carbohydrate takes what protein and fat leave (never below the 130 g RDA).
    const fat = (energy * 0.3) / 9;
    targets.fat = { amount: fat, kind: 'min' };
    targets.carbs = { amount: Math.max(130, (energy - proteinG * 4 - fat * 9) / 4), kind: 'min' };
    targets.saturated_fat = { amount: (energy * 0.1) / 9, kind: 'max' };
    targets.added_sugar = { amount: (energy * 0.1) / 4, kind: 'max' };
  }
  return targets;
}
