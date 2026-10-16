import { describe, expect, it } from 'vitest';
import { nutrientTargets } from './targets';

describe('default nutrient targets', () => {
  it('uses DRIs by sex and age, limits as maximums, and splits macros from energy', () => {
    const t = nutrientTargets({ sex: 'male', age: 22, weightKg: 75, energy: 2700, proteinG: 150 });
    expect(t.vitamin_c).toEqual({ amount: 90, kind: 'min' });
    expect(t.magnesium.amount).toBe(400);
    expect(t.sodium).toEqual({ amount: 2300, kind: 'max' });
    expect(t.fat.amount).toBeCloseTo(90);
    expect(t.carbs.amount).toBeCloseTo((2700 - 600 - 810) / 4);
    expect(t.leucine.amount).toBeCloseTo(2.925);
  });

  it('invents no sex-specific target when sex is unset, and no macro split without energy', () => {
    const t = nutrientTargets({ sex: null, age: 40, weightKg: null, energy: null, proteinG: 150 });
    expect(t.iron).toBeUndefined();
    expect(t.carbs).toBeUndefined();
    expect(t.protein.amount).toBe(150);
  });
});
