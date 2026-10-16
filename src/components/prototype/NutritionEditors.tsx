'use client';

import { useState } from 'react';
import type { DiaryEntry, FoodRecord, MealGroup, NutrientValue, PrepBatch, RecipeIngredient, RecipeRecord } from '@/lib/domain/types';
import { newId } from '@/lib/domain/types';
import { AMOUNT_UNITS, NUTRIENTS, REQUIRED_NUTRIENTS, amountUnits, cloneIngredients, customizePortion, formatAmount, ingredientIssues, newFood, nutrientTotals, portionFraction, validateFood, type NutrientTotal } from '@/lib/domain/nutrition';
import { Modal, NumberField, TextField } from './controls';
import s from './prototype.module.css';
import n from './nutrition.module.css';

export const MEALS: MealGroup[] = ['Breakfast','Lunch','Dinner','Snack','Supplements'];
export function Errors({ errors }: { errors: string[] }) { return errors.length ? <ul className={n.errorList} role="alert">{errors.map((error,i) => <li key={`${i}-${error}`}>{error}</li>)}</ul> : null; }
export function NutritionSummary({ totals }: { totals: NutrientTotal[] }) {
  return <div className={n.macroGrid}>{REQUIRED_NUTRIENTS.map(key => {
    const value = totals.find(t => t.key === key);
    return <div className={n.macro} key={key}><strong>{value?.estimated ? '≈' : ''}{formatAmount(value?.amount ?? null, key === 'energy' ? 0 : 1)}{value?.partial ? '+' : ''}</strong><small>{key === 'energy' ? 'kcal' : `${key === 'carbs' ? 'Carbs' : key[0].toUpperCase()+key.slice(1)} · g`}</small></div>;
  })}</div>;
}
export function NutrientBreakdown({ totals }: { totals: NutrientTotal[] }) {
  const groups = [...new Set(totals.map(t => t.group))];
  return <div><p className={n.help}>A dash means unknown. “Partial” totals include only ingredients with reported values. Nutrient subtypes are shown separately, never added to their parent totals.</p>{groups.map(group => <details className={n.detailGroup} key={group} open={group === 'Energy & macronutrients'}><summary>{group}</summary><table className={n.nutritionTable}><tbody>{totals.filter(t => t.group === group).map(t => <tr key={t.key}><td>{t.label}{t.partial && t.known > 0 ? <small>Partial · {t.known} of {t.total} ingredients</small> : null}</td><td>{t.estimated && t.amount !== null ? '≈ ' : ''}{formatAmount(t.amount)} {t.amount !== null ? t.unit : ''}</td></tr>)}</tbody></table></details>)}</div>;
}

export function FoodEditor({ initial, onSave, onClose }: { initial?: FoodRecord; onSave:(food:FoodRecord)=>void; onClose:()=>void }) {
  const [food,setFood] = useState<FoodRecord>(() => initial ? structuredClone(initial) : newFood());
  const [errors,setErrors] = useState<string[]>([]);
  const [custom,setCustom] = useState({key:'',label:'',unit:'mg'});
  const patch = (p:Partial<FoodRecord>) => setFood(prev => ({...prev,...p}));
  const setNutrient = (def: {key:string;label:string;unit:string}, amount:number|null) => setFood(prev => {
    const existing = prev.nutrients.find(v => v.key === def.key);
    return {...prev, nutrients:[...prev.nutrients.filter(v=>v.key!==def.key), {...existing,key:def.key,label:def.label,unit:def.unit,amount}]};
  });
  const patchNutrient = (key:string, patch:Partial<NutrientValue>) => setFood(prev=>({...prev,nutrients:prev.nutrients.map(v=>v.key===key?{...v,...patch}:v)}));
  const save = () => { const issues=validateFood(food); setErrors(issues); if(!issues.length) onSave({...food,name:food.name.trim(),revision:initial?initial.revision+1:1}); };
  const extra = food.nutrients.filter(v => !NUTRIENTS.some(def=>def.key===v.key));
  const fields = (definitions: {key:string;label:string;unit:string}[]) => <div className={n.nutrientFields}>{definitions.map(def => {
    const value=food.nutrients.find(v=>v.key===def.key);
    return <div className={n.nutrientField} key={def.key}><NumberField label={`${def.label} (${def.unit})${REQUIRED_NUTRIENTS.some(k=>k===def.key)?' *':''}`} value={value?.amount??null} onChange={amount=>setNutrient(def,amount)} min={0} step={0.1} placeholder="Unknown" />{value?.amount != null ? <details className={n.nutrientSource}><summary className={n.mutedNotice}>Source / estimate</summary><TextField label={`${def.label} source`} value={value.source??''} onChange={source=>patchNutrient(def.key,{source})} placeholder="Optional reference"/><label className={n.check}><input type="checkbox" checked={!!value.estimated} onChange={e=>patchNutrient(def.key,{estimated:e.target.checked})}/>Estimated value</label></details> : null}</div>;
  })}</div>;
  return <Modal title={initial?'Edit food':'Create food'} onClose={onClose}><div className={s.stack}>
    <TextField label="Food name" value={food.name} onChange={name=>patch({name})} placeholder="e.g. Brami protein pasta, dry"/>
    <TextField label="Brand (optional)" value={food.brand} onChange={brand=>patch({brand})}/>
    <div className={s.grid}><NumberField label="Nutrition is per" value={food.basis.quantity} min={0.001} onChange={quantity=>patch({basis:{...food.basis,quantity:quantity??0}})}/><label className={s.field}>Basis unit<input className={s.input} list="nutrition-basis-units" value={food.basis.unit} onChange={e=>patch({basis:{...food.basis,unit:e.target.value}})} placeholder="g, capsule, scoop…"/><datalist id="nutrition-basis-units">{[...AMOUNT_UNITS,'capsule','tablet','scoop','piece','bag'].map(unit=><option key={unit} value={unit}/>)}</datalist></label></div>
    <p className={n.help}>Enter the nutrition for this entire basis. “1 serving” will mean {food.basis.quantity} {food.basis.unit || 'units'}. Use the food’s measured state, such as dry pasta or raw chicken. Volume units use US measures.</p>
    <NumberField label="Weight of this whole basis in grams (optional)" value={food.basis.grams??null} min={0.001} onChange={grams=>patch({basis:{...food.basis,grams}})} placeholder="Only when known"/>
    <p className={n.help}>Needed to convert a capsule, scoop, or volume serving into grams. Leave blank when unknown.</p>
    {fields(NUTRIENTS.filter(def=>REQUIRED_NUTRIENTS.some(k=>k===def.key)))}
    {[...new Set(NUTRIENTS.map(def=>def.group))].map(group=><details className={n.detailGroup} key={group}><summary>{group==='Energy & macronutrients'?'Fiber, sugars & other macronutrients':group}</summary>{fields(NUTRIENTS.filter(def=>def.group===group&&!REQUIRED_NUTRIENTS.some(k=>k===def.key)))}</details>)}
    {extra.length? <details className={n.detailGroup} open><summary>Additional nutrients</summary>{fields(extra)}</details>:null}
    <details className={n.detailGroup}><summary>Add a custom nutrient</summary><div className={s.stack}><TextField label="Nutrient name" value={custom.label} onChange={label=>setCustom({...custom,label,key:label.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')})}/><TextField label="Stable nutrient key" value={custom.key} onChange={key=>setCustom({...custom,key})}/><TextField label="Unit" value={custom.unit} onChange={unit=>setCustom({...custom,unit})}/><button className={s.button} type="button" onClick={()=>{if(!custom.key.trim()||!custom.label.trim()||!custom.unit.trim())return;if(food.nutrients.some(v=>v.key===custom.key)||NUTRIENTS.some(v=>v.key===custom.key)){setErrors(['That nutrient already exists. Edit its value above.']);return;}setNutrient(custom,null);setCustom({key:'',label:'',unit:'mg'});}}>Add nutrient field</button></div></details>
    <TextField label="Source URL or reference" value={food.sourceUrl} onChange={sourceUrl=>patch({sourceUrl})} placeholder="Manufacturer label / USDA record / research source"/>
    <TextField label="Ingredient list (optional)" value={food.ingredientsText} onChange={ingredientsText=>patch({ingredientsText})} multiline/>
    <TextField label="Notes" value={food.notes} onChange={notes=>patch({notes})} multiline/>
    {initial?<p className={n.help}>Saving creates revision {initial.revision+1}. Existing recipes, batches, and diary entries keep the nutrient values they already contain.</p>:null}
    <Errors errors={errors}/><div className={n.stickyActions}><button type="button" className={`${s.button} ${s.primary}`} onClick={save}>Save food</button><button type="button" className={s.button} onClick={onClose}>Cancel</button></div>
  </div></Modal>;
}

export function FoodPicker({ foods, onSelect, onCreate, heading='Choose food' }: {foods:FoodRecord[];onSelect:(food:FoodRecord)=>void;onCreate?:()=>void;heading?:string}) {
  const [search,setSearch]=useState('');
  const matches=foods.filter(food=>!food.archived&&`${food.name} ${food.brand}`.toLowerCase().includes(search.toLowerCase()));
  return <div className={s.stack}><TextField label={heading} value={search} onChange={setSearch} placeholder="Search your food library…"/>{onCreate?<button type="button" className={s.button} onClick={onCreate}>+ Create food</button>:null}<div>{matches.length?matches.map(food=><button type="button" className={n.listButton} key={food.id} onClick={()=>onSelect(food)}><span><strong>{food.name}</strong><small>{food.brand?`${food.brand} · `:''}{food.basis.quantity} {food.basis.unit} per serving</small></span><span className={n.entryEnergy}>+</span></button>):<p className={n.emptyLine}>{foods.length?'No matching foods.':'Your library is empty. Create a food first, or add one through your nutrition MCP.'}</p>}</div></div>;
}

export function IngredientEditor({ ingredients, foods, onChange, anchorId, onAnchorChange, allowAnchor=true }: {ingredients:RecipeIngredient[];foods:FoodRecord[];onChange:(items:RecipeIngredient[])=>void;anchorId?:string|null;onAnchorChange?:(id:string|null)=>void;allowAnchor?:boolean}) {
  const [picker,setPicker]=useState<string|null>(null);
  const update=(id:string,patch:Partial<RecipeIngredient>)=>onChange(ingredients.map(i=>i.id===id?{...i,...patch}:i));
  return <div className={s.stack}>{ingredients.map(ingredient=><div key={ingredient.id} className={n.ingredient}><div className={n.ingredientHead}><div><strong>{ingredient.food.name}</strong><small>{ingredient.food.basis.quantity} {ingredient.food.basis.unit} basis · revision {ingredient.food.revision}</small></div><div className={s.row}><button type="button" className={`${s.button} ${n.tiny}`} onClick={()=>setPicker(ingredient.id)}>Swap</button><button type="button" className={`${s.button} ${s.danger} ${n.tiny}`} aria-label={`Remove ${ingredient.food.name}`} onClick={()=>{onChange(ingredients.filter(i=>i.id!==ingredient.id));if(anchorId===ingredient.id)onAnchorChange?.(null);}}>Remove</button></div></div><div className={n.ingredientFields}><NumberField label={`Amount of ${ingredient.food.name}`} value={ingredient.quantity} min={0.001} step={0.1} onChange={quantity=>update(ingredient.id,{quantity:quantity??0})}/><label className={s.field}>Unit<select className={s.select} value={ingredient.unit} onChange={e=>update(ingredient.id,{unit:e.target.value})}>{amountUnits(ingredient.food).map(unit=><option key={unit}>{unit}</option>)}</select></label></div>{allowAnchor&&onAnchorChange?<label className={n.check}><input type="radio" name="portion-anchor" checked={anchorId===ingredient.id} onChange={()=>onAnchorChange(ingredient.id)}/>Use this ingredient to estimate portions</label>:null}<details className={n.ingredientNote}><summary className={n.mutedNotice}>Ingredient note</summary><TextField label={`Note for ${ingredient.food.name}`} value={ingredient.note??''} onChange={note=>update(ingredient.id,{note})}/></details></div>)}
    <button type="button" className={s.button} onClick={()=>setPicker('new')}>+ Add ingredient</button>
    {picker?<div className={s.card}><div className={s.row}><strong>{picker==='new'?'Add ingredient':'Replace ingredient'}</strong><button type="button" className={s.button} onClick={()=>setPicker(null)}>Close</button></div><FoodPicker foods={foods} onSelect={food=>{if(picker==='new')onChange([...ingredients,{id:newId(),food:structuredClone(food),quantity:1,unit:'serving'}]);else update(picker,{food:structuredClone(food),quantity:1,unit:'serving'});setPicker(null);}}/></div>:null}
  </div>;
}

export function PrepEditor({ initial, kind, foods, onSave, onClose }: {initial:RecipeRecord|PrepBatch;kind:'recipe'|'batch';foods:FoodRecord[];onSave:(value:RecipeRecord|PrepBatch)=>void;onClose:()=>void}) {
  const [draft,setDraft]=useState<RecipeRecord|PrepBatch>(()=>structuredClone(initial));
  const [errors,setErrors]=useState<string[]>([]);
  const patch=(p:Partial<RecipeRecord & PrepBatch>)=>setDraft(prev=>({...prev,...p}));
  const save=()=>{const issues=ingredientIssues(draft.ingredients);if(!draft.name.trim())issues.unshift('Give this prep a name.');if(!draft.ingredients.length)issues.push('Add at least one ingredient.');if('date' in draft&&!draft.date)issues.push('Choose the date you prepared this batch.');setErrors(issues);if(!issues.length)onSave({...draft,name:draft.name.trim()});};
  return <Modal title={kind==='batch'?'Prepare a batch':'Meal prep template'} onClose={onClose}><div className={s.stack}><TextField label={kind==='batch'?'Batch name':'Template name'} value={draft.name} onChange={name=>patch({name})}/>{'date' in draft?<label className={s.field}>Prepared on<input type="date" className={s.input} value={draft.date} onChange={e=>patch({date:e.target.value})}/></label>:null}<p className={n.help}>{kind==='batch'?'Everything carries forward. Change only what differs this time. This batch keeps its own ingredient quantities and food revisions.':'Save your usual ingredients and quantities. Each batch can change independently. Choose an anchor, such as dry pasta, to make estimated portions easier.'}</p><IngredientEditor ingredients={draft.ingredients} foods={foods} onChange={ingredients=>patch({ingredients})} anchorId={draft.anchorIngredientId} onAnchorChange={anchorIngredientId=>patch({anchorIngredientId})}/><TextField label="Notes" value={draft.notes} onChange={notes=>patch({notes})} multiline/><NutritionSummary totals={nutrientTotals(draft.ingredients)}/><p className={n.mutedNotice}>Nutrition for the whole {kind==='batch'?'batch':'recipe'}.</p><Errors errors={errors}/><div className={n.stickyActions}><button className={`${s.button} ${s.primary}`} type="button" onClick={save}>Save {kind==='batch'?'batch':'template'}</button><button className={s.button} type="button" onClick={onClose}>Cancel</button></div></div></Modal>;
}

export function EntryEditor({ initial, foods, batch, onSave, onClose, onDelete }: { initial:DiaryEntry;foods:FoodRecord[];batch?:PrepBatch;onSave:(entry:DiaryEntry)=>void;onClose:()=>void;onDelete?:()=>void }) {
  const [entry,setEntry]=useState<DiaryEntry>(()=>structuredClone(initial));
  const [mode,setMode]=useState<'fraction'|'anchor'>('fraction');
  const [equivalent,setEquivalent]=useState<number|null>(null);
  const [anchorUnit,setAnchorUnit]=useState(()=>initial.ingredients.find(i=>i.id===initial.anchorIngredientId)?.unit??'g');
  const [errors,setErrors]=useState<string[]>([]);
  const [details,setDetails]=useState(false);
  const [portionCustomized,setPortionCustomized]=useState(!!initial.portionCustomized);
  const patch=(p:Partial<DiaryEntry>)=>setEntry(prev=>({...prev,...p}));
  const anchor=entry.ingredients.find(i=>i.id===entry.anchorIngredientId);
  const fraction=mode==='anchor'&&equivalent!==null?portionFraction(entry,equivalent,anchorUnit):entry.multiplier;
  const totals=nutrientTotals(entry.ingredients,fraction??0);
  const setFraction=(value:number)=>{setMode('fraction');patch({multiplier:value});};
  const save=()=>{const issues=ingredientIssues(entry.ingredients);if(!entry.name.trim())issues.unshift('Enter a name.');if(!entry.ingredients.length)issues.push('Add at least one ingredient.');if(fraction===null||!Number.isFinite(fraction)||fraction<=0)issues.push('Enter a positive portion.');if(!entry.date)issues.push('Choose a date.');setErrors(issues);if(!issues.length)onSave({...entry,name:entry.name.trim(),multiplier:fraction!});};
  // Customization uses actual consumed quantities. Further edits can never mutate the saved batch.
  const customize=()=>{try{setEntry(customizePortion(entry,fraction??entry.multiplier));setMode('fraction');setPortionCustomized(true);setErrors([]);}catch(e){setErrors([(e as Error).message]);}};
  return <Modal title={onDelete?'Edit meal':'Log food'} onClose={onClose}><div className={s.stack}><TextField label="Entry name" value={entry.name} onChange={name=>patch({name})}/><div className={s.grid}><label className={s.field}>Meal<select className={s.select} value={entry.meal} onChange={e=>patch({meal:e.target.value as MealGroup})}>{MEALS.map(meal=><option key={meal}>{meal}</option>)}</select></label><label className={s.field}>Date<input className={s.input} type="date" value={entry.date} onChange={e=>patch({date:e.target.value})}/></label></div><label className={s.field}>Time (optional)<input className={s.input} type="time" value={entry.time} onChange={e=>patch({time:e.target.value})}/></label>
    {entry.kind==='prep'&&!portionCustomized?<><p className={n.help}>{batch?`From ${batch.name}, prepared ${batch.date}. `:''}Estimate your share of the entire batch. Ingredient amounts below refer to the batch, not the plate.</p><div className={s.tabs}><button className={`${s.button} ${mode==='fraction'?s.active:''}`} type="button" onClick={()=>{if(fraction!==null)patch({multiplier:fraction});setMode('fraction');}}>Batch fraction</button>{anchor?<button className={`${s.button} ${mode==='anchor'?s.active:''}`} type="button" onClick={()=>{setMode('anchor');setEquivalent(anchor.quantity*entry.multiplier);setAnchorUnit(anchor.unit);}}>{anchor.food.name} equivalent</button>:null}</div>{mode==='fraction'?<><div className={n.pills}>{[2,3,4,5,6,8].map(denominator=><button type="button" key={denominator} className={s.button} onClick={()=>setFraction(1/denominator)}>⅟{denominator}</button>)}</div><NumberField label="Percent of the whole batch" value={entry.multiplier*100} min={0.01} max={1000} step={1} onChange={percent=>patch({multiplier:(percent??0)/100})}/></>:anchor?<div className={s.grid}><NumberField label={`Amount of ${anchor.food.name}`} value={equivalent} min={0.001} step={0.1} onChange={setEquivalent}/><label className={s.field}>Unit<select className={s.select} value={anchorUnit} onChange={e=>setAnchorUnit(e.target.value)}>{amountUnits(anchor.food).map(unit=><option key={unit}>{unit}</option>)}</select></label></div>:null}<div className={n.portionSummary}>About {formatAmount((fraction??0)*100)}% of this batch{anchor&&fraction!==null?` · equivalent to ${formatAmount(anchor.quantity*fraction)} ${anchor.unit} of ${anchor.food.name}`:''}<div className={n.mutedNotice}>Uses the ingredient’s original measured state. Assumes an even mix.</div></div><label className={n.check}><input type="checkbox" checked={entry.estimated} onChange={e=>patch({estimated:e.target.checked})}/>Portion is estimated</label><button className={s.button} type="button" onClick={customize}>Adjust ingredients for this meal only</button></>:<><p className={n.help}>{portionCustomized?'These quantities are the food on your plate. Changes apply only to this meal.':'Set the amount you ate. One serving uses the food’s defined nutrition basis.'}</p><IngredientEditor ingredients={entry.ingredients} foods={foods} onChange={ingredients=>patch({ingredients})} allowAnchor={false}/>{entry.multiplier!==1?<NumberField label="Quantity multiplier" value={entry.multiplier} min={0.001} onChange={multiplier=>patch({multiplier:multiplier??0})}/>:null}<label className={n.check}><input type="checkbox" checked={entry.estimated} onChange={e=>patch({estimated:e.target.checked})}/>Portion is estimated</label></>}
    <NutritionSummary totals={totals}/><button className={s.button} type="button" onClick={()=>setDetails(!details)}>{details?'Hide':'Show'} nutrient details</button>{details?<NutrientBreakdown totals={totals}/>:null}<TextField label="Meal notes" value={entry.notes} onChange={notes=>patch({notes})} multiline/><Errors errors={errors}/><div className={n.stickyActions}><button className={`${s.button} ${s.primary}`} type="button" onClick={save}>{onDelete?'Save changes':'Add to diary'}</button><button className={s.button} type="button" onClick={onClose}>Cancel</button></div>{onDelete?<div className={n.dangerZone}><button className={`${s.button} ${s.danger}`} type="button" onClick={onDelete}>Delete this diary entry</button></div>:null}
  </div></Modal>;
}

export function blankEntry(date:string,meal:MealGroup):DiaryEntry {return {id:newId(),date,time:'',meal,name:'',kind:'food',ingredients:[],multiplier:1,estimated:false,batchId:null,anchorIngredientId:null,notes:''};}
export function entryFromBatch(batch:PrepBatch,date:string,meal:MealGroup):DiaryEntry {return {...blankEntry(date,meal),name:batch.name,kind:'prep',ingredients:cloneIngredients(batch.ingredients),multiplier:.2,estimated:true,batchId:batch.id,anchorIngredientId:batch.anchorIngredientId};}
