import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Collection, StoredRecord } from '@/lib/domain/types';
import { idSchema, validateRecord } from '@/lib/domain/schema';
import { hash } from './security';
import { HttpError } from './http';
type Row = {collection:Collection;id:string;data:StoredRecord['data'];version:number;updated_at:string;deleted:boolean};
export function stored(row:Row):StoredRecord {return {collection:row.collection,id:row.id,data:row.data,version:Number(row.version),updatedAt:row.updated_at,deleted:row.deleted};}
export async function listRecords(db:SupabaseClient,ownerId:string,collection?:Collection) {
  const rows:StoredRecord[]=[];
  for(let offset=0;;offset+=1000) {
    let query=db.from('records').select('collection,id,data,version,updated_at,deleted').eq('owner_id',ownerId).order('collection').order('id').range(offset,offset+999);
    if(collection) query=query.eq('collection',collection);
    const {data,error}=await query;
    if(error) throw new HttpError(503,'Unable to load your data');
    rows.push(...(data as Row[]).map(stored));
    if(data.length<1000) return rows;
  }
}
export async function getRecord(db:SupabaseClient,ownerId:string,collection:Collection,id:string) {
  const {data,error}=await db.from('records').select('collection,id,data,version,updated_at,deleted').eq('owner_id',ownerId).eq('collection',collection).eq('id',id).maybeSingle();
  if(error) throw new HttpError(503,'Unable to load this record');
  return data ? stored(data as Row) : null;
}
export async function saveRecord(db:SupabaseClient,ownerId:string,collection:Collection,id:string,value:unknown,expectedVersion:number,mutationId:string,deleted=false) {
  idSchema.parse(id);
  const data=deleted ? null : validateRecord(collection,value);
  if(data&&data.id!==id) throw new HttpError(400,'Record ID does not match the URL');
  const fingerprint=hash(JSON.stringify({collection,id,data,expectedVersion,deleted}));
  const {data:result,error}=await db.rpc('save_record',{p_owner_id:ownerId,p_collection:collection,p_id:id,p_data:data,p_expected_version:expectedVersion,p_mutation_id:mutationId,p_fingerprint:fingerprint,p_deleted:deleted});
  if(error) throw new HttpError(error.code==='P0002'?404:503,error.code==='P0002'?'Record not found':'Unable to save this change');
  if(!result.ok) {
    if(result.reason==='mutation_reused') throw new HttpError(409,'This mutation ID was already used for a different change');
    throw new HttpError(409,'This record changed elsewhere. Review the latest version before saving.',{current:result.current?stored(result.current):null});
  }
  return stored(result.record);
}
