import { FOODS } from "./mock";
import { parseIso } from "./dates";
import type { Activity, FoodItem, Nutrients, Profile } from "./types";

export const ACTIVITY: Record<Activity, { factor: number; label: string }> = {
  sedentary: { factor: 1.2, label: "Desk" },
  light: { factor: 1.375, label: "Light" },
  moderate: { factor: 1.55, label: "Active" },
  very: { factor: 1.725, label: "Very" },
};

export function ageOn(birthday: string, today: string) {
  const b = parseIso(birthday);
  const t = parseIso(today);
  let age = t.getFullYear() - b.getFullYear();
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) age--;
  return age;
}

/** Mifflin–St Jeor. With sex unset, uses the midpoint of the two constants. */
export function bmr(profile: Profile, weightLb: number, today: string) {
  const kg = weightLb * 0.45359237;
  const cm = profile.heightIn * 2.54;
  const age = ageOn(profile.birthday, today);
  const s = profile.sex === "male" ? 5 : profile.sex === "female" ? -161 : -78;
  return 10 * kg + 6.25 * cm - 5 * age + s;
}

export function tdee(profile: Profile, weightLb: number, today: string) {
  return bmr(profile, weightLb, today) * ACTIVITY[profile.activity].factor;
}

export const ZERO: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

export function scale(n: Nutrients, k: number): Nutrients {
  return { kcal: n.kcal * k, protein: n.protein * k, carbs: n.carbs * k, fat: n.fat * k };
}

export function add(a: Nutrients, b: Nutrients): Nutrients {
  return { kcal: a.kcal + b.kcal, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat };
}

export function foodNutrients(foodId: string, grams: number) {
  const f = FOODS[foodId];
  return f ? scale(f.per100g, grams / 100) : ZERO;
}

export function itemNutrients(item: FoodItem): Nutrients {
  if (item.kind === "food") return foodNutrients(item.foodId, item.grams);
  return item.ingredients.reduce((acc, i) => add(acc, foodNutrients(i.foodId, i.grams * item.portion)), ZERO);
}

export const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");
