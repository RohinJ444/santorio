import type { StoredRecord } from './domain/types';
import type { Persisted } from './sync-engine';

/** Merge crash-recovered journals without duplicating retried mutations. Versions never go backwards. */
export function mergeDrafts(...journals:Persisted[]):Persisted {
 const server=new Map<string,StoredRecord>();const jobs=new Map<string,Persisted['queue'][number]>();
 for(const journal of journals){
  for(const record of journal.server){const key=`${record.collection}:${record.id}`;if((server.get(key)?.version??0)<=record.version)server.set(key,record);}
  for(const job of journal.queue)if(!jobs.has(job.mutationId))jobs.set(job.mutationId,job);
 }
 return {server:[...server.values()],queue:[...jobs.values()]};
}
export function parseDraft(raw:string|null):Persisted {
 if(!raw)return {server:[],queue:[]};
 const parsed=JSON.parse(raw);
 if(!Array.isArray(parsed.server)||!Array.isArray(parsed.queue))throw new Error('Unrecognized local journal format');
 return parsed;
}
