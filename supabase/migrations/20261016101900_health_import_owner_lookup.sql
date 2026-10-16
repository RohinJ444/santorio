-- Supabase's service role cannot directly read auth.users. Keep that access
-- inside this narrow, server-only boolean helper rather than granting table access.
create or replace function private.is_confirmed_health_owner(p_owner_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select p_owner_id is not null and exists (
   select 1 from auth.users where id=p_owner_id and lower(email)='rohin.juneja@berkeley.edu'
     and email_confirmed_at is not null and not coalesce(is_anonymous,false)
 );
$$;
revoke all on function private.is_confirmed_health_owner(uuid) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.is_confirmed_health_owner(uuid) to service_role;

create or replace function public.set_health_connection(p_owner_id uuid,p_token_hash text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare connected public.health_connections;
begin
 if current_user <> 'service_role' then raise exception 'Not authorized' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text,0));
 if not private.is_confirmed_health_owner(p_owner_id) then
   raise exception 'Not authorized' using errcode='42501';
 end if;
 if p_token_hash is not null and p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid credential'; end if;
 insert into public.health_connections(owner_id,token_hash,created_at,revoked_at)
 values(p_owner_id,p_token_hash,clock_timestamp(),case when p_token_hash is null then clock_timestamp() end)
 on conflict(owner_id) do update set token_hash=excluded.token_hash,
   created_at=case when excluded.token_hash is not null then excluded.created_at else health_connections.created_at end,
   revoked_at=excluded.revoked_at returning * into connected;
 return jsonb_build_object('createdAt',connected.created_at,'connected',connected.token_hash is not null and connected.revoked_at is null);
end;
$$;
revoke all on function public.set_health_connection(uuid,text) from public,anon,authenticated;
grant execute on function public.set_health_connection(uuid,text) to service_role;

create or replace function public.import_health_records(p_owner_id uuid,p_token_hash text,p_records jsonb,p_summary jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare item jsonb; patch jsonb; merged jsonb; old_row public.records; saved public.records;
 collection_name text; record_id text; field_name text; allowed_keys text[];
 created_count integer=0; updated_count integer=0; unchanged_count integer=0; result jsonb;
begin
 if current_user <> 'service_role' then raise exception 'Not authorized' using errcode='42501'; end if;
 -- Shared with save_record and token rotation/revocation. Authorization is checked
 -- after acquiring the lock, closing the revocation/import race.
 perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text,0));
 if not private.is_confirmed_health_owner(p_owner_id) then
   raise exception 'Not authorized' using errcode='42501';
 end if;
 if p_token_hash is not null and not exists(select 1 from public.health_connections
   where owner_id=p_owner_id and token_hash=p_token_hash and revoked_at is null) then
   raise exception 'Import credential was revoked' using errcode='42501';
 end if;
 if jsonb_typeof(p_records) is distinct from 'array' or jsonb_array_length(p_records)>2000
   or jsonb_typeof(p_summary) is distinct from 'object'
   or jsonb_typeof(p_summary->'counts') is distinct from 'object'
   or jsonb_typeof(p_summary->'warnings') is distinct from 'array'
   or jsonb_typeof(p_summary->'importedAt') is distinct from 'string'
   or octet_length(p_summary::text)>65536 then raise exception 'Invalid import'; end if;
 if exists(select 1 from jsonb_array_elements(p_records) r group by r->>'collection',r->>'id' having count(*)>1) then
   raise exception 'Duplicate import records';
 end if;
 for item in select value from jsonb_array_elements(p_records) loop
   collection_name=item->>'collection'; record_id=item->>'id'; patch=item->'data';
   if collection_name is null or collection_name not in ('metrics','measurements','healthWorkouts')
     or jsonb_typeof(patch) is distinct from 'object' or patch->>'id' is distinct from record_id
     or record_id is null or record_id !~* '^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[0-9]{4}-[0-9]{2}-[0-9]{2})$'
     or octet_length(patch::text)>1048576 then raise exception 'Invalid import record'; end if;
   if collection_name='metrics' then
     allowed_keys=array['id','date','steps','activeEnergy','restingEnergy','exerciseMinutes','source','importedAt','completeDay','healthSources'];
     if patch->>'date' is distinct from record_id or patch->>'source' is distinct from 'apple_health'
       or record_id !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid daily metrics'; end if;
     foreach field_name in array array['steps','activeEnergy','restingEnergy','exerciseMinutes'] loop
       if patch ? field_name and (jsonb_typeof(patch->field_name) is distinct from 'number'
         or (patch->>field_name)::numeric<0 or (patch->>field_name)::numeric>1000000000) then
         raise exception 'Invalid daily metric value';
       end if;
     end loop;
     if patch ? 'healthSources' and jsonb_typeof(patch->'healthSources') is distinct from 'object' then raise exception 'Invalid metric sources'; end if;
   elsif collection_name='measurements' then
     allowed_keys=array['id','date','kind','value','source','recordedAt'];
     if patch->>'source' is distinct from 'apple_health' or coalesce(patch->>'kind','') not in ('weight_kg','height_cm')
       or jsonb_typeof(patch->'value') is distinct from 'number'
       or (patch->>'value')::numeric<=0 or (patch->>'value')::numeric>10000 then raise exception 'Invalid body measurement'; end if;
   else
     allowed_keys=array['id','externalId','date','name','start','end','durationMinutes','activeEnergy','totalEnergy','heartRate','importedAt','heartRateSummary','sourceName','sourceIdentifier','isIndoor','distanceKm'];
     if jsonb_typeof(patch->'externalId') is distinct from 'string' or length(patch->>'externalId') not between 1 and 200
       or jsonb_typeof(patch->'durationMinutes') is distinct from 'number'
       or (patch->>'durationMinutes')::numeric<0 or (patch->>'durationMinutes')::numeric>1000000000
       or (patch ? 'heartRate' and (jsonb_typeof(patch->'heartRate') is distinct from 'array' or jsonb_array_length(patch->'heartRate')>30000)) then
       raise exception 'Invalid workout';
     end if;
   end if;
   if exists(select 1 from jsonb_object_keys(patch) key where not (key=any(allowed_keys))) then raise exception 'Unsupported import field'; end if;
   select * into old_row from public.records where owner_id=p_owner_id and collection=collection_name and id=record_id for update;
   merged=case when collection_name='metrics' then
       jsonb_build_object('id',record_id,'date',record_id,'steps',null,'waterL',0,'activeEnergy',null,'restingEnergy',null,'exerciseMinutes',null,'source','apple_health','completeDay',false)
     when collection_name='healthWorkouts' then jsonb_build_object('heartRate','[]'::jsonb,'activeEnergy',null,'totalEnergy',null)
     else '{}'::jsonb end || coalesce(old_row.data,'{}'::jsonb) || patch;
   if collection_name='metrics' and patch ? 'healthSources' then
     merged=jsonb_set(merged,'{healthSources}',coalesce(old_row.data->'healthSources','{}'::jsonb)||(patch->'healthSources'));
   end if;
   if collection_name='healthWorkouts' and patch ? 'heartRateSummary' then
     merged=jsonb_set(merged,'{heartRateSummary}',coalesce(old_row.data->'heartRateSummary','{}'::jsonb)||(patch->'heartRateSummary'));
   end if;
   -- A fresh receipt timestamp alone must not create revisions or stale-edit conflicts.
   if old_row.id is not null and not old_row.deleted and (old_row.data-'importedAt')=(merged-'importedAt') then
     unchanged_count=unchanged_count+1;
     continue;
   end if;
   insert into public.records(owner_id,collection,id,data,version,deleted,updated_at)
   values(p_owner_id,collection_name,record_id,merged,coalesce(old_row.version,0)+1,false,clock_timestamp())
   on conflict(owner_id,collection,id) do update set data=excluded.data,version=excluded.version,deleted=false,updated_at=excluded.updated_at returning * into saved;
   insert into public.record_versions(owner_id,collection,id,version,data,deleted,updated_at)
   values(saved.owner_id,saved.collection,saved.id,saved.version,saved.data,saved.deleted,saved.updated_at);
   if old_row.id is null then created_count=created_count+1; else updated_count=updated_count+1; end if;
 end loop;
 result=jsonb_build_object('ok',true,'created',created_count,'updated',updated_count,'unchanged',unchanged_count,
   'counts',p_summary->'counts','warnings',p_summary->'warnings','importedAt',p_summary->'importedAt');
 -- Manual imports can precede automation setup. This records status without
 -- creating an active credential or changing an existing credential.
 insert into public.health_connections(owner_id,token_hash,revoked_at,last_imported_at,last_result)
 values(p_owner_id,null,clock_timestamp(),clock_timestamp(),result)
 on conflict(owner_id) do update set last_imported_at=excluded.last_imported_at,last_result=excluded.last_result;
 return result;
end;
$$;
revoke all on function public.import_health_records(uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.import_health_records(uuid,text,jsonb,jsonb) to service_role;
