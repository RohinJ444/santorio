'use client';

import { useEffect, useState } from 'react';
import { Archive, ArchiveRestore, Star } from 'lucide-react';
import { api, useData } from '@/lib/data-store';
import { normalizedTimezone } from '@/lib/domain/settings';
import { displayNumber } from '@/lib/domain/workouts';
import { newId, type DayMetrics, type Location } from '@/lib/domain/types';
import { DayNav, NumberField, SaveStatus, ViewHeader } from './controls';
import { BalanceRows, BirthdayRow, EstimateRows, GoalRows, HeightRow, Row, WeightRows, useProfilePatch } from './ProfileParts';
import s from './prototype.module.css';
import st from './settings.module.css';
import HealthConnection from './HealthConnection';

type Connection = { id:string;client_name:string;scope:string;created_at:string;last_used_at:string|null };

function ConnectedApps() {
  const [connections,setConnections]=useState<Connection[]>([]);
  const [state,setState]=useState<'loading'|'ready'|'error'>('loading');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState<string|null>(null);
  useEffect(()=>{let active=true;api<{connections:Connection[]}>('/api/oauth/connections').then(data=>{if(active){setConnections(data.connections);setState('ready');}}).catch(e=>{if(active){setError(e.message);setState('error');}});return()=>{active=false;};},[]);
  const revoke=async(id:string)=>{setBusy(id);setError('');try{await api('/api/oauth/connections',{method:'DELETE',body:JSON.stringify({id})});setConnections(prev=>prev.filter(c=>c.id!==id));}catch(e){setError((e as Error).message);}finally{setBusy(null);}};
  return <><h2 className={st.groupTitle}>Connected AI apps</h2><section className={st.group}>{state==='loading'?<Row label="Loading connections…"/>:null}{state==='ready'&&!connections.length?<Row label="No connected apps" hint="Connect ChatGPT to your food, exercise and workout library via the MCP."/>:null}{connections.map(connection=><Row key={connection.id} label={connection.client_name} hint={`${connection.scope.replaceAll(' ',' · ')}${connection.last_used_at?` · used ${new Date(connection.last_used_at).toLocaleDateString()}`:''}`}><button type="button" className={`${st.pill} ${st.ghost}`} disabled={busy===connection.id} onClick={()=>void revoke(connection.id)}>{busy===connection.id?'Revoking…':'Revoke'}</button></Row>)}{error?<p className={st.error} role="alert">{error}</p>:null}</section></>;
}

export default function SettingsScreen() {
  const {profile,records,today,upsert,remove,signOut,user}=useData();
  const patch=useProfilePatch();
  const [timezone,setTimezone]=useState(profile.timezone);
  const [timezoneError,setTimezoneError]=useState('');
  const [locationName,setLocationName]=useState('');
  const [locationError,setLocationError]=useState('');
  const [editingLocation,setEditingLocation]=useState<string|null>(null);
  const [showArchived,setShowArchived]=useState(false);
  const [metricsDate,setMetricsDate]=useState(today);
  const [error,setError]=useState('');
  const [signingOut,setSigningOut]=useState(false);
  const measurements=Object.values(records.measurements);
  const locations=Object.values(records.locations).sort((a,b)=>a.name.localeCompare(b.name));
  const metric:DayMetrics=records.metrics[metricsDate]??{id:metricsDate,date:metricsDate,steps:null,waterL:0,activeEnergy:null,restingEnergy:null,exerciseMinutes:null,source:'manual'};
  const imported=metric.source==='apple_health'||!!Object.keys(metric.healthSources??{}).length;
  const metricSource=(field:'steps'|'activeEnergy'|'restingEnergy'|'exerciseMinutes')=>metric.healthSources?(metric.healthSources[field]??'Manual entry'):metric.source==='apple_health'?'Apple Health':'Manual entry';
  const setMetric=(field:'steps'|'activeEnergy'|'restingEnergy'|'exerciseMinutes',value:number|null)=>upsert('metrics',{...metric,[field]:value,source:'manual'});
  const saveTimezone=()=>{const zone=normalizedTimezone(timezone);if(zone){patch({timezone:zone});setTimezone(zone);setTimezoneError('');}else setTimezoneError('Enter a valid time zone, such as America/Los_Angeles.');};
  const addLocation=()=>{const name=locationName.trim();if(!name){setLocationError('Enter a location name.');return;}if(locations.some(location=>!location.archived&&location.name.trim().toLowerCase()===name.toLowerCase())){setLocationError('That location is already in your list.');return;}upsert('locations',{id:newId(),name,notes:''});setLocationName('');setLocationError('');};
  const archiveLocation=(location:Location)=>{upsert('locations',{...location,archived:!location.archived});if(!location.archived&&profile.defaultLocationId===location.id)patch({defaultLocationId:undefined});};
  const logout=async()=>{setSigningOut(true);setError('');try{await signOut();}catch(e){setError((e as Error).message);setSigningOut(false);}};
  const weights=measurements.filter(m=>m.kind==='weight_kg').sort((a,b)=>b.date.localeCompare(a.date)||b.recordedAt.localeCompare(a.recordedAt));
  const shown=(kg:number)=>`${(kg*(profile.weightUnit==='lb'?1/.45359237:1)).toFixed(1)} ${profile.weightUnit}`;
  return <main className={`${s.page} ${st.screen}`}>
    <ViewHeader label="Settings"><SaveStatus/></ViewHeader>
    <div className={st.groups}>
      <h2 className={st.groupTitle}>Profile</h2>
      <section className={st.group}>
        <Row label="Name"><input className={`${st.input} ${st.text}`} value={profile.name} onChange={e=>patch({name:e.target.value})} placeholder="Your name" aria-label="Name"/></Row>
        <BirthdayRow/>
        <Row label="Time zone"><input className={`${st.input} ${st.text}`} list="timezone-options" value={timezone} aria-invalid={!!timezoneError} onChange={e=>setTimezone(e.target.value)} onBlur={saveTimezone} aria-label="Time zone"/><datalist id="timezone-options">{['America/Los_Angeles','America/Denver','America/Chicago','America/New_York','Europe/London','Europe/Paris','Asia/Kolkata','Asia/Singapore','Asia/Tokyo','Australia/Sydney','UTC'].map(zone=><option key={zone}>{zone}</option>)}</datalist></Row>
        {timezoneError?<p className={st.error} role="alert">{timezoneError}</p>:null}
      </section>
      <h2 className={st.groupTitle}>Body</h2>
      <section className={st.group}>
        <WeightRows/>
        {weights.length?<details className={st.history}><summary className={st.note}>Weight history</summary>{weights.map(m=><p key={m.id}><span>{shown(m.value)}</span><small>{m.date} · {m.source==='apple_health'?'Apple Health':<button type="button" onClick={()=>remove('measurements',m.id)}>manual · remove</button>}</small></p>)}</details>:null}
        <HeightRow/>
        <EstimateRows/>
      </section>
      <h2 className={st.groupTitle}>Daily goals</h2>
      <section className={st.group}><BalanceRows/><GoalRows/></section>
      <h2 className={st.groupTitle}>Workout locations</h2>
      <section className={st.group}>
        {locations.filter(l=>showArchived||!l.archived).map(location=><div key={location.id}><div className={st.location}>
          <input className={`${st.input} ${st.text}`} style={{textAlign:'left',width:'auto'}} value={location.name} onChange={e=>upsert('locations',{...location,name:e.target.value})} aria-label="Location name" onFocus={()=>setEditingLocation(location.id)}/>
          {!location.archived?<button type="button" className={st.star} aria-pressed={profile.defaultLocationId===location.id} aria-label={`Make ${location.name} the default`} onClick={()=>patch({defaultLocationId:profile.defaultLocationId===location.id?undefined:location.id})}><Star size={16} fill={profile.defaultLocationId===location.id?'currentColor':'none'}/></button>:null}
          <button type="button" className={st.star} aria-label={location.archived?`Restore ${location.name}`:`Archive ${location.name}`} onClick={()=>archiveLocation(location)}>{location.archived?<ArchiveRestore size={16}/>:<Archive size={16}/>}</button>
        </div>{editingLocation===location.id||location.notes?<input className={`${st.input} ${st.text}`} style={{textAlign:'left',width:'100%',height:30,fontSize:13,marginBottom:6}} value={location.notes??''} onChange={e=>upsert('locations',{...location,notes:e.target.value})} placeholder="Notes" aria-label={`${location.name} notes`}/>:null}</div>)}
        <div className={st.location}><input className={st.input} style={{flex:1}} value={locationName} onChange={e=>setLocationName(e.target.value)} placeholder="New location" aria-label="New location" onKeyDown={e=>{if(e.key==='Enter')addLocation();}}/><button type="button" className={st.pill} onClick={addLocation}>Add</button></div>
        {locationError?<p className={st.error} role="alert">{locationError}</p>:null}
        {locations.some(l=>l.archived)?<button type="button" className={st.note} onClick={()=>setShowArchived(!showArchived)}>{showArchived?'Hide archived':'Show archived'}</button>:null}
      </section>
      <p className={st.note} style={{margin:'-10px 4px 0'}}>★ marks the default for new workouts.</p>
      <HealthConnection/>
      <section className={st.group}><details><summary>Daily activity values</summary>
        <DayNav date={metricsDate} onChange={setMetricsDate} markedDates={Object.keys(records.metrics)} label="Daily activity"/>
        {imported?<>{(['steps','activeEnergy','restingEnergy','exerciseMinutes'] as const).map(field=><Row key={field} label={{steps:'Steps',activeEnergy:'Active energy',restingEnergy:'Resting energy',exerciseMinutes:'Exercise'}[field]} hint={metric[field]!==null?metricSource(field):undefined}><span className={st.readout}>{displayNumber(metric[field])}<i> {field==='steps'?'':field==='exerciseMinutes'?'min':'kcal'}</i></span></Row>)}<p className={st.note}>Imported {metric.importedAt?new Date(metric.importedAt).toLocaleString():''}. Shown as received.</p></>:<>
          {(['steps','activeEnergy','restingEnergy','exerciseMinutes'] as const).map(field=><Row key={field} label={{steps:'Steps',activeEnergy:'Active energy',restingEnergy:'Resting energy',exerciseMinutes:'Exercise'}[field]}><span className={st.with}><NumberField compact className={`${st.input} ${st.short}`} label={field} value={metric[field]} onChange={value=>setMetric(field,value)} min={0} max={field==='exerciseMinutes'?1440:undefined}/><i>{field==='steps'?'':field==='exerciseMinutes'?'min':'kcal'}</i></span></Row>)}
          <Row label="Covers the whole day"><input type="checkbox" checked={!!metric.completeDay} onChange={e=>upsert('metrics',{...metric,completeDay:e.target.checked})} aria-label="These values cover the complete day"/></Row>
          <p className={st.note}>Manual values until Apple Health is connected. Leave unknowns blank.</p>
        </>}
      </details></section>
      <ConnectedApps/>
      {error?<p className={s.error} role="alert">{error}</p>:null}
      <div className={st.footer}><span>Signed in as {user.email}</span><button type="button" className={`${st.pill} ${st.ghost}`} disabled={signingOut} onClick={()=>void logout()}>{signingOut?'Signing out…':'Sign out'}</button></div>
    </div>
  </main>;
}
