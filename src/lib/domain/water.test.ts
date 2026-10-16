import { describe, expect, it } from 'vitest';
import { fluidOuncesToLiters, litersToFluidOunces, waterOunces } from './water';

describe('water in US fluid ounces', () => {
  it('converts a known US cup and gallon without using imperial fluid ounces', () => {
    expect(fluidOuncesToLiters(8)).toBeCloseTo(0.2365882365, 10);
    expect(fluidOuncesToLiters(128)).toBeCloseTo(3.785411784, 10);
  });
  it('keeps existing liter totals and goals intact when shown in ounces', () => {
    expect(waterOunces(3)).toBe(101.44);
    expect(waterOunces(1.75)).toBe(59.17);
    expect(fluidOuncesToLiters(litersToFluidOunces(3))).toBeCloseTo(3, 12);
  });
  it('adds exact 8 and 16 ounce portions without rounding stored liters', () => {
    const total = fluidOuncesToLiters(8) + fluidOuncesToLiters(16);
    expect(waterOunces(total)).toBe(24);
    expect(waterOunces(0)).toBe(0);
    expect(waterOunces(fluidOuncesToLiters(12.5))).toBe(12.5);
  });
});
