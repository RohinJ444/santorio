import { describe, expect, it } from 'vitest';
import type { DiaryEntry, FoodRecord, PrepBatch, RecipeIngredient } from './types';
import { amountUnits, cloneIngredients, combineTotals, customizePortion, convertQuantity, ingredientIssues, ingredientMultiplier, nutrientTotals, portionFraction, validateFood } from './nutrition';

function food(overrides:Partial<FoodRecord>={}):FoodRecord { return {id:'food',name:'Test ingredient',brand:'',revision:1,basis:{quantity:100,unit:'g'},nutrients:[{key:'energy',label:'Energy',unit:'kcal',amount:200},{key:'protein',label:'Protein',unit:'g',amount:20},{key:'carbs',label:'Carbohydrate',unit:'g',amount:30},{key:'fat',label:'Total fat',unit:'g',amount:5}],sourceUrl:'Test fixture',notes:'',ingredientsText:'',...overrides}; }
function ingredient(f=food(),quantity=100,unit='g',id='ingredient'):RecipeIngredient {return {id,food:f,quantity,unit};}
function total(items:RecipeIngredient[],key='energy',multiplier=1){return nutrientTotals(items,multiplier).find(v=>v.key===key)!;}

describe('nutrition quantities',()=>{
  it('scales an ounce of food from a 100 gram nutrient basis',()=>{expect(ingredientMultiplier(ingredient(food(),1,'oz'))).toBeCloseTo(.28349523125);expect(total([ingredient(food(),1,'oz')]).amount).toBeCloseTo(56.69904625);});
  it('uses a declared serving gram weight without inventing food density',()=>{const liquid=food({basis:{quantity:2,unit:'tbsp',grams:32}});expect(ingredientMultiplier(ingredient(liquid,16,'g'))).toBe(.5);expect(ingredientMultiplier(ingredient(liquid,1,'tbsp'))).toBe(.5);expect(ingredientMultiplier(ingredient(food({basis:{quantity:100,unit:'ml'}}),100,'g'))).toBeNull();expect(convertQuantity(1,'cup','g')).toBeNull();});
  it('handles multi-capsule labels and whole nutrition-basis servings',()=>{const supplement=food({basis:{quantity:2,unit:'capsule'}});expect(ingredientMultiplier(ingredient(supplement,1,'capsule'))).toBe(.5);expect(ingredientMultiplier(ingredient(supplement,1,'serving'))).toBe(1);expect(amountUnits(supplement)).toEqual(['serving','capsule']);});
  it('rejects unsupported ingredient amounts and mismatched nutrient units',()=>{expect(ingredientIssues([ingredient(food(),1,'cup')])).toHaveLength(1);const bad=food();bad.nutrients[0].unit='g';expect(validateFood(bad)).toContain('Energy must use kcal.');});
});

describe('estimated prep portions',()=>{
  it('keeps the pasta anchor independent of chicken amounts while scaling the whole batch',()=>{
    const pasta=ingredient(food(),24,'oz','pasta');
    const chicken=ingredient(food({id:'chicken',name:'Chicken'}),1,'lb','chicken');
    const batch:PrepBatch={id:'batch',name:'Pasta mix',date:'2026-10-16',recipeId:null,ingredients:[pasta,chicken],anchorIngredientId:'pasta',notes:''};
    const fraction=portionFraction(batch,4.8,'oz');
    expect(fraction).toBeCloseTo(.2);
    expect(portionFraction(batch,4.8*28.349523125,'g')).toBeCloseTo(.2);
    expect(total(batch.ingredients,'energy',fraction!).amount).toBeCloseTo(total(batch.ingredients).amount!*.2);
    const next={...batch,ingredients:batch.ingredients.map(i=>i.id==='chicken'?{...i,quantity:1.5}:i)};
    expect(portionFraction(next,4.8,'oz')).toBeCloseTo(.2);
    expect(next.ingredients[0].quantity).toBe(24);
    expect(total(next.ingredients).amount).toBeGreaterThan(total(batch.ingredients).amount!);
  });
  it('preserves historical food values and conversion basis when library or template changes',()=>{
    const original=[ingredient(food(),24,'oz')];
    const batch=cloneIngredients(original), logged=cloneIngredients(batch);
    original[0].food.nutrients[0].amount=999;
    original[0].food.basis.quantity=1;
    batch[0].quantity=32;
    expect(total(logged,'energy',.2).amount).toBeCloseTo(272.155422);
    expect(logged[0].food.nutrients[0].amount).toBe(200);
    expect(logged[0].quantity).toBe(24);
  });
});

describe('nutrient coverage',()=>{
  it('distinguishes unknown from a reported zero, including partial totals',()=>{
    const known=food();known.nutrients.push({key:'vitamin_c',label:'Vitamin C',unit:'mg',amount:0});
    const unknown=food({id:'unknown'});
    expect(total([ingredient(unknown)],'vitamin_c')).toMatchObject({amount:null,partial:true,known:0,total:1});
    expect(total([ingredient(known)],'vitamin_c')).toMatchObject({amount:0,partial:false});
    expect(total([ingredient(known),ingredient(unknown)],'vitamin_c')).toMatchObject({amount:0,partial:true,known:1,total:2});
  });
  it('combines diary entries without interpreting missing micros as complete',()=>{
    const known=food();known.nutrients.push({key:'iron',label:'Iron',unit:'mg',amount:4,estimated:true});
    const result=combineTotals([nutrientTotals([ingredient(known)],.5),nutrientTotals([ingredient(food())])]);
    expect(result.find(n=>n.key==='iron')).toMatchObject({amount:2,partial:true,estimated:true,known:1,total:2});
    expect(result.find(n=>n.key==='energy')?.amount).toBe(300);
  });
  it('retains arbitrary micronutrients and does not sum nutrient parents and subtypes',()=>{
    const f=food();f.nutrients.push({key:'special_compound',label:'Special compound',unit:'mg',amount:5},{key:'saturated_fat',label:'Saturated fat',unit:'g',amount:2});
    expect(total([ingredient(f)],'special_compound').amount).toBe(5);
    expect(total([ingredient(f)],'fat').amount).toBe(5);
  });
  it('aggregates custom nutrients without attributing the combined total to one food source',()=>{
    const first=food(),second=food({id:'second'});
    first.nutrients.push({key:'special_compound',label:'Special compound',unit:'mg',amount:5,source:'First food label',estimated:true});
    second.nutrients.push({key:'special_compound',label:'Special compound',unit:'g',amount:.005,source:'Second food label'});
    const items=[ingredient(first),ingredient(second,100,'g','second')],original=structuredClone(items);
    const totals=nutrientTotals(items,.5);
    expect(totals.find(n=>n.key==='special_compound')).toEqual({key:'special_compound',label:'Special compound',unit:'mg',group:'Other',amount:5,partial:false,estimated:true,known:2,total:2});
    expect(combineTotals([totals]).find(n=>n.key==='special_compound')).not.toHaveProperty('source');
    expect(items).toEqual(original);
  });
  it.each([null,0])('preserves custom nutrient value %s without leaking its source into totals',amount=>{
    const f=food();f.nutrients.push({key:'custom_nutrient',label:'Custom nutrient',unit:'mg',amount,source:'Reference'});
    const nutrient=total([ingredient(f)],'custom_nutrient');
    expect(nutrient).toMatchObject({amount,partial:amount===null,known:amount===null?0:1,total:1});
    expect(nutrient).not.toHaveProperty('source');
    expect(f.nutrients.at(-1)?.source).toBe('Reference');
  });
  it('requires macro information even when micronutrients are optional',()=>{
    const f=food();f.nutrients[1].amount=null;
    expect(validateFood(f).some(message=>message.startsWith('Protein is required'))).toBe(true);
    f.nutrients[1].amount=0;
    expect(validateFood(f)).toEqual([]);
  });
});

describe('one-off meal adjustments', () => {
  it('converts only the consumed fraction to plate quantities so extras are not divided again', () => {
    const entry:DiaryEntry={id:'entry',date:'2026-10-16',time:'',meal:'Lunch',name:'Pasta mix',kind:'prep',ingredients:[ingredient(food(),24,'oz','pasta')],multiplier:.2,estimated:true,batchId:'batch',anchorIngredientId:'pasta',notes:''};
    const customized=customizePortion(entry);
    expect(customized).toMatchObject({multiplier:1,anchorIngredientId:null,portionCustomized:true});
    expect(customized.ingredients[0].quantity).toBeCloseTo(4.8);
    customized.ingredients.push(ingredient(food({id:'sauce'}),1,'serving','sauce'));
    expect(total(customized.ingredients).amount).toBeCloseTo(total(entry.ingredients,'energy',.2).amount!+200);
    expect(entry.ingredients).toHaveLength(1);
    expect(entry.ingredients[0].quantity).toBe(24);
    expect(customizePortion(customized).ingredients[0].quantity).toBeCloseTo(4.8);
  });
  it('does not materialize an invalid empty portion', () => {
    const entry={ingredients:[],multiplier:0} as unknown as DiaryEntry;
    expect(()=>customizePortion(entry)).toThrow('positive portion');
  });
});
