import type { DiaryEntry, FoodRecord, NutrientValue, PrepBatch, RecipeIngredient } from './types';
import { newId } from './types';

export type NutrientDefinition = { key: string; label: string; unit: string; group: string };
const group = (name: string, entries: [string, string, string][]): NutrientDefinition[] => entries.map(([key, label, unit]) => ({ key, label, unit, group: name }));
/** Canonical nutrient identities. New nutrients remain possible without a schema migration. */
export const NUTRIENTS: NutrientDefinition[] = [
  ...group('Energy & macronutrients', [['energy','Energy','kcal'],['protein','Protein','g'],['carbs','Carbohydrate','g'],['fat','Total fat','g'],['fiber','Fiber','g'],['sugar','Total sugars','g'],['added_sugar','Added sugars','g'],['starch','Starch','g'],['sugar_alcohol','Sugar alcohols','g'],['alcohol','Alcohol','g'],['water','Water','g']]),
  ...group('Vitamins', [['vitamin_a','Vitamin A (RAE)','µg'],['beta_carotene','Beta-carotene','µg'],['alpha_carotene','Alpha-carotene','µg'],['retinol','Retinol','µg'],['thiamin','B1 · Thiamin','mg'],['riboflavin','B2 · Riboflavin','mg'],['niacin','B3 · Niacin','mg'],['pantothenic_acid','B5 · Pantothenic acid','mg'],['vitamin_b6','Vitamin B6','mg'],['biotin','B7 · Biotin','µg'],['folate','Folate (DFE)','µg'],['folic_acid','Folic acid','µg'],['vitamin_b12','Vitamin B12','µg'],['choline','Choline','mg'],['vitamin_c','Vitamin C','mg'],['vitamin_d','Vitamin D','µg'],['vitamin_e','Vitamin E (alpha-tocopherol)','mg'],['vitamin_k','Vitamin K','µg'],['lutein_zeaxanthin','Lutein + zeaxanthin','µg'],['lycopene','Lycopene','µg']]),
  ...group('Minerals', [['calcium','Calcium','mg'],['chromium','Chromium','µg'],['copper','Copper','mg'],['fluoride','Fluoride','mg'],['iodine','Iodine','µg'],['iron','Iron','mg'],['magnesium','Magnesium','mg'],['manganese','Manganese','mg'],['molybdenum','Molybdenum','µg'],['phosphorus','Phosphorus','mg'],['potassium','Potassium','mg'],['selenium','Selenium','µg'],['sodium','Sodium','mg'],['zinc','Zinc','mg']]),
  ...group('Fats', [['saturated_fat','Saturated fat','g'],['monounsaturated_fat','Monounsaturated fat','g'],['polyunsaturated_fat','Polyunsaturated fat','g'],['trans_fat','Trans fat','g'],['cholesterol','Cholesterol','mg'],['omega_3','Omega-3','g'],['omega_6','Omega-6','g'],['ala','ALA','g'],['epa','EPA','g'],['dha','DHA','g']]),
  ...group('Amino acids', [['alanine','Alanine','g'],['arginine','Arginine','g'],['aspartic_acid','Aspartic acid','g'],['cystine','Cystine','g'],['glutamic_acid','Glutamic acid','g'],['glycine','Glycine','g'],['histidine','Histidine','g'],['isoleucine','Isoleucine','g'],['leucine','Leucine','g'],['lysine','Lysine','g'],['methionine','Methionine','g'],['phenylalanine','Phenylalanine','g'],['proline','Proline','g'],['serine','Serine','g'],['threonine','Threonine','g'],['tryptophan','Tryptophan','g'],['tyrosine','Tyrosine','g'],['valine','Valine','g']]),
  ...group('Other', [['caffeine','Caffeine','mg'],['theobromine','Theobromine','mg']]),
];
export const REQUIRED_NUTRIENTS = ['energy', 'protein', 'carbs', 'fat'] as const;
const CATALOG = new Map(NUTRIENTS.map(n => [n.key, n]));
const MASS: Record<string, number> = { g: 1, kg: 1000, oz: 28.349523125, lb: 453.59237, mg: 0.001, 'µg': 0.000001 };
const VOLUME: Record<string, number> = { ml: 1, l: 1000, tsp: 4.92892159375, tbsp: 14.78676478125, cup: 236.5882365, 'fl oz': 29.5735295625 };
export const AMOUNT_UNITS = ['serving','g','oz','lb','kg','ml','l','tsp','tbsp','cup','fl oz'];
function normalized(unit: string): string {
  const aliases: Record<string, string> = { gram:'g', grams:'g', kilogram:'kg', kilograms:'kg', ounce:'oz', ounces:'oz', lbs:'lb', pound:'lb', pounds:'lb', milliliter:'ml', milliliters:'ml', litre:'l', liter:'l', liters:'l', mcg:'µg', ug:'µg', servings:'serving' };
  return aliases[unit.trim().toLowerCase()] || unit.trim().toLowerCase();
}
/** Returns null rather than inventing a density or an undocumented serving size. */
export function convertQuantity(quantity: number, from: string, to: string): number | null {
  const f = normalized(from), t = normalized(to);
  if (!Number.isFinite(quantity) || quantity < 0) return null;
  if (f === t) return quantity;
  if (MASS[f] && MASS[t]) return quantity * MASS[f] / MASS[t];
  if (VOLUME[f] && VOLUME[t]) return quantity * VOLUME[f] / VOLUME[t];
  return null;
}
export function ingredientMultiplier(ingredient: RecipeIngredient): number | null {
  const { food, quantity, unit } = ingredient;
  if (food.basis.quantity <= 0 || !Number.isFinite(quantity) || quantity < 0) return null;
  if (normalized(unit) === 'serving') return quantity;
  const direct = convertQuantity(quantity, unit, food.basis.unit);
  if (direct !== null) return direct / food.basis.quantity;
  if (food.basis.grams && food.basis.grams > 0) {
    const grams = convertQuantity(quantity, unit, 'g');
    if (grams !== null) return grams / food.basis.grams;
  }
  return null;
}
export function amountUnits(food: FoodRecord): string[] { return [...new Set(['serving',food.basis.unit,...AMOUNT_UNITS])].filter(unit => ingredientMultiplier({ id:'check', food, quantity:1, unit }) !== null); }
export function validateFood(food: FoodRecord): string[] {
  const issues: string[] = [];
  if (!food.name.trim()) issues.push('Give this food a name.');
  if (!food.basis.unit.trim() || !Number.isFinite(food.basis.quantity) || food.basis.quantity <= 0) issues.push('Define a positive serving basis.');
  if (food.basis.grams != null && (!Number.isFinite(food.basis.grams) || food.basis.grams <= 0)) issues.push('Serving weight must be greater than zero.');
  const keys = new Set<string>();
  for (const nutrient of food.nutrients) {
    if (keys.has(nutrient.key)) issues.push(`Duplicate nutrient: ${nutrient.label}.`);
    keys.add(nutrient.key);
    if (!nutrient.key.trim() || !nutrient.label.trim() || !nutrient.unit.trim()) issues.push('Each nutrient needs a key, name, and unit.');
    if (nutrient.amount !== null && (!Number.isFinite(nutrient.amount) || nutrient.amount < 0)) issues.push(`${nutrient.label} must be a nonnegative number or unknown.`);
    const definition = CATALOG.get(nutrient.key);
    if (definition && nutrient.unit !== definition.unit) issues.push(`${definition.label} must use ${definition.unit}.`);
  }
  for (const key of REQUIRED_NUTRIENTS) if (food.nutrients.find(n => n.key === key)?.amount == null) issues.push(`${CATALOG.get(key)?.label} is required; enter zero only when it is known to be zero.`);
  return issues;
}
export function ingredientIssues(ingredients: RecipeIngredient[]): string[] {
  return ingredients.flatMap(ingredient => ingredientMultiplier(ingredient) === null ? [`Cannot convert ${ingredient.unit} to the serving basis for ${ingredient.food.name}.`] : ingredient.quantity <= 0 ? [`Enter a positive amount for ${ingredient.food.name}.`] : []);
}
export type NutrientTotal = NutrientDefinition & { amount: number | null; partial: boolean; estimated: boolean; known: number; total: number };
export function nutrientTotals(ingredients: RecipeIngredient[], multiplier = 1): NutrientTotal[] {
  const definitions = new Map(NUTRIENTS.map(n => [n.key, n]));
  // A total can combine several foods; source references belong to their snapshots.
  for (const ingredient of ingredients) for (const n of ingredient.food.nutrients) if (!definitions.has(n.key)) definitions.set(n.key, { key:n.key, label:n.label, unit:n.unit, group:'Other' });
  const active = ingredients.filter(i => i.quantity > 0 && multiplier > 0);
  return [...definitions.values()].map(def => {
    let sum = 0, known = 0, estimated = false;
    for (const ingredient of active) {
      const factor = ingredientMultiplier(ingredient);
      const nutrient = ingredient.food.nutrients.find(n => n.key === def.key);
      if (factor === null || nutrient?.amount == null) continue;
      const amount = convertQuantity(nutrient.amount, nutrient.unit, def.unit);
      if (amount === null) continue;
      known++;
      sum += amount * factor * multiplier;
      estimated ||= !!nutrient.estimated;
    }
    return { ...def, amount: known ? sum : active.length === 0 ? 0 : null, partial: known < active.length, estimated, known, total: active.length };
  });
}
export function combineTotals(groups: NutrientTotal[][]): NutrientTotal[] {
  const definitions = new Map<string, NutrientTotal>();
  for (const totals of groups) for (const n of totals) {
    const prev = definitions.get(n.key);
    if (!prev) definitions.set(n.key, { ...n });
    else {
      const compatible = n.unit === prev.unit ? n.amount : n.amount === null ? null : convertQuantity(n.amount, n.unit, prev.unit);
      definitions.set(n.key, { ...prev, amount: prev.amount === null && compatible === null ? null : (prev.amount ?? 0) + (compatible ?? 0), partial: prev.partial || n.partial || (compatible === null && n.total > 0), estimated: prev.estimated || n.estimated, known: prev.known + (compatible === null ? 0 : n.known), total: prev.total + n.total });
    }
  }
  return [...definitions.values()];
}
/** Anchor amounts refer to the food measurement used in the batch (e.g. dry pasta). */
export function portionFraction(batch: Pick<PrepBatch, 'ingredients' | 'anchorIngredientId'>, quantity: number, unit: string): number | null {
  const anchor = batch.ingredients.find(i => i.id === batch.anchorIngredientId);
  if (!anchor || anchor.quantity <= 0) return null;
  const full = ingredientMultiplier(anchor), part = ingredientMultiplier({ ...anchor, quantity, unit });
  return full && part !== null ? part / full : null;
}
export function cloneIngredients(ingredients: RecipeIngredient[], renewIds = false): RecipeIngredient[] {
  return ingredients.map(i => ({ ...i, id: renewIds ? newId() : i.id, food: { ...i.food, basis: { ...i.food.basis }, nutrients: i.food.nutrients.map(n => ({ ...n })) } }));
}
export function newFood(): FoodRecord {
  return { id:newId(), name:'', brand:'', revision:1, basis:{ quantity:100, unit:'g', grams:null }, nutrients:NUTRIENTS.filter(n => REQUIRED_NUTRIENTS.includes(n.key as typeof REQUIRED_NUTRIENTS[number])).map(({key,label,unit}) => ({key,label,unit,amount:null})), sourceUrl:'', notes:'', ingredientsText:'' };
}
export function nutrientValue(key: string, amount: number | null): NutrientValue {
  const definition = CATALOG.get(key);
  if (!definition) throw new Error('Unknown nutrient key');
  return { key, label:definition.label, unit:definition.unit, amount };
}
export function formatAmount(amount: number | null, digits = 1): string { return amount === null ? '—' : Number(amount.toFixed(digits)).toLocaleString(); }

/** Convert a fraction-based meal into actual plate quantities before one-off swaps/additions. */
export function customizePortion(entry: DiaryEntry, fraction = entry.multiplier): DiaryEntry {
  if (!Number.isFinite(fraction) || fraction <= 0) throw new Error('Enter a positive portion before customizing it.');
  return { ...entry, ingredients: cloneIngredients(entry.ingredients).map(i => ({ ...i, quantity: i.quantity * fraction })), multiplier: 1, anchorIngredientId: null, portionCustomized: true };
}
