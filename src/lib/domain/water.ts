// Keep persisted water amounts in liters; the interface uses US fluid ounces.
const LITERS_PER_US_FLUID_OUNCE = 0.0295735295625;

export function fluidOuncesToLiters(ounces: number): number {
  return ounces * LITERS_PER_US_FLUID_OUNCE;
}

export function litersToFluidOunces(liters: number): number {
  return liters / LITERS_PER_US_FLUID_OUNCE;
}

export function waterOunces(liters: number): number {
  return Number(litersToFluidOunces(liters).toFixed(2));
}
