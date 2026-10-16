import { describe, expect, it } from 'vitest';
import { ageInYears, bodyEstimates, dailyIntake, energyOut, latestMeasurement } from './home';
import { defaultProfile, type DayMetrics, type Measurement } from './types';
const measurement:Measurement={id:'weight',date:'2026-10-15',kind:'weight_kg',value:80,source:'manual',recordedAt:'2026-10-15T08:00:00Z'};
const profile={...defaultProfile(),birthday:'1996-10-17',heightCm:180,sex:'male' as const,activity:'light' as const};
describe('home real-data summaries',()=>{
  it('does not calculate body estimates from absent or guessed profile fields',()=>{
    expect(bodyEstimates(defaultProfile(),[],'2026-10-16').tdee).toBeNull();
    expect(bodyEstimates({...profile,sex:null},[measurement],'2026-10-16').tdee).toBeNull();
    expect(bodyEstimates(profile,[],'2026-10-16').tdee).toBeNull();
  });
  it('uses age on the selected day and the latest past measurement',()=>{
    expect(ageInYears('1996-10-17','2026-10-16')).toBe(29);
    expect(ageInYears('1996-10-17','2026-10-17')).toBe(30);
    expect(ageInYears('2026-02-30','2026-10-17')).toBeNull();
    expect(latestMeasurement([measurement,{...measurement,id:'future',date:'2026-10-20',value:100}],'weight_kg','2026-10-16')?.value).toBe(80);
    expect(bodyEstimates(profile,[measurement],'2026-10-16').bmr).toBe(1785);
  });
  it('uses all-day active plus resting without double counting workouts or applying an activity factor',()=>{
    const metrics:DayMetrics={id:'2026-10-16',date:'2026-10-16',steps:7000,waterL:2,activeEnergy:500,restingEnergy:1200,exerciseMinutes:45,source:'apple_health',completeDay:false};
    expect(energyOut(metrics,2500)).toMatchObject({value:1700,label:'Health so far',partialDay:true});
    expect(energyOut({...metrics,completeDay:true},2500)).toMatchObject({value:1700,partialDay:false});
    expect(energyOut({...metrics,activeEnergy:null},2500)).toMatchObject({value:2500,source:'profile'});
  });
  it('does not fill unlogged intake with zeros or samples',()=>{expect(dailyIntake([],'2026-10-16')).toMatchObject({energy:null,protein:null,count:0});});
  it('keeps zero readings distinct from unknown estimates when all goals are zero',()=>{
    const zeroProfile={...defaultProfile(),goals:{balanceTarget:0,proteinG:0,steps:0,waterL:0}};
    expect(bodyEstimates(zeroProfile,[],'2026-10-16')).toMatchObject({bmr:null,tdee:null,weightKg:null,heightCm:null});
    expect(energyOut(undefined,null)).toMatchObject({value:null,source:'unknown'});
    const metric:DayMetrics={id:'2026-10-16',date:'2026-10-16',steps:0,waterL:0,activeEnergy:0,restingEnergy:0,exerciseMinutes:0,source:'manual'};
    expect(energyOut(metric,null)).toMatchObject({value:0,source:'manual',partialDay:true});
  });
});
