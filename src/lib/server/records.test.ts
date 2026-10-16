import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
vi.mock('server-only',()=>({}));
import {hash} from './security';
import {replayRecordMutation,saveRecord,stored} from './records';

const ownerId='10000000-0000-4000-8000-000000000001';
const recordId='20000000-0000-4000-8000-000000000001';
const mutationId='30000000-0000-4000-8000-000000000001';
const location={id:recordId,name:'Crunch San Mateo'};
const row={collection:'locations' as const,id:recordId,data:location,version:1,updated_at:'2026-10-16T19:00:00.000Z',deleted:false};
const requestFingerprint=hash(JSON.stringify({operation:'log_meal',id:recordId,date:'2026-10-16',quantity:0.75}));
const query={select:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn()};
const rpc=vi.fn();
const db={from:vi.fn(()=>query),rpc} as unknown as SupabaseClient;

beforeEach(()=>{
 vi.clearAllMocks();
 query.select.mockReturnValue(query);
 query.eq.mockReturnValue(query);
 query.maybeSingle.mockResolvedValue({data:null,error:null});
 rpc.mockResolvedValue({data:{ok:true,record:row},error:null});
});

describe('record mutation replay',()=>{
 it('looks up the mutation within the authenticated owner and returns its original acknowledgement',async()=>{
  query.maybeSingle.mockResolvedValue({data:{fingerprint:requestFingerprint,result:{ok:true,record:row}},error:null});
  await expect(replayRecordMutation(db,ownerId,mutationId,requestFingerprint)).resolves.toEqual(stored(row));
  expect(db.from).toHaveBeenCalledExactlyOnceWith('record_mutations');
  expect(query.eq.mock.calls).toEqual([['owner_id',ownerId],['mutation_id',mutationId]]);
  expect(rpc).not.toHaveBeenCalled();
 });
 it('returns null when this owner has no matching mutation',async()=>{
  await expect(replayRecordMutation(db,ownerId,mutationId,requestFingerprint)).resolves.toBeNull();
 });
 it('rejects mutation reuse for a different request rather than returning another acknowledgement',async()=>{
  query.maybeSingle.mockResolvedValue({data:{fingerprint:hash('different request'),result:{ok:true,record:row}},error:null});
  await expect(replayRecordMutation(db,ownerId,mutationId,requestFingerprint)).rejects.toMatchObject({status:409,message:'This mutation ID was already used for a different change'});
 });
 it('fails closed on lookup errors without exposing database details',async()=>{
  query.maybeSingle.mockResolvedValue({data:null,error:{message:'private database diagnostic'}});
  await expect(replayRecordMutation(db,ownerId,mutationId,requestFingerprint)).rejects.toMatchObject({status:503,message:'Unable to check this change'});
 });
});

describe('record save fingerprints',()=>{
 it('preserves the existing validated-payload fingerprint for ordinary saves',async()=>{
  await saveRecord(db,ownerId,'locations',recordId,location,0,mutationId);
  expect(rpc).toHaveBeenCalledExactlyOnceWith('save_record',{
   p_owner_id:ownerId,p_collection:'locations',p_id:recordId,p_data:location,p_expected_version:0,p_mutation_id:mutationId,
   p_fingerprint:hash(JSON.stringify({collection:'locations',id:recordId,data:location,expectedVersion:0,deleted:false})),p_deleted:false,
  });
 });
 it('passes the server-derived request fingerprint into the same atomic save RPC',async()=>{
  await expect(saveRecord(db,ownerId,'locations',recordId,location,0,mutationId,false,requestFingerprint)).resolves.toEqual(stored(row));
  expect(rpc).toHaveBeenCalledExactlyOnceWith('save_record',expect.objectContaining({p_owner_id:ownerId,p_data:location,p_expected_version:0,p_mutation_id:mutationId,p_fingerprint:requestFingerprint,p_deleted:false}));
 });
 it('still validates payloads and their record IDs when using a request fingerprint',async()=>{
  await expect(saveRecord(db,ownerId,'locations',recordId,{id:recordId,name:42},0,mutationId,false,requestFingerprint)).rejects.toThrow();
  await expect(saveRecord(db,ownerId,'locations',recordId,{...location,id:ownerId},0,mutationId,false,requestFingerprint)).rejects.toMatchObject({status:400});
  expect(rpc).not.toHaveBeenCalled();
 });
 it('keeps default deletion fingerprints tied to the record version and tombstone',async()=>{
  await saveRecord(db,ownerId,'locations',recordId,null,1,mutationId,true);
  expect(rpc).toHaveBeenCalledExactlyOnceWith('save_record',expect.objectContaining({p_data:null,p_expected_version:1,p_deleted:true,p_fingerprint:hash(JSON.stringify({collection:'locations',id:recordId,data:null,expectedVersion:1,deleted:true}))}));
 });
});
