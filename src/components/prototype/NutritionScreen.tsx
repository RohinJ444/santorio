'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useData } from '@/lib/data-store';
import type { DiaryEntry, FoodRecord, MealGroup, PrepBatch, RecipeRecord } from '@/lib/domain/types';
import { newId } from '@/lib/domain/types';
import { fluidOuncesToLiters, waterOunces } from '@/lib/domain/water';
import { cloneIngredients, combineTotals, formatAmount, nutrientTotals } from '@/lib/domain/nutrition';
import { DayNav, Modal, NumberField, SaveStatus, TextField } from './controls';
import { EntryEditor, FoodEditor, FoodPicker, MEALS, NutrientBreakdown, NutritionSummary, PrepEditor, blankEntry, entryFromBatch } from './NutritionEditors';
import s from './prototype.module.css';
import n from './nutrition.module.css';

type Editor = {kind:'food';value?:FoodRecord} | {kind:'recipe';value:RecipeRecord} | {kind:'batch';value:PrepBatch} | {kind:'entry';value:DiaryEntry;existing:boolean} | null;

export default function NutritionScreen() {
  const {records,upsert,remove,today,profile}=useData();
  const [date,setDate]=useState(today);
  const [tab,setTab]=useState<'diary'|'prep'|'foods'>('diary');
  const [editor,setEditor]=useState<Editor>(null);
  const [addMeal,setAddMeal]=useState<MealGroup|null>(null);
  const [addType,setAddType]=useState<'foods'|'batches'>('foods');
  const [breakdown,setBreakdown]=useState(false);
  const [foodQuery,setFoodQuery]=useState('');
  const [showArchived,setShowArchived]=useState(false);
  const [notice,setNotice]=useState('');
  const [createForMeal,setCreateForMeal]=useState<MealGroup|null>(null);
  const entries=useMemo(()=>Object.values(records.diary).filter(entry=>entry.date===date).sort((a,b)=>a.time.localeCompare(b.time)),[records.diary,date]);
  const foods=useMemo(()=>Object.values(records.foods).sort((a,b)=>a.name.localeCompare(b.name)),[records.foods]);
  const batches=useMemo(()=>Object.values(records.batches).filter(b=>!b.archived).sort((a,b)=>b.date.localeCompare(a.date)),[records.batches]);
  const recipes=useMemo(()=>Object.values(records.recipes).filter(r=>!r.archived).sort((a,b)=>a.name.localeCompare(b.name)),[records.recipes]);
  const totals=useMemo(()=>entries.length?combineTotals(entries.map(entry=>nutrientTotals(entry.ingredients,entry.multiplier))):nutrientTotals([]),[entries]);
  const recentFoods=useMemo(()=>{
    const recent=new Map<string,number>();
    Object.values(records.diary).sort((a,b)=>`${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`)).forEach((entry,index)=>entry.ingredients.forEach(i=>{if(!recent.has(i.food.id))recent.set(i.food.id,index);}));
    return [...foods].sort((a,b)=>(recent.get(a.id)??Infinity)-(recent.get(b.id)??Infinity));
  },[foods,records.diary]);
  const metrics=records.metrics[date];
  const markedDates=Object.values(records.diary).map(entry=>entry.date);
  const changeDate=(next:string)=>{setDate(next);setNotice('');};
  const saveWater=(waterL:number|null)=>upsert('metrics',metrics?{...metrics,waterL:waterL??0}:{id:date,date,steps:null,waterL:waterL??0,activeEnergy:null,restingEnergy:null,exerciseMinutes:null,source:'manual'});
  const createRecipe=()=>setEditor({kind:'recipe',value:{id:newId(),name:'',revision:1,ingredients:[],anchorIngredientId:null,notes:''}});
  const prepare=(recipe:RecipeRecord,fromLast=true)=>{
    const last=fromLast?batches.find(batch=>batch.recipeId===recipe.id):undefined;
    const source=last??recipe;
    setEditor({kind:'batch',value:{id:newId(),name:recipe.name,date,recipeId:recipe.id,ingredients:cloneIngredients(source.ingredients),anchorIngredientId:source.anchorIngredientId,notes:source.notes}});
  };
  const duplicateBatch=(batch:PrepBatch)=>setEditor({kind:'batch',value:{...batch,id:newId(),date,ingredients:cloneIngredients(batch.ingredients)}});
  const savePreset=(batch:PrepBatch)=>setEditor({kind:'recipe',value:{id:newId(),familyId:batch.recipeId?records.recipes[batch.recipeId]?.familyId??batch.recipeId:undefined,name:`${batch.name} · variation`,revision:1,ingredients:cloneIngredients(batch.ingredients),anchorIngredientId:batch.anchorIngredientId,notes:batch.notes}});
  const selectFood=(food:FoodRecord)=>{
    setEditor({kind:'entry',existing:false,value:{...blankEntry(date,addMeal??'Lunch'),name:food.name,ingredients:[{id:newId(),food:structuredClone(food),quantity:1,unit:'serving'}]}});setAddMeal(null);
  };
  const logBatch=(batch:PrepBatch,meal:MealGroup=addMeal??'Lunch')=>{setEditor({kind:'entry',existing:false,value:entryFromBatch(batch,date,meal)});setAddMeal(null);};
  const saveEditor=(value:FoodRecord|RecipeRecord|PrepBatch)=>{
    if(editor?.kind==='food'){const food=value as FoodRecord;upsert('foods',food);setNotice('Food saved to your library.');if(createForMeal){setEditor({kind:'entry',existing:false,value:{...blankEntry(date,createForMeal),name:food.name,ingredients:[{id:newId(),food:structuredClone(food),quantity:1,unit:'serving'}]}});setCreateForMeal(null);return;}}
    if(editor?.kind==='recipe'){const recipe=value as RecipeRecord;upsert('recipes',{...recipe,revision:records.recipes[recipe.id]?records.recipes[recipe.id].revision+1:1});setNotice('Template saved. Existing batches are unchanged.');}
    if(editor?.kind==='batch'){upsert('batches',value as PrepBatch);setNotice('Batch saved. Log a portion whenever you eat it.');}
    setEditor(null);
  };
  return <main className={`${s.page} ${n.screen}`}>
    <header className={s.header}><div className={s.row}><Link className={s.button} href="/" aria-label="Back to body">← Body</Link><div><span className={s.subtle}>Q IN</span><h1 className={n.heading}>Nutrition</h1></div></div><SaveStatus/></header>
    <DayNav date={date} onChange={changeDate} markedDates={markedDates} label="Nutrition date"/>
    <div className={s.tabs} role="tablist" aria-label="Nutrition sections">{(['diary','prep','foods'] as const).map(value=><button type="button" role="tab" aria-selected={tab===value} className={`${s.button} ${tab===value?s.active:''}`} key={value} onClick={()=>{setTab(value);setNotice('');}}>{value==='diary'?'Diary':value==='prep'?'Meal prep':'Food library'}</button>)}</div>
    {notice?<p className={n.portionSummary} role="status">{notice}</p>:null}
    {tab==='diary'?<div className={s.stack}>
      <NutritionSummary totals={totals}/><div className={s.row}><span className={s.subtle}>{entries.length?`${entries.length} ${entries.length===1?'entry':'entries'} logged`:'Nothing logged yet'} · protein goal {profile.goals.proteinG} g</span><button type="button" className={s.button} onClick={()=>setBreakdown(true)}>All nutrients</button></div>
      {MEALS.map(meal=>{const meals=entries.filter(entry=>entry.meal===meal);return <section key={meal} className={s.card}><div className={n.groupHeader}><h2>{meal}</h2><button type="button" className={s.button} aria-label={`Add to ${meal}`} onClick={()=>{setAddType(batches.length?'batches':'foods');setAddMeal(meal);}}>+ Add</button></div>{meals.length?meals.map(entry=>{const energy=nutrientTotals(entry.ingredients,entry.multiplier).find(t=>t.key==='energy');return <button className={n.listButton} key={entry.id} type="button" onClick={()=>setEditor({kind:'entry',value:entry,existing:true})}><span><strong>{entry.name}</strong><small>{entry.time?`${entry.time} · `:''}{entry.kind==='prep'?entry.portionCustomized?'Customized meal':`${formatAmount(entry.multiplier*100)}% of batch`:entry.ingredients.map(i=>`${formatAmount(i.quantity*entry.multiplier)} ${i.unit}`).join(' + ')}{entry.estimated?' · estimated':''}</small></span><span className={n.entryEnergy}>{entry.estimated?'≈ ':''}{formatAmount(energy?.amount??null,0)}{energy?.partial?'+':''} kcal</span></button>}):<p className={n.emptyLine}>{meal==='Supplements'?'Capsules, powders, and other supplements.':'Nothing logged.'}</p>}</section>})}
      <section className={s.card}><h2 className={s.sectionTitle}>Water</h2><div className={s.row}><NumberField label="Fluid ounces today" value={waterOunces(metrics?.waterL??0)} onChange={value=>saveWater(fluidOuncesToLiters(value??0))} min={0} max={waterOunces(30)} step={8}/><button type="button" className={s.button} onClick={()=>saveWater((metrics?.waterL??0)+fluidOuncesToLiters(8))}>+ 8 fl oz</button><button type="button" className={s.button} onClick={()=>saveWater((metrics?.waterL??0)+fluidOuncesToLiters(16))}>+ 16 fl oz</button></div><p className={n.mutedNotice}>Daily goal · {waterOunces(profile.goals.waterL)} fl oz</p></section>
    </div>:null}
    {tab==='prep'?<div className={s.stack}>
      <div className={s.row}><div><h2 className={s.sectionTitle}>Your prep templates</h2><p className={n.help}>Make a batch, change only what differs, then log your share.</p></div><button type="button" className={`${s.button} ${s.primary}`} onClick={createRecipe}>+ Template</button></div>
      {!recipes.length?<div className={s.empty}>Create your first meal prep template. Add its foods to your library first; you only need to research each ingredient once.</div>:recipes.map(recipe=>{const last=batches.find(b=>b.recipeId===recipe.id);const parent=recipe.familyId?records.recipes[recipe.familyId]:undefined;return <section key={recipe.id} className={s.card}>{parent?<div className={n.recipeFamily}>Preset · {parent.name}</div>:null}<div className={n.foodSummary}><h3 className={s.sectionTitle}>{recipe.name}</h3><span className={s.badge}>{recipe.ingredients.length} ingredients</span></div><p className={n.help}>{recipe.ingredients.map(i=>i.food.name).join(' · ')}</p><div className={s.row}><button type="button" className={`${s.button} ${s.primary}`} onClick={()=>prepare(recipe)}>{last?'Make next batch':'Make a batch'}</button><button type="button" className={s.button} onClick={()=>setEditor({kind:'recipe',value:recipe})}>Edit template</button>{last?<button type="button" className={s.button} onClick={()=>prepare(recipe,false)}>Use template amounts</button>:null}<button type="button" className={s.button} onClick={()=>setEditor({kind:'recipe',value:{...recipe,id:newId(),familyId:recipe.familyId??recipe.id,name:`${recipe.name} · variation`,revision:1,ingredients:cloneIngredients(recipe.ingredients)}})}>New preset</button></div>{last?<p className={n.mutedNotice}>Next batch copies all amounts from {last.date}. Change only what changed this week.</p>:null}<details className={n.detailGroup}><summary>More</summary><button type="button" className={`${s.button} ${s.danger}`} onClick={()=>{upsert('recipes',{...recipe,archived:true});setNotice('Template archived. Its batches and diary history remain.');}}>Archive template</button></details></section>})}
      <h2 className={s.sectionTitle}>Prepared batches</h2>{!batches.length?<p className={n.help}>Your batches will appear here, ready for quick portion logging.</p>:batches.map(batch=>{const logged=Object.values(records.diary).filter(entry=>entry.batchId===batch.id);const anchor=batch.ingredients.find(i=>i.id===batch.anchorIngredientId);return <section className={s.card} key={batch.id}><div className={n.foodSummary}><h3 className={s.sectionTitle}>{batch.name}</h3><span className={s.subtle}>{batch.date}</span></div><p className={n.help}>{batch.ingredients.map(i=>`${formatAmount(i.quantity)} ${i.unit} ${i.food.name}`).join(' · ')}</p>{anchor?<p className={n.preview}>Portion anchor: {formatAmount(anchor.quantity)} {anchor.unit} {anchor.food.name}</p>:null}<div className={s.row}><button type="button" className={`${s.button} ${s.primary}`} onClick={()=>logBatch(batch)}>Log a portion</button><button type="button" className={s.button} onClick={()=>duplicateBatch(batch)}>Make again</button><button type="button" className={s.button} onClick={()=>setEditor({kind:'batch',value:batch})}>Edit batch</button></div><p className={n.mutedNotice}>{logged.length} {logged.length===1?'meal':'meals'} logged from this batch. Logged meals keep their original ingredient values.</p><details className={n.detailGroup}><summary>More</summary><div className={s.row}><button type="button" className={s.button} onClick={()=>savePreset(batch)}>Save amounts as a preset</button><button type="button" className={`${s.button} ${s.danger}`} onClick={()=>{upsert('batches',{...batch,archived:true});setNotice('Batch archived. All logged meals remain in your diary.');}}>Archive finished batch</button></div></details></section>})}
    </div>:null}
    {tab==='foods'?<div className={s.stack}>
      <div className={s.row}><div><h2 className={s.sectionTitle}>Your food library</h2><p className={n.help}>Reusable foods, supplements, and their sourced nutrient profiles.</p></div><button type="button" className={`${s.button} ${s.primary}`} onClick={()=>setEditor({kind:'food'})}>+ Food</button></div>
      <TextField label="Search foods" value={foodQuery} onChange={setFoodQuery} placeholder="Name or brand"/><label className={n.check}><input type="checkbox" checked={showArchived} onChange={e=>setShowArchived(e.target.checked)}/>Include archived foods</label>
      {foods.filter(food=>(showArchived||!food.archived)&&`${food.name} ${food.brand}`.toLowerCase().includes(foodQuery.toLowerCase())).map(food=><section className={s.card} key={food.id}><div className={n.foodSummary}><div><h3 className={s.sectionTitle}>{food.name}</h3><p className={n.help}>{food.brand?`${food.brand} · `:''}Per {food.basis.quantity} {food.basis.unit} · revision {food.revision}{food.archived?' · archived':''}</p></div><button type="button" className={s.button} onClick={()=>setEditor({kind:'food',value:food})}>Edit</button></div><NutritionSummary totals={nutrientTotals([{id:'preview',food,quantity:1,unit:'serving'}])}/><div className={`${s.row} ${n.sectionGap}`}>{!food.archived?<button type="button" className={`${s.button} ${s.primary}`} onClick={()=>selectFood(food)}>Log food</button>:null}<button type="button" className={s.button} onClick={()=>{upsert('foods',{...food,archived:!food.archived});setNotice(food.archived?'Food restored.':'Food archived. Existing meals and recipes are unchanged.');}}>{food.archived?'Restore':'Archive'}</button></div>{food.sourceUrl?<p className={n.mutedNotice}>Source: {food.sourceUrl}</p>:null}</section>)}
      {!foods.length?<div className={s.empty}>No foods yet. Add a food from its label or a researched source. Unknown nutrients stay unknown; you can add more detail later through the app or MCP.</div>:null}
    </div>:null}
    {breakdown?<Modal title={`Nutrients · ${date}`} onClose={()=>setBreakdown(false)}><NutritionSummary totals={totals}/><NutrientBreakdown totals={totals}/></Modal>:null}
    {addMeal?<Modal title={`Add to ${addMeal}`} onClose={()=>setAddMeal(null)}><div className={s.tabs}><button type="button" className={`${s.button} ${addType==='foods'?s.active:''}`} onClick={()=>setAddType('foods')}>Foods / recent</button><button type="button" className={`${s.button} ${addType==='batches'?s.active:''}`} onClick={()=>setAddType('batches')}>Prep batches</button></div>{addType==='foods'?<FoodPicker foods={recentFoods} onSelect={selectFood} onCreate={()=>{setCreateForMeal(addMeal);setAddMeal(null);setEditor({kind:'food'});}}/>:<div>{batches.length?batches.map(batch=><button type="button" className={n.listButton} key={batch.id} onClick={()=>logBatch(batch)}><span><strong>{batch.name}</strong><small>Prepared {batch.date} · {batch.ingredients.length} ingredients</small></span><span>+</span></button>):<p className={n.help}>No prepared batches yet. Create one in Meal prep.</p>}</div>}</Modal>:null}
    {editor?.kind==='food'?<FoodEditor initial={editor.value} onSave={saveEditor} onClose={()=>{setEditor(null);setCreateForMeal(null);}}/>:null}
    {editor?.kind==='recipe'||editor?.kind==='batch'?<PrepEditor key={editor.value.id} initial={editor.value} kind={editor.kind} foods={foods} onSave={saveEditor} onClose={()=>setEditor(null)}/>:null}
    {editor?.kind==='entry'?<EntryEditor key={editor.value.id} initial={editor.value} foods={foods} batch={editor.value.batchId?records.batches[editor.value.batchId]:undefined} onSave={entry=>{upsert('diary',entry);setEditor(null);setTab('diary');setDate(entry.date);setNotice('Meal saved.');}} onClose={()=>setEditor(null)} onDelete={editor.existing?()=>{remove('diary',editor.value.id);setEditor(null);setNotice('Diary entry deleted.');}:undefined}/>:null}
  </main>;
}
