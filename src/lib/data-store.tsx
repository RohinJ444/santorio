'use client';
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { defaultProfile, type BootstrapResponse, type Collection, type Collections } from './domain/types';
import { SyncEngine } from './sync-engine';
import { mergeDrafts, parseDraft } from './draft-storage';

export async function api<T>(url:string,init?:RequestInit):Promise<T> {
  const r=await fetch(url,{...init,headers:{'Content-Type':'application/json',...init?.headers},cache:'no-store'});
  const body=await r.json().catch(()=>({error:'Unexpected server response'}));
  if(!r.ok)throw new Error(body.error||`Request failed (${r.status})`);
  return body as T;
}
function dateInZone(zone:string) { return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
function useValue(engine:SyncEngine,user:{id:string;email:string},onSignOut:()=>void,storageKey:string) {
  const snapshot=useSyncExternalStore(engine.subscribe,engine.getSnapshot,engine.getSnapshot);
  const profile=snapshot.records.profiles.profile??defaultProfile();
  const [,setClock]=useState(0);
  useEffect(()=>{const id=setInterval(()=>setClock(v=>v+1),60000);return()=>clearInterval(id);},[]);
  const today=dateInZone(profile.timezone);
  return {...snapshot,user,profile,today,
    upsert:<K extends Collection>(collection:K,data:Collections[K])=>engine.upsert(collection,data),
    remove:(collection:Collection,id:string)=>engine.remove(collection,id),retry:engine.retry,resolveConflict:engine.resolveConflict,
    refresh:async()=>engine.bootstrap(await api<BootstrapResponse>('/api/bootstrap')),
    signOut:async()=>{if(engine.getSnapshot().pendingCount)throw new Error('Wait for your changes to sync before signing out.');await api('/api/auth/logout',{method:'POST'});localStorage.removeItem(storageKey);sessionStorage.removeItem(`santorio:${user.id}:session-draft`);onSignOut();}
  };
}
type Data=ReturnType<typeof useValue>;
const Context=createContext<Data|null>(null);
function Connected({engine,user,onSignOut,children,storageKey}:{engine:SyncEngine;user:{id:string;email:string};onSignOut:()=>void;children:ReactNode;storageKey:string}) {
  const value=useValue(engine,user,onSignOut,storageKey);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function DataProvider({user,onSignOut,children}:{user:{id:string;email:string};onSignOut:()=>void;children:ReactNode}) {
  const [engine,setEngine]=useState<SyncEngine|null>(null);
  const [error,setError]=useState('');
  const [journalId]=useState(()=>crypto.randomUUID());
  const storageKey=`santorio:${user.id}:journal:${journalId}`;
  useEffect(()=> {
    let cancelled=false;let release:()=>void=()=>{};let current:SyncEngine|undefined;
    const abort=new AbortController();
    const run=async()=>{
      const prefix=`santorio:${user.id}:journal:`;
      const fallbackKey=`santorio:${user.id}:session-draft`;
      let saved=parseDraft(navigator.locks?localStorage.getItem(storageKey):sessionStorage.getItem(fallbackKey));
      if(!navigator.locks)saved.queue=saved.queue.map(job=>job.attempted?job:{...job,mutationId:crypto.randomUUID()});
      const recover=async()=>{
        // An active tab holds only its own journal lock. Closed/crashed journals are recoverable.
        const keys=Object.keys(localStorage).filter(key=>key.startsWith(prefix)&&key!==storageKey);
        keys.push(`santorio:${user.id}`); // Migrate the original single-tab draft format once.
        for(const key of keys){
          const claim=()=>{
            const raw=localStorage.getItem(key);if(!raw)return;
            saved=mergeDrafts(saved,parseDraft(raw));
            localStorage.setItem(storageKey,JSON.stringify(saved));
            localStorage.removeItem(key); // Only after the destination copy was stored successfully.
          };
          if(navigator.locks){const lockName=key===`santorio:${user.id}`?`santorio-writer:${user.id}`:key;await navigator.locks.request(lockName,{ifAvailable:true},lock=>{if(lock&&!cancelled)claim();});}
          // Without Web Locks, other tabs may still be editing these journals. Leave them intact.
        }
      };
      if(navigator.locks)await navigator.locks.request(`santorio-recovery:${user.id}`,{signal:abort.signal},recover);
      // Older browsers recover only their own sessionStorage draft, never claim another tab.
      if(cancelled)return;
      current=new SyncEngine(data=>{const serialized=JSON.stringify(data);localStorage.setItem(storageKey,serialized);if(!navigator.locks)sessionStorage.setItem(fallbackKey,serialized);},async job=>{
        const r=await fetch(`/api/records/${job.collection}/${encodeURIComponent(job.id)}`,{method:job.data===null?'DELETE':'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...(job.data===null?{}:{data:job.data}),expectedVersion:job.expectedVersion,mutationId:job.mutationId})});
        const body=await r.json();if(body.issues?.length)body.error=body.issues.map((i:{path:string[];message:string})=>`${i.path.join('.')}: ${i.message}`).join('; ');return {ok:r.ok,status:r.status,...(r.ok?{record:body}:body)};
      });
      current.hydrate(saved);
      try {current.bootstrap(await api<BootstrapResponse>('/api/bootstrap',{signal:abort.signal}));} catch(e){
        if(cancelled)return;
        if(!saved.server.length&&!saved.queue.length)throw e;
        current.fail(`Could not load the server: ${(e as Error).message}. Local drafts are available.`);
      }
      if(cancelled)return;
      setEngine(current);
      const online=()=>current?.retry();window.addEventListener('online',online);
      const visible=()=>{if(document.visibilityState==='visible'&&current?.getSnapshot().pendingCount===0)void api<BootstrapResponse>('/api/bootstrap').then(data=>current?.bootstrap(data)).catch(()=>{});};
      document.addEventListener('visibilitychange',visible);
      await new Promise<void>(resolve=>{release=resolve;if(cancelled)resolve();});
      window.removeEventListener('online',online);document.removeEventListener('visibilitychange',visible);
    };
    // Queue the same document's Strict Mode setup/cleanup instead of spuriously rejecting it.
    const task=navigator.locks?navigator.locks.request(storageKey,{signal:abort.signal},()=>cancelled?undefined:run()):run();
    void task.catch(e=>{if(!cancelled)setError(`Could not open your journal: ${e.message}. Saved browser drafts have been retained.`);});
    return()=>{cancelled=true;abort.abort();current?.stop();release();};
  },[user.id,storageKey]);
  if(error)return <main style={{padding:32,maxWidth:600,margin:'auto'}}><h1>Connection needed</h1><p>{error}</p><button onClick={()=>location.reload()}>Reload</button></main>;
  if(!engine)return <main style={{padding:32}}>Opening your journal…</main>;
  return <Connected engine={engine} storageKey={storageKey} user={user} onSignOut={onSignOut}>{children}</Connected>;
}
export function useData(){const data=useContext(Context);if(!data)throw new Error('useData requires DataProvider');return data;}
