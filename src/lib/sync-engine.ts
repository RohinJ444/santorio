import { emptyRecords, type BootstrapResponse, type Collection, type Collections, type RecordsState, type StoredRecord } from './domain/types';

export type SaveState = 'loading'|'saved'|'saving'|'offline'|'error'|'conflict';
type Job = { collection: Collection; id: string; data: Collections[Collection]|null; expectedVersion: number; mutationId: string; attempted: boolean };
export type SyncSnapshot = { records: RecordsState; status: SaveState; error: string|null; pendingCount: number };
export type Persisted = { server: StoredRecord[]; queue: Job[] };
export type Transport = (job: Job) => Promise<{ ok: boolean; status: number; record?: StoredRecord; error?: string; current?: StoredRecord|null }>;
/** One writer per browser (Web Locks in DataProvider), optimistic versions across devices. */
export class SyncEngine {
  private server = new Map<string, StoredRecord>();
  private queue: Job[] = [];
  private listeners = new Set<() => void>();
  private running = false;
  private stopped = false;
  private paused = false;
  private conflict: StoredRecord|null|undefined;
  private rejectedKey:string|null=null;
  private timer?: ReturnType<typeof setTimeout>;
  private snapshot: SyncSnapshot = { records: emptyRecords(), status: 'loading', error: null, pendingCount: 0 };
  constructor(private persist: (data: Persisted) => void, private transport: Transport, private uuid = () => crypto.randomUUID()) {}
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getSnapshot = () => this.snapshot;
  hydrate(saved: Persisted|null) {
    if (saved) { this.server = new Map(saved.server.map(r => [this.key(r.collection,r.id),r])); this.queue = saved.queue; }
    this.emit('loading',null);
  }
  bootstrap(data: BootstrapResponse) {
    if(this.stopped)return;
    for(const record of data.records){const key=this.key(record.collection,record.id);if((this.server.get(key)?.version??0)<=record.version)this.server.set(key,record);}
    if(!this.save())return; this.paused=false; this.emit(this.queue.length?'saving':'saved',null); void this.flush();
  }
  private key(collection: Collection,id: string) { return `${collection}:${id}`; }
  private view() {
    const records = emptyRecords();
    for(const r of this.server.values()) if(!r.deleted) (records[r.collection] as Record<string,Collections[Collection]>)[r.id]=r.data;
    for(const j of this.queue) {
      if(j.data===null) delete records[j.collection][j.id];
      else (records[j.collection] as Record<string,Collections[Collection]>)[j.id]=j.data;
    }
    return records;
  }
  private emit(status:SaveState,error:string|null) {
    this.snapshot={ records:this.view(),status,error,pendingCount:this.queue.length };
    this.listeners.forEach(fn=>fn());
  }
  private save() {
    try { this.persist({server:[...this.server.values()],queue:this.queue}); return true; }
    catch { this.paused=true; this.emit('error','This browser could not save your draft locally. Keep this page open and free some browser storage, then retry.'); return false; }
  }
  upsert<K extends Collection>(collection:K,data:Collections[K]) { this.enqueue(collection,data.id,structuredClone(data)); }
  remove(collection:Collection,id:string) { this.enqueue(collection,id,null); }
  private enqueue(collection:Collection,id:string,data:Collections[Collection]|null) {
    const repairing=this.rejectedKey===this.key(collection,id);
    const matches=this.queue.filter(j=>j.collection===collection&&j.id===id);
    const last=matches.at(-1);
    if(last&&!last.attempted) last.data=data;
    else this.queue.push({collection,id,data,expectedVersion:last?last.expectedVersion+1:(this.server.get(this.key(collection,id))?.version??0),mutationId:this.uuid(),attempted:false});
    if(repairing){this.paused=false;this.rejectedKey=null;}
    if(!this.save())return;
    this.emit(this.paused?this.snapshot.status:'saving',this.paused?this.snapshot.error:null);
    clearTimeout(this.timer); this.timer=setTimeout(()=>void this.flush(),400);
  }
  async flush() {
    if(this.running||this.paused||this.stopped)return;
    this.running=true;
    try {
      while(this.queue.length&&!this.stopped&&!this.paused) {
        const job=this.queue[0]; job.attempted=true;
        if(!this.save())break;
        let result:Awaited<ReturnType<Transport>>;
        try { result=await this.transport(structuredClone(job)); }
        catch { this.paused=true; this.emit('offline','Saved on this device. Waiting to sync.'); break; }
        if(this.stopped)break;
        if(!result.ok) {
          this.paused=true;
          if(result.status===409) { this.conflict=result.current??null; this.emit('conflict','This record changed elsewhere. Your draft is still saved here. Choose which version to keep.'); }
          else {
            if(result.status===400||result.status===422){
              const related=this.queue.filter(j=>j.collection===job.collection&&j.id===job.id);
              const latest=related.at(-1)!;
              this.queue=this.queue.filter(j=>j.collection!==job.collection||j.id!==job.id);
              this.queue.unshift({...latest,expectedVersion:job.expectedVersion,mutationId:this.uuid(),attempted:false});
              this.rejectedKey=this.key(job.collection,job.id);this.save();
              if(related.length>1){this.paused=false;this.rejectedKey=null;continue;}
            }
            this.emit('error',result.error??'Could not save. Your draft is still on this device.');
          }
          break;
        }
        if(!result.record) { this.paused=true; this.emit('error','The server returned an invalid save response. Your draft is preserved.'); break; }
        const savedKey=this.key(job.collection,job.id);
        if((this.server.get(savedKey)?.version??0)<=result.record.version)this.server.set(savedKey,result.record);
        this.queue.shift();
        if(!this.save())break;
        this.emit(this.queue.length?'saving':'saved',null);
      }
    } finally { this.running=false; }
  }
  retry=()=> { if(this.conflict!==undefined)return; this.paused=false; if(this.save()){this.emit(this.queue.length?'saving':'saved',null);void this.flush();} };
  fail(message:string) { this.emit('error',message); }
  resolveConflict=(choice:'local'|'server')=> {
    if(this.conflict===undefined||!this.queue.length)return;
    const first=this.queue[0];
    const related=this.queue.filter(j=>j.collection===first.collection&&j.id===first.id);
    const latest=related.at(-1)!;
    this.queue=this.queue.filter(j=>j.collection!==first.collection||j.id!==first.id);
    const key=this.key(first.collection,first.id);
    if(this.conflict)this.server.set(key,this.conflict);else this.server.delete(key);
    if(choice==='local') this.queue.unshift({...latest,expectedVersion:this.conflict?.version??0,mutationId:this.uuid(),attempted:false});
    this.conflict=undefined;this.paused=false;
    if(this.save()){this.emit(this.queue.length?'saving':'saved',null);void this.flush();}
  };
  stop() { this.stopped=true;clearTimeout(this.timer); }
}
