'use client';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useData } from '@/lib/data-store';
import s from './prototype.module.css';
export function NumberField({label,value,onChange,min,max,step='any',placeholder,className}:{label:string;value:number|null;onChange:(v:number|null)=>void;min?:number;max?:number;step?:number|string;placeholder?:string;className?:string}) {
  const [draft,setDraft]=useState(value==null?'':String(value));const focused=useRef(false);const id=useId();
  const numeric=Number(draft);const invalid=draft!==''&&(!Number.isFinite(numeric)||(min!==undefined&&numeric<min)||(max!==undefined&&numeric>max));
  useEffect(()=>{if(!focused.current)setDraft(value==null?'':String(value));},[value]);
  return <label className={`${s.field} ${className??''}`} htmlFor={id}>{label}<input id={id} className={s.input} type="text" inputMode={min!==undefined&&min<0?'text':'decimal'} autoComplete="off" value={draft} placeholder={placeholder} aria-invalid={invalid} aria-describedby={invalid?`${id}-error`:undefined} onFocus={()=>{focused.current=true;}} onBlur={()=>{focused.current=false;if(!invalid)setDraft(value==null?'':String(value));}} onChange={e=>{
    const text=e.target.value;setDraft(text);
    if(text===''){onChange(null);return;}
    const n=Number(text);if(Number.isFinite(n)&&(min===undefined||n>=min)&&(max===undefined||n<=max))onChange(n);
  }} data-step={step}/>{invalid&&<span id={`${id}-error`} style={{color:'#ffb6a5'}}>Not saved. Enter a number{min!==undefined?` ≥ ${min}`:''}{max!==undefined?` ≤ ${max}`:''}.</span>}</label>;
}
export function TextField({label,value,onChange,placeholder,multiline}:{label:string;value:string;onChange:(v:string)=>void;placeholder?:string;multiline?:boolean}) {
  return <label className={s.field}>{label}{multiline?<textarea className={s.input} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/>:<input className={s.input} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/>}</label>;
}
export function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}) {
  const ref=useRef<HTMLDialogElement>(null);const titleId=useId();
  useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>dialog?.close();},[]);
  return <dialog ref={ref} className={s.dialog} aria-labelledby={titleId} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===ref.current){const rect=ref.current.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)onClose();}}}><header className={s.header}><h2 id={titleId} className={s.sectionTitle}>{title}</h2><button type="button" className={s.button} onClick={onClose} aria-label="Close dialog">×</button></header>{children}</dialog>;
}
function shifted(date:string,days:number){const d=new Date(`${date}T12:00:00`);d.setDate(d.getDate()+days);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function DayNav({date,onChange,markedDates=[],label='Journal'}:{date:string;onChange:(v:string)=>void;markedDates?:string[];label?:string}) {
  const {today}=useData();
  const [open,setOpen]=useState(false);const [month,setMonth]=useState(date.slice(0,7));
  const d=new Date(`${date}T12:00:00`);const start=new Date(`${month}-01T12:00:00`);const count=new Date(start.getFullYear(),start.getMonth()+1,0).getDate();
  const changeMonth=(n:number)=>{const d=new Date(start);d.setMonth(d.getMonth()+n);setMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);};
  return <><nav className={s.toolbar} aria-label={`${label} date`}><button className={s.button} aria-label="Previous day" onClick={()=>onChange(shifted(date,-1))}>‹</button><button className={s.button} onClick={()=>{setMonth(date.slice(0,7));setOpen(true);}}>{d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}</button><button className={s.button} aria-label="Next day" onClick={()=>onChange(shifted(date,1))}>›</button>{date!==today&&<button className={s.button} onClick={()=>onChange(today)}>Today</button>}</nav>{open&&<Modal title="Choose a day" onClose={()=>setOpen(false)}><div className={s.header}><button className={s.button} aria-label="Previous month" onClick={()=>changeMonth(-1)}>‹</button><span>{start.toLocaleDateString('en-US',{month:'long',year:'numeric'})}</span><button className={s.button} aria-label="Next month" onClick={()=>changeMonth(1)}>›</button></div><div className={s.calendar}>{['S','M','T','W','T','F','S'].map((v,i)=><span key={i} style={{textAlign:'center'}}>{v}</span>)}{Array.from({length:start.getDay()},(_,i)=><span key={`empty${i}`}/>)}{Array.from({length:count},(_,i)=>{const day=`${month}-${String(i+1).padStart(2,'0')}`;return <button key={day} className={`${s.button} ${day===date?s.active:''}`} aria-label={`${day}${markedDates.includes(day)?', has entries':''}`} onClick={()=>{onChange(day);setOpen(false);}}>{i+1}{markedDates.includes(day)&&'·'}</button>;})}</div><label className={s.field} style={{marginTop:20}}>Jump to date<input className={s.input} type="date" value={date} onChange={e=>{if(e.target.value){onChange(e.target.value);setOpen(false);}}}/></label></Modal>}</>;
}
export function SaveStatus(){const {status,error,pendingCount,retry,resolveConflict}=useData();return <div className={s.status} role="status" aria-live="polite"><span>{status==='saved'?'Saved':status==='saving'?`Saving${pendingCount>1?` ${pendingCount} changes`:''}…`:status==='loading'?'Loading…':error}</span>{status==='error'||status==='offline'?<button className={`${s.button} ${s.small}`} onClick={retry}>Retry sync</button>:null}{status==='conflict'&&<><button className={`${s.button} ${s.small}`} onClick={()=>resolveConflict('local')}>Keep my draft</button><button className={`${s.button} ${s.small}`} onClick={()=>resolveConflict('server')}>Use server version</button></>}</div>;}
