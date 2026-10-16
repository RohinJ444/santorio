import {describe,it,expect} from 'vitest';
import {mergeDrafts,parseDraft} from './draft-storage';
import type {Persisted} from './sync-engine';
const old:Persisted={server:[{collection:'locations',id:'gym',data:{id:'gym',name:'Old'},version:1,updatedAt:'2026-10-16'}],queue:[{collection:'locations',id:'gym',data:{id:'gym',name:'Unsynced'},expectedVersion:1,mutationId:'m1',attempted:true}]};
describe('per-tab draft recovery',()=>{
 it('deduplicates crash-retried mutations while retaining the newest acknowledged revision',()=>{
  const newer:Persisted={server:[{...old.server[0],version:2,data:{id:'gym',name:'New'}}],queue:[...old.queue,{...old.queue[0],id:'gym2',mutationId:'m2'}]};
  const result=mergeDrafts(newer,old);
  expect(result.server[0].version).toBe(2);expect(result.queue.map(j=>j.mutationId)).toEqual(['m1','m2']);
 });
 it('keeps independent unsaved tab edits as separate mutations so the server can detect conflicts',()=>{
  const other:Persisted={server:[],queue:[{...old.queue[0],data:{id:'gym',name:'Other tab'},mutationId:'other'}]};
  expect(mergeDrafts(old,other).queue).toHaveLength(2);
 });
 it('does not silently discard unreadable stored drafts',()=>{expect(()=>parseDraft('{bad')).toThrow();expect(()=>parseDraft('{}')).toThrow();expect(parseDraft(null)).toEqual({server:[],queue:[]});});
});
