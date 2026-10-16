import type { DayMetrics, DiaryEntry, Measurement, ProfileRecord } from './types';
import { combineTotals, nutrientTotals } from './nutrition';

export const ACTIVITY_FACTORS = {sedentary:1.2,light:1.375,moderate:1.55,very:1.725} as const;
export function ageInYears(birthday:string,date:string):number|null {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(birthday)||!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
  const [by,bm,bd]=birthday.split('-').map(Number),[y,m,d]=date.split('-').map(Number);
  const birth=new Date(Date.UTC(by,bm-1,bd));
  if(birth.getUTCFullYear()!==by||birth.getUTCMonth()!==bm-1||birth.getUTCDate()!==bd)return null;
  const age=y-by-(m<bm||(m===bm&&d<bd)?1:0);
  return age>=0&&age<=130?age:null;
}
export function latestMeasurement(measurements:Measurement[],kind:Measurement['kind'],date:string):Measurement|null {
  return measurements.filter(m=>m.kind===kind&&m.date<=date).sort((a,b)=>b.date.localeCompare(a.date)||b.recordedAt.localeCompare(a.recordedAt))[0]??null;
}
/** Mifflin–St Jeor resting-energy proxy. No midpoint is invented when sex is unset.
 * Original equation: https://pubmed.ncbi.nlm.nih.gov/2305711/ */
export function bodyEstimates(profile:ProfileRecord,measurements:Measurement[],date:string):{bmr:number|null;tdee:number|null;weightKg:number|null;heightCm:number|null;age:number|null} {
  const age=ageInYears(profile.birthday,date);
  const weightKg=latestMeasurement(measurements,'weight_kg',date)?.value??null;
  const importedHeight=latestMeasurement(measurements.filter(m=>m.source==='apple_health'),'height_cm',date);
  const heightCm=profile.heightSource==='apple_health'?(importedHeight?.value??profile.heightCm):profile.heightCm;
  if(age===null||age<18||!profile.sex||!weightKg||!heightCm||heightCm<=0)return {bmr:null,tdee:null,weightKg,heightCm,age};
  const bmr=10*weightKg+6.25*heightCm-5*age+(profile.sex==='male'?5:-161);
  return {bmr:bmr>0?bmr:null,tdee:bmr>0?bmr*ACTIVITY_FACTORS[profile.activity]:null,weightKg,heightCm,age};
}
export function dailyIntake(entries:DiaryEntry[],date:string):{energy:number|null;protein:number|null;count:number;partial:boolean;estimated:boolean} {
  const day=entries.filter(e=>e.date===date);
  if(!day.length)return {energy:0,protein:0,count:0,partial:false,estimated:false};
  const totals=combineTotals(day.map(entry=>nutrientTotals(entry.ingredients,entry.multiplier)));
  const energy=totals.find(t=>t.key==='energy'),protein=totals.find(t=>t.key==='protein');
  return {energy:energy?.amount??null,protein:protein?.amount??null,count:day.length,partial:!!energy?.partial,estimated:day.some(e=>e.estimated)||!!energy?.estimated};
}
export function energyOut(metrics:DayMetrics|undefined,tdee:number|null,bmr:number|null=null):{value:number|null;label:string;source:'apple_health'|'manual'|'mixed'|'profile'|'unknown';partialDay:boolean;updatedAt?:string} {
  const healthActive=metrics?.healthSources ? Object.hasOwn(metrics.healthSources,'activeEnergy') : metrics?.source==='apple_health';
  // Daily active energy already includes recorded workouts. Use the full-day
  // resting estimate instead of potentially incomplete exported resting energy.
  if(healthActive&&metrics?.activeEnergy!==null&&metrics?.activeEnergy!==undefined) return {value:bmr===null?null:bmr+metrics.activeEnergy,label:'TDEE est.',source:bmr===null?'unknown':'mixed',partialDay:true,updatedAt:metrics.importedAt};
  if(metrics?.source==='manual'&&metrics.activeEnergy!==null&&metrics.restingEnergy!==null) return {value:metrics.activeEnergy+metrics.restingEnergy,label:metrics.completeDay?'Entered day':'Entered so far',source:'manual',partialDay:!metrics.completeDay};
  return {value:tdee,label:'TDEE est.',source:tdee===null?'unknown':'profile',partialDay:false};
}
