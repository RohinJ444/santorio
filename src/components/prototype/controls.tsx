'use client';
import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useData } from '@/lib/data-store';
import { fmtDay, relLabel } from '@/lib/dates';
import { ChevronLeft, ChevronRight, Close, Figure } from '../ui/icons';
import s from './prototype.module.css';

type NumberProps = {label:string;value:number|null;onChange:(v:number|null)=>void;min?:number;max?:number;step?:number|string;placeholder?:string;className?:string;
  /** Input only, labelled for screen readers: for dense rows such as sets. */ compact?:boolean};
export function NumberField({label,value,onChange,min,max,step='any',placeholder,className,compact}:NumberProps) {
  const [draft,setDraft]=useState(value==null?'':String(value));const focused=useRef(false);const id=useId();
  const numeric=Number(draft);const invalid=draft!==''&&(!Number.isFinite(numeric)||(min!==undefined&&numeric<min)||(max!==undefined&&numeric>max));
  useEffect(()=>{if(!focused.current)setDraft(value==null?'':String(value));},[value]);
  const input=<input id={id} className={compact?className:s.input} type="text" inputMode={min!==undefined&&min<0?'text':'decimal'} enterKeyHint="next" autoComplete="off" value={draft} placeholder={placeholder}
    aria-label={compact?label:undefined} aria-invalid={invalid} aria-describedby={invalid&&!compact?`${id}-error`:undefined} title={invalid?`Not saved. Enter a number${min!==undefined?` ≥ ${min}`:''}${max!==undefined?` ≤ ${max}`:''}.`:undefined}
    onFocus={e=>{focused.current=true;e.currentTarget.select();}} onBlur={()=>{focused.current=false;if(!invalid)setDraft(value==null?'':String(value));}} onChange={e=>{
    const text=e.target.value;setDraft(text);
    if(text===''){onChange(null);return;}
    const n=Number(text);if(Number.isFinite(n)&&(min===undefined||n>=min)&&(max===undefined||n<=max))onChange(n);
  }} data-step={step}/>;
  if(compact)return input;
  return <label className={`${s.field} ${className??''}`} htmlFor={id}>{label}{input}{invalid&&<span id={`${id}-error`} style={{color:'#ffb6a5'}}>Not saved. Enter a number{min!==undefined?` ≥ ${min}`:''}{max!==undefined?` ≤ ${max}`:''}.</span>}</label>;
}
export function TextField({label,value,onChange,placeholder,multiline}:{label:string;value:string;onChange:(v:string)=>void;placeholder?:string;multiline?:boolean}) {
  return <label className={s.field}>{label}{multiline?<textarea className={s.input} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/>:<input className={s.input} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/>}</label>;
}
export function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}) {
  const ref=useRef<HTMLDialogElement>(null);const titleId=useId();
  useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>dialog?.close();},[]);
  return <dialog ref={ref} className={s.dialog} aria-labelledby={titleId} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===ref.current){const rect=ref.current.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)onClose();}}}><header className={s.dialogHead}><h2 id={titleId} className={s.dialogTitle}>{title}</h2><button type="button" className={s.close} onClick={onClose} aria-label="Close dialog"><Close size={16}/></button></header>{children}</dialog>;
}
/** A row of mutually exclusive choices: tabs, units, modes. */
export function Segmented<T extends string>({options,value,onChange,label,className}:{options:{value:T;label:ReactNode}[];value:T;onChange:(value:T)=>void;label:string;className?:string}) {
  return <div className={`${s.tabs} ${className??''}`} role="group" aria-label={label}>{options.map(option=><button type="button" key={option.value} aria-pressed={option.value===value} onClick={()=>onChange(option.value)}>{option.label}</button>)}</div>;
}
function shifted(date:string,days:number){const d=new Date(`${date}T12:00:00`);d.setDate(d.getDate()+days);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
/** ‹ Fri, Oct 16 › with a relative label. Tap the date for the month calendar. */
export function DayNav({date,onChange,markedDates=[],label='Journal'}:{date:string;onChange:(v:string)=>void;markedDates?:string[];label?:string}) {
  const {today}=useData();
  const [open,setOpen]=useState(false);const [month,setMonth]=useState(date.slice(0,7));const [dir,setDir]=useState(0);
  const start=new Date(`${month}-01T12:00:00`);const count=new Date(start.getFullYear(),start.getMonth()+1,0).getDate();
  const marked=new Set(markedDates);
  const changeMonth=(n:number)=>{const d=new Date(start);d.setMonth(d.getMonth()+n);setMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);};
  const go=(next:string)=>{setDir(next<date?-1:1);onChange(next);};
  return <><nav className={s.dateNav} aria-label={`${label} date`}>
    <button type="button" className={s.dateBtn} aria-label="Previous day" onClick={()=>go(shifted(date,-1))}><ChevronLeft size={22}/></button>
    <button type="button" className={s.dateLabel} aria-label={`${fmtDay(date)}. Choose a day`} onClick={()=>{setMonth(date.slice(0,7));setOpen(true);}}>
      <AnimatePresence initial={false} mode="popLayout" custom={dir}>
        <motion.span key={date} className={s.dateMain} custom={dir} variants={{enter:(d:number)=>({x:d*36,opacity:0}),center:{x:0,opacity:1},exit:(d:number)=>({x:d*-36,opacity:0})}} initial="enter" animate="center" exit="exit" transition={{duration:0.26,ease:[0.2,0.7,0.2,1]}}>{fmtDay(date)}</motion.span>
      </AnimatePresence>
      <span className={s.dateSub}>{relLabel(date,today)}</span>
    </button>
    <button type="button" className={s.dateBtn} aria-label="Next day" onClick={()=>go(shifted(date,1))}><ChevronRight size={22}/></button>
  </nav>
  {open&&<Modal title="Choose a day" onClose={()=>setOpen(false)}>
    <div className={s.calHead}><button type="button" className={s.dateBtn} aria-label="Previous month" onClick={()=>changeMonth(-1)}><ChevronLeft size={20}/></button><span>{start.toLocaleDateString('en-US',{month:'long',year:'numeric'})}</span><button type="button" className={s.dateBtn} aria-label="Next month" onClick={()=>changeMonth(1)}><ChevronRight size={20}/></button></div>
    <div className={s.calendar}>{['S','M','T','W','T','F','S'].map((v,i)=><span key={i}>{v}</span>)}{Array.from({length:start.getDay()},(_,i)=><i key={`empty${i}`}/>)}{Array.from({length:count},(_,i)=>{const day=`${month}-${String(i+1).padStart(2,'0')}`;return <button type="button" key={day} className={s.day} data-marked={marked.has(day)} data-today={day===today} aria-current={day===date?'date':undefined} aria-label={`${day}${marked.has(day)?', has entries':''}`} onClick={()=>{go(day);setOpen(false);}}>{i+1}</button>;})}</div>
    {date!==today?<button type="button" className={s.button} style={{width:'100%',marginTop:14}} onClick={()=>{go(today);setOpen(false);}}>Back to today</button>:null}
  </Modal>}</>;
}
export function SaveStatus(){const {status,error,pendingCount,retry,resolveConflict}=useData();return <div className={s.status} data-state={status} role="status" aria-live="polite"><span>{status==='saved'?'Saved':status==='saving'?`Saving${pendingCount>1?` ${pendingCount}`:''}…`:status==='loading'?'Loading…':error}</span>{status==='error'||status==='offline'?<button className={`${s.button} ${s.small}`} onClick={retry}>Retry sync</button>:null}{status==='conflict'&&<><button className={`${s.button} ${s.small}`} onClick={()=>resolveConflict('local')}>Keep my draft</button><button className={`${s.button} ${s.small}`} onClick={()=>resolveConflict('server')}>Use server version</button></>}</div>;}
/** Back to the body, the section key, an optional action, then the day. Shared by every journal screen. */
export function ViewHeader({q,label,action,children}:{q?:'in'|'out';label:string;action?:ReactNode;children?:ReactNode}) {
  const router=useRouter();
  return <header className={s.viewHead}><div className={s.viewRow}>
    <button type="button" className={s.iconBtn} onClick={()=>router.push('/')} aria-label="Back to body"><Figure size={20}/></button>
    <h1 className={s.viewTitle}>{q?<span className={s.qKey}>Q<sub>{q}</sub></span>:null}{label}</h1>
    {action??<span/>}
  </div>{children}</header>;
}
