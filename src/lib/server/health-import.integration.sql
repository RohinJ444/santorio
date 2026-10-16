begin;
create temporary table health_test_context(owner_id uuid);
insert into health_test_context select coalesce((select id from auth.users where lower(email)='rohin.juneja@berkeley.edu' limit 1),gen_random_uuid());
insert into auth.users(id,email,email_confirmed_at,is_anonymous)
select owner_id,'rohin.juneja@berkeley.edu',now(),false from health_test_context where not exists(select 1 from auth.users where lower(email)='rohin.juneja@berkeley.edu');
grant select on health_test_context to service_role;
-- All fixtures, token changes and writes are rolled back. No raw export is used.
do $$ begin
 if has_table_privilege('anon','public.health_connections','SELECT') or has_table_privilege('authenticated','public.health_connections','SELECT') then raise exception 'Importer credential table exposed'; end if;
 if has_function_privilege('authenticated','public.import_health_records(uuid,text,jsonb,jsonb)','EXECUTE') or has_function_privilege('anon','public.import_health_records(uuid,text,jsonb,jsonb)','EXECUTE') then raise exception 'Importer RPC exposed'; end if;
 if has_function_privilege('authenticated','public.set_health_connection(uuid,text)','EXECUTE') or has_function_privilege('anon','public.set_health_connection(uuid,text)','EXECUTE') then raise exception 'Importer credential RPC exposed'; end if;
 if not (select relrowsecurity from pg_class where oid='public.health_connections'::regclass) then raise exception 'Importer table RLS disabled'; end if;
 if has_table_privilege('service_role','auth.users','SELECT') then raise exception 'Importer unnecessarily granted broad auth.users access'; end if;
 if has_function_privilege('anon','private.is_confirmed_health_owner(uuid)','EXECUTE') or has_function_privilege('authenticated','private.is_confirmed_health_owner(uuid)','EXECUTE') then raise exception 'Private owner lookup exposed'; end if;
 if not has_function_privilege('service_role','private.is_confirmed_health_owner(uuid)','EXECUTE') then raise exception 'Server owner lookup unavailable'; end if;
 if not has_function_privilege('service_role','private.is_santorio_owner()','EXECUTE') then raise exception 'Service record mutation owner check unavailable'; end if;
end $$;
set local role service_role;
do $$
declare owner uuid; result jsonb; replay jsonb; saved jsonb; summary jsonb; metric jsonb; workout jsonb; before_version bigint;
 rejected boolean=false; health_id text='f2000000-0000-4000-8000-000000000001';
 workout_a text='f3000000-0000-4000-8000-000000000001'; workout_b text='f3000000-0000-4000-8000-000000000002';
begin
 select owner_id into owner from health_test_context;
 -- Remove only these rollback fixtures if a previous unrelated fixture used their IDs.
 delete from public.record_versions where owner_id=owner and id in ('1999-01-01',health_id,workout_a,workout_b);
 delete from public.records where owner_id=owner and id in ('1999-01-01',health_id,workout_a,workout_b);
 summary='{"counts":{"days":1,"workouts":1,"measurements":0},"warnings":[],"importedAt":"2026-10-16T12:00:00Z"}'::jsonb;
 perform public.set_health_connection(owner,repeat('a',64));
 if not exists(select 1 from public.health_connections where owner_id=owner and token_hash=repeat('a',64) and revoked_at is null) then raise exception 'Connection creation failed'; end if;
 saved=public.save_record(owner,'metrics','1999-01-01','{"id":"1999-01-01","date":"1999-01-01","steps":null,"waterL":2.25,"activeEnergy":null,"restingEnergy":null,"exerciseMinutes":15,"source":"manual"}'::jsonb,0,gen_random_uuid(),repeat('1',64),false);
 metric='{"collection":"metrics","id":"1999-01-01","data":{"id":"1999-01-01","date":"1999-01-01","steps":1000,"activeEnergy":456,"source":"apple_health","importedAt":"2026-10-16T12:00:00Z","healthSources":{"steps":"Fixture watch","activeEnergy":"Fixture watch"}}}'::jsonb;
 workout=jsonb_build_object('collection','healthWorkouts','id',health_id,'data',jsonb_build_object('id',health_id,'externalId','fixture-health-workout','date','1999-01-01','name','Indoor Walk','start','1999-01-01T08:00:00-08:00','end','1999-01-01T08:30:00-08:00','durationMinutes',30,'activeEnergy',120,'heartRate',jsonb_build_array(jsonb_build_object('time','1999-01-01T08:10:00-08:00','bpm',110)),'heartRateSummary',jsonb_build_object('min',80,'avg',110,'max',140),'importedAt','2026-10-16T12:00:00Z'));
 result=public.import_health_records(owner,repeat('a',64),jsonb_build_array(metric,workout),summary);
 if result->>'created'<>'1' or result->>'updated'<>'1' or result->>'unchanged'<>'0' then raise exception 'Unexpected first import counts'; end if;
 if not exists(select 1 from public.records where owner_id=owner and collection='metrics' and id='1999-01-01' and version=2 and data->>'waterL'='2.25' and data->>'exerciseMinutes'='15' and data->>'activeEnergy'='456') then raise exception 'Daily import erased manual fields'; end if;
 if not exists(select 1 from public.records where owner_id=owner and id=health_id and data->'totalEnergy'='null'::jsonb) then raise exception 'Missing new-workout defaults'; end if;
 -- Retrying changes the receipt time but must not create record revisions.
 metric=jsonb_set(metric,'{data,importedAt}','"2026-10-16T12:10:00Z"'::jsonb);
 workout=jsonb_set(workout,'{data,importedAt}','"2026-10-16T12:10:00Z"'::jsonb);
 replay=public.import_health_records(owner,repeat('a',64),jsonb_build_array(metric,workout),summary);
 if replay->>'unchanged'<>'2' or replay->>'updated'<>'0' then raise exception 'Idempotent retry changed records'; end if;
 if (select count(*) from public.record_versions where owner_id=owner and id=health_id)<>1 then raise exception 'Idempotent retry created history'; end if;
 -- Reduced payloads retain absent metrics, provenance and workout details.
 metric=jsonb_build_object('collection','metrics','id','1999-01-01','data',jsonb_build_object('id','1999-01-01','date','1999-01-01','steps',1200,'source','apple_health','importedAt','2026-10-16T12:20:00Z','healthSources',jsonb_build_object('steps','Fixture phone')));
 workout=jsonb_set(workout,'{data}',(workout->'data')-'activeEnergy'-'heartRate');
 workout=jsonb_set(workout,'{data,heartRateSummary}','{"avg":112}'::jsonb);
 result=public.import_health_records(owner,repeat('a',64),jsonb_build_array(metric,workout),summary);
 if not exists(select 1 from public.records where owner_id=owner and id='1999-01-01' and data->>'activeEnergy'='456' and data->'healthSources'->>'activeEnergy'='Fixture watch' and data->'healthSources'->>'steps'='Fixture phone') then raise exception 'Reduced daily import erased values or sources'; end if;
 if not exists(select 1 from public.records where owner_id=owner and id=health_id and data->>'activeEnergy'='120' and jsonb_array_length(data->'heartRate')=1 and data->'heartRateSummary'->>'min'='80' and data->'heartRateSummary'->>'max'='140' and data->'heartRateSummary'->>'avg'='112') then raise exception 'Reduced workout import erased details'; end if;
 select version into before_version from public.records where owner_id=owner and id='1999-01-01';
 begin
   perform public.import_health_records(owner,repeat('a',64),jsonb_build_array(jsonb_set(metric,'{data,steps}','1500'::jsonb),jsonb_build_object('collection','profiles','id','profile','data',jsonb_build_object('id','profile'))),summary);
 exception when others then rejected=true;
 end;
 if not rejected or (select version from public.records where owner_id=owner and id='1999-01-01')<>before_version then raise exception 'Failed batch partially committed'; end if;
 rejected=false;
 begin perform public.import_health_records(owner,repeat('a',64),jsonb_build_array(jsonb_set(metric,'{data,waterL}','0'::jsonb)),summary);
 exception when others then rejected=true; end;
 if not rejected then raise exception 'Import accepted water mutation'; end if;
 rejected=false;
 begin perform public.import_health_records(owner,repeat('a',64),jsonb_build_array(metric,metric),summary);
 exception when others then rejected=true; end;
 if not rejected then raise exception 'Import accepted duplicate records'; end if;
 -- Rotation and revocation reject the old digest, including the RPC's second check.
 perform public.set_health_connection(owner,repeat('b',64));
 rejected=false;
 begin perform public.import_health_records(owner,repeat('a',64),jsonb_build_array(metric),summary);
 exception when insufficient_privilege then rejected=true; end;
 if not rejected then raise exception 'Rotated credential still accepted'; end if;
 perform public.set_health_connection(owner,null);
 rejected=false;
 begin perform public.import_health_records(owner,repeat('b',64),jsonb_build_array(metric),summary);
 exception when insufficient_privilege then rejected=true; end;
 if not rejected then raise exception 'Revoked credential still accepted'; end if;
 -- Manual imports remain available after revocation without re-enabling automation.
 perform public.import_health_records(owner,null,jsonb_build_array(metric),summary);
 if exists(select 1 from public.health_connections where owner_id=owner and token_hash is not null) then raise exception 'Manual import enabled automation'; end if;
 rejected=false;
 begin perform public.import_health_records('f0000000-0000-4000-8000-000000000099',null,jsonb_build_array(metric),summary);
 exception when insufficient_privilege then rejected=true; end;
 if not rejected then raise exception 'Missing live owner accepted'; end if;
 -- The trigger protects session-level and exercise-level associations uniformly.
 saved=public.save_record(owner,'workouts',workout_a,jsonb_build_object('id',workout_a,'healthWorkoutIds','[]'::jsonb,'exercises',jsonb_build_array(jsonb_build_object('id','fixture-exercise','healthWorkoutIds',jsonb_build_array(health_id)))),0,gen_random_uuid(),repeat('2',64),false);
 rejected=false;
 begin
   perform public.save_record(owner,'workouts',workout_b,jsonb_build_object('id',workout_b,'healthWorkoutIds',jsonb_build_array(health_id),'exercises','[]'::jsonb),0,gen_random_uuid(),repeat('3',64),false);
 exception when check_violation then rejected=true; end;
 if not rejected then raise exception 'Watch workout linked to two sessions'; end if;
 saved=public.save_record(owner,'workouts',workout_a,jsonb_build_object('id',workout_a,'healthWorkoutIds','[]'::jsonb,'exercises','[]'::jsonb),1,gen_random_uuid(),repeat('4',64),false);
 saved=public.save_record(owner,'workouts',workout_b,jsonb_build_object('id',workout_b,'healthWorkoutIds',jsonb_build_array(health_id),'exercises','[]'::jsonb),0,gen_random_uuid(),repeat('5',64),false);
 if saved->>'ok'<>'true' then raise exception 'Unlink then relink failed'; end if;
 rejected=false;
 begin perform public.save_record(owner,'workouts',workout_b,jsonb_build_object('id',workout_b,'healthWorkoutIds',jsonb_build_array(health_id,health_id),'exercises','[]'::jsonb),1,gen_random_uuid(),repeat('6',64),false);
 exception when check_violation then rejected=true; end;
 if not rejected then raise exception 'Watch workout linked twice within a session'; end if;
 rejected=false;
 begin perform public.save_record(owner,'workouts',workout_a,jsonb_build_object('id',workout_a,'healthWorkoutIds',jsonb_build_array('f2000000-0000-4000-8000-000000000099'),'exercises','[]'::jsonb),2,gen_random_uuid(),repeat('7',64),false);
 exception when check_violation then rejected=true; end;
 if not rejected then raise exception 'Unknown Watch workout accepted'; end if;
end $$;
reset role;
select jsonb_build_object('private_credentials',true,'owner_recheck',true,'atomic_import',true,'retry_idempotence',true,'preserve_manual_fields',true,'preserve_missing_details',true,'version_history',true,'rotation_and_revocation',true,'unique_workout_associations',true,'rolled_back',true) as checks;
rollback;
