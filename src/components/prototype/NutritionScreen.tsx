'use client';

import { useMemo, useState } from 'react';
import { useData } from '@/lib/data-store';
import type { DiaryEntry, FoodRecord, MealGroup, PrepBatch, RecipeRecord } from '@/lib/domain/types';
import { newId } from '@/lib/domain/types';
import { fluidOuncesToLiters, waterOunces } from '@/lib/domain/water';
import { cloneIngredients, combineTotals, formatAmount, nutrientTotals } from '@/lib/domain/nutrition';
import { ChevronRight, Droplet, Ellipsis, Pencil, Plus } from 'lucide-react';
import { DayNav, Modal, NumberField, SaveStatus, Segmented, ViewHeader } from './controls';
import NutritionGoals from './NutritionGoals';
import { EntryEditor, FoodEditor, FoodPicker, MEALS, NutrientBreakdown, NutritionSummary, PrepEditor, blankEntry, entryFromBatch } from './NutritionEditors';
import s from './prototype.module.css';
import n from './nutrition.module.css';

type Editor = {kind:'food';value?:FoodRecord} | {kind:'recipe';value:RecipeRecord} | {kind:'batch';value:PrepBatch} | {kind:'entry';value:DiaryEntry;existing:boolean} | null;

export default function NutritionScreen() {
  const {records,upsert,remove,today,profile}=useData();
  const [date,setDate]=useState(today);
  const [tab,setTab]=useState<'diary'|'prep'|'foods'|'goals'>('diary');
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
  const energy=totals.find(t=>t.key==='energy');
  const waterOz=waterOunces(metrics?.waterL??0),waterGoal=waterOunces(profile.goals.waterL);
  return <main className={`${s.page} ${n.screen}`}>
    <ViewHeader q="in" label="Nutrition"><DayNav date={date} onChange={changeDate} markedDates={markedDates} label="Nutrition"/><SaveStatus/></ViewHeader>
    <Segmented label="Nutrition sections" value={tab} onChange={value=>{setTab(value);setNotice('');}} options={[{value:'diary',label:'Diary'},{value:'prep',label:'Meal prep'},{value:'foods',label:'Foods'},{value:'goals',label:'Goals'}]}/>
    {notice?<p className={n.notice} role="status">{notice}</p>:null}
    {tab==='diary'?<div className={n.stack}>
      <button type="button" className={n.summaryCard} onClick={()=>setBreakdown(true)} aria-label="All nutrients for this day">
        <span className={n.kcal}><b>{formatAmount(energy?.amount??null,0)}{energy?.partial?'+':''}</b><small>kcal</small></span>
        <NutritionSummary totals={totals} macrosOnly protein={profile.goals.proteinG}/>
        <ChevronRight size={16} className={n.chev}/>
      </button>
      <section className={n.meals} aria-label="Meals">
        <div className={n.tableHead} aria-hidden><span /><span>kcal</span><span>protein</span><span>carbs</span><span>fat</span><span /></div>
        {MEALS.map(meal=>{const meals=entries.filter(entry=>entry.meal===meal);// A total only adds information when there's more than one entry to add up.
          const total=meals.length>1?combineTotals(meals.map(entry=>nutrientTotals(entry.ingredients,entry.multiplier))):null;return <div key={meal} className={n.meal}>
          <div className={n.mealRow}><h2>{meal}</h2>{total?<MacroCells totals={total}/>:<><span/><span/><span/><span/></>}<button type="button" className={n.add} aria-label={`Add to ${meal}`} onClick={()=>{setAddType(batches.length?'batches':'foods');setAddMeal(meal);}}><Plus size={15}/></button></div>
          {meals.map(entry=><button className={n.itemRow} key={entry.id} type="button" onClick={()=>setEditor({kind:'entry',value:entry,existing:true})} aria-label={`${entry.name}, edit`}><span className={n.itemName}>{entry.name}{entry.ingredients.length>1&&entry.kind==='food'?<small>{entry.ingredients.length} ingredients</small>:entry.kind==='prep'?<small>meal prep</small>:null}</span><MacroCells totals={nutrientTotals(entry.ingredients,entry.multiplier)}/><span/></button>)}
        </div>;})}
      </section>
      <section className={n.water} aria-label="Water">
        <Droplet size={16} className={n.drop}/>
        <div className={n.waterMain}><div className={n.waterValue}><NumberField compact className={n.waterInput} label="Fluid ounces today" value={waterOz} onChange={value=>saveWater(fluidOuncesToLiters(value??0))} min={0} max={waterOunces(30)} step={8}/><small>/ {waterGoal} fl oz</small></div><div className={n.meter}><i style={{width:`${Math.min(100,waterOz/Math.max(1,waterGoal)*100)}%`}}/></div></div>
        <button type="button" className={n.pill} onClick={()=>saveWater((metrics?.waterL??0)+fluidOuncesToLiters(8))}>+8</button><button type="button" className={n.pill} onClick={()=>saveWater((metrics?.waterL??0)+fluidOuncesToLiters(16))}>+16</button>
      </section>
    </div>:null}
    {tab==='prep'?<div className={n.stack}>
      <div className={n.sectionHead}><h2>Templates</h2><button type="button" className={n.pill} onClick={createRecipe}><Plus size={14}/>Template</button></div>
      {!recipes.length?<div className={s.empty}>Save your usual meal prep once. Each week, make a batch from it and change only what differs.</div>:recipes.map(recipe=>{const last=batches.find(b=>b.recipeId===recipe.id);const parent=recipe.familyId?records.recipes[recipe.familyId]:undefined;return <section key={recipe.id} className={n.card}>
        <div className={n.cardHead}><div className={n.grow}>{parent?<div className={n.recipeFamily}>Preset of {parent.name}</div>:null}<h3>{recipe.name||'Untitled template'}</h3><p className={n.meta}>{recipe.ingredients.map(i=>i.food.name).join(' · ')||'No ingredients yet'}</p></div><button type="button" className={n.more} aria-label={`Edit ${recipe.name||'template'}`} onClick={()=>setEditor({kind:'recipe',value:recipe})}><Pencil size={15}/></button></div>
        <div className={n.actions}><button type="button" className={`${s.button} ${s.primary}`} onClick={()=>prepare(recipe)}>{last?'Make next batch':'Make a batch'}</button>{last?<button type="button" className={n.pill} onClick={()=>prepare(recipe,false)}>From template amounts</button>:null}<details className={n.menu}><summary className={n.pill} aria-label="More template actions"><Ellipsis size={14}/></summary><div><button type="button" onClick={()=>setEditor({kind:'recipe',value:{...recipe,id:newId(),familyId:recipe.familyId??recipe.id,name:`${recipe.name} · variation`,revision:1,ingredients:cloneIngredients(recipe.ingredients)}})}>New preset from this</button><button type="button" className={n.danger} onClick={()=>{upsert('recipes',{...recipe,archived:true});setNotice('Template archived. Its batches and diary history remain.');}}>Archive template</button></div></details></div>
        {last?<p className={n.meta}>Next batch copies {last.date}’s amounts.</p>:null}
      </section>;})}
      <div className={n.sectionHead}><h2>Batches</h2></div>
      {!batches.length?<p className={n.meta}>Batches you make show up here, ready to log a portion.</p>:batches.map(batch=>{const logged=Object.values(records.diary).filter(entry=>entry.batchId===batch.id);const anchor=batch.ingredients.find(i=>i.id===batch.anchorIngredientId);return <section className={n.card} key={batch.id}>
        <div className={n.cardHead}><div className={n.grow}><h3>{batch.name}</h3><p className={n.meta}>{batch.date} · {logged.length} {logged.length===1?'meal':'meals'} logged{anchor?` · portions by ${anchor.food.name}`:''}</p></div><button type="button" className={n.more} aria-label={`Edit ${batch.name}`} onClick={()=>setEditor({kind:'batch',value:batch})}><Pencil size={15}/></button></div>
        <p className={n.meta}>{batch.ingredients.map(i=>`${formatAmount(i.quantity)} ${i.unit} ${i.food.name}`).join(' · ')}</p>
        <div className={n.actions}><button type="button" className={`${s.button} ${s.primary}`} onClick={()=>logBatch(batch)}>Log a portion</button><button type="button" className={n.pill} onClick={()=>duplicateBatch(batch)}>Make again</button><details className={n.menu}><summary className={n.pill} aria-label="More batch actions"><Ellipsis size={14}/></summary><div><button type="button" onClick={()=>savePreset(batch)}>Save amounts as a preset</button><button type="button" className={n.danger} onClick={()=>{upsert('batches',{...batch,archived:true});setNotice('Batch archived. Logged meals stay in your diary.');}}>Archive batch</button></div></details></div>
      </section>;})}
    </div>:null}
    {tab==='goals'?<NutritionGoals date={date}/>:null}
    {tab==='foods'?<div className={n.stack}>
      <div className={n.searchRow}><input className={s.input} value={foodQuery} onChange={e=>setFoodQuery(e.target.value)} placeholder="Search foods" aria-label="Search foods"/><button type="button" className={`${s.button} ${s.primary}`} onClick={()=>setEditor({kind:'food'})}><Plus size={15}/>Food</button></div>
      <section className={n.meals}>{foods.filter(food=>(showArchived||!food.archived)&&`${food.name} ${food.brand}`.toLowerCase().includes(foodQuery.toLowerCase())).map(food=>{const t=nutrientTotals([{id:'preview',food,quantity:1,unit:'serving'}]);const v=(key:string)=>formatAmount(t.find(x=>x.key===key)?.amount??null,0);return <div className={n.foodRow} key={food.id}>
        <button type="button" className={n.entry} onClick={()=>setEditor({kind:'food',value:food})}><span><strong>{food.name}{food.archived?' · archived':''}</strong><small>{food.brand?`${food.brand} · `:''}per {food.basis.quantity} {food.basis.unit} · <i>{v('energy')} kcal · P {v('protein')} · C {v('carbs')} · F {v('fat')}</i></small></span></button>
        {!food.archived?<button type="button" className={n.add} aria-label={`Log ${food.name}`} onClick={()=>selectFood(food)}><Plus size={16}/></button>:<button type="button" className={n.pill} onClick={()=>{upsert('foods',{...food,archived:false});setNotice('Food restored.');}}>Restore</button>}
      </div>;})}</section>
      {!foods.length?<div className={s.empty}>No foods yet. Add one from its label or a researched source; unknown nutrients stay unknown. Your nutrition MCP can add them too.</div>:null}
      {foods.some(food=>food.archived)?<button type="button" className={n.textButton} onClick={()=>setShowArchived(!showArchived)}>{showArchived?'Hide archived foods':'Show archived foods'}</button>:null}
    </div>:null}
    {breakdown?<Modal title={`Nutrients · ${date}`} onClose={()=>setBreakdown(false)}><NutritionSummary totals={totals}/><NutrientBreakdown totals={totals}/></Modal>:null}
    {addMeal?<Modal title={`Add to ${addMeal}`} onClose={()=>setAddMeal(null)}><Segmented label="Add from" value={addType} onChange={setAddType} options={[{value:'foods',label:'Foods'},{value:'batches',label:'Prep batches'}]}/>{addType==='foods'?<FoodPicker foods={recentFoods} onSelect={selectFood} onCreate={()=>{setCreateForMeal(addMeal);setAddMeal(null);setEditor({kind:'food'});}}/>:<div className={n.meals}>{batches.length?batches.map(batch=><button type="button" className={n.entry} key={batch.id} onClick={()=>logBatch(batch)}><span><strong>{batch.name}</strong><small>Made {batch.date} · {batch.ingredients.length} ingredients</small></span><Plus size={16} className={n.chev}/></button>):<p className={n.meta}>No batches yet. Make one in Meal prep.</p>}</div>}</Modal>:null}
    {editor?.kind==='food'?<FoodEditor initial={editor.value} onSave={saveEditor} onArchive={editor.value&&!editor.value.archived?()=>{upsert('foods',{...editor.value!,archived:true});setEditor(null);setNotice('Food archived. Existing meals and recipes are unchanged.');}:undefined} onClose={()=>{setEditor(null);setCreateForMeal(null);}}/>:null}
    {editor?.kind==='recipe'||editor?.kind==='batch'?<PrepEditor key={editor.value.id} initial={editor.value} kind={editor.kind} foods={foods} onSave={saveEditor} onClose={()=>setEditor(null)}/>:null}
    {editor?.kind==='entry'?<EntryEditor key={editor.value.id} initial={editor.value} foods={foods} batch={editor.value.batchId?records.batches[editor.value.batchId]:undefined} onSave={entry=>{upsert('diary',entry);setEditor(null);setTab('diary');setDate(entry.date);setNotice('Meal saved.');}} onClose={()=>setEditor(null)} onDelete={editor.existing?()=>{remove('diary',editor.value.id);setEditor(null);setNotice('Diary entry deleted.');}:undefined}/>:null}
  </main>;
}

/** kcal · protein · carbs · fat as table cells. A dash is unknown; "+" means some foods don't report it. */
function MacroCells({totals}:{totals:ReturnType<typeof nutrientTotals>}) {
  return <>{(['energy','protein','carbs','fat'] as const).map(key=>{const t=totals.find(x=>x.key===key);return <span key={key} className={n.cell}>{formatAmount(t?.amount??null,0)}{t?.partial&&t.amount!==null?<i>+</i>:null}</span>;})}</>;
}
