import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
vi.mock('server-only',()=>({}));
const {jar,query,admin}=vi.hoisted(()=>{const query={eq:vi.fn(),gt:vi.fn(),select:vi.fn(),maybeSingle:vi.fn(),delete:vi.fn()};return {jar:{get:vi.fn(),set:vi.fn()},query,admin:{from:vi.fn()}};});
vi.mock('next/headers',()=>({cookies:async()=>jar}));
vi.mock('./supabase',()=>({adminClient:()=>admin}));
import {consumeRecoveryProof,recoveryAuthorized} from './recovery';
const sessionId='fa2ae791-47db-4d14-bd97-b5fc256f58aa';
const db={auth:{getClaims:async()=>({data:{claims:{session_id:sessionId}},error:null})}} as unknown as SupabaseClient;
describe('Password recovery proof boundaries',()=>{
 beforeEach(()=>{vi.clearAllMocks();jar.get.mockReturnValue({value:'random-secret'});admin.from.mockReturnValue(query);for(const fn of [query.eq,query.gt,query.select,query.delete])fn.mockReturnValue(query);});
 it('requires a dedicated recovery cookie even with a valid signed-in session',async()=>{jar.get.mockReturnValue(undefined);await expect(consumeRecoveryProof(db,'owner')).rejects.toThrow('reset link');expect(admin.from).not.toHaveBeenCalled();});
 it('binds proof lookup to both the owner and the verified session ID',async()=>{query.maybeSingle.mockResolvedValue({data:{token_hash:'value'},error:null});expect(await recoveryAuthorized(db,'owner')).toBe(true);expect(query.eq).toHaveBeenCalledWith('owner_id','owner');expect(query.eq).toHaveBeenCalledWith('session_id',sessionId);expect(query.gt).toHaveBeenCalledWith('expires_at',expect.any(String));});
 it('uses an atomic delete-returning operation and rejects replay',async()=>{query.maybeSingle.mockResolvedValueOnce({data:{token_hash:'value'},error:null}).mockResolvedValueOnce({data:null,error:null});await expect(consumeRecoveryProof(db,'owner')).resolves.toBeUndefined();await expect(consumeRecoveryProof(db,'owner')).rejects.toThrow('expired or was already used');expect(query.delete).toHaveBeenCalledTimes(2);expect(jar.set).toHaveBeenCalledWith('santorio-recovery','',expect.objectContaining({httpOnly:true,maxAge:0}));});
});
