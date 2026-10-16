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
  it('uses estimated BMR plus daily active energy without summing workout or imported resting calories',()=>{
    const metrics:DayMetrics={id:'2026-10-16',date:'2026-10-16',steps:7000,waterL:2,activeEnergy:500,restingEnergy:800,exerciseMinutes:45,source:'apple_health',completeDay:false,healthSources:{activeEnergy:'Watch',restingEnergy:'Watch'}};
    expect(energyOut(metrics,2500,1700)).toMatchObject({value:2200,label:'TDEE est.',partialDay:true,source:'mixed'});
    expect(energyOut({...metrics,restingEnergy:9999,completeDay:true},2500,1700).value).toBe(2200);
    expect(energyOut({...metrics,restingEnergy:null},2500,1700).value).toBe(2200);
    expect(energyOut({...metrics,activeEnergy:0},2500,1700).value).toBe(1700);
    expect(energyOut({...metrics,activeEnergy:null},2500,1700)).toMatchObject({value:2500,source:'profile'});
    expect(energyOut(metrics,null,null)).toMatchObject({value:null,source:'unknown'});
  });
  it('does not confuse imported steps with imported active energy',()=>{
    const metrics:DayMetrics={id:'2026-10-16',date:'2026-10-16',steps:7000,waterL:2,activeEnergy:500,restingEnergy:800,exerciseMinutes:45,source:'apple_health',healthSources:{steps:'Watch'}};
    expect(energyOut(metrics,2500,1700)).toMatchObject({value:2500,source:'profile'});
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
