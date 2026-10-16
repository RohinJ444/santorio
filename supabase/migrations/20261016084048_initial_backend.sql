-- One owner. Aggregates preserve snapshots; record_versions supports inspection/recovery.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
create or replace function private.is_santorio_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from auth.users where id = auth.uid() and lower(email) = 'rohin.juneja@berkeley.edu'
      and email_confirmed_at is not null and not coalesce(is_anonymous,false)
  );
$$;
revoke all on function private.is_santorio_owner() from public,anon;
grant execute on function private.is_santorio_owner() to authenticated;
create or replace function private.restrict_santorio_signup() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if lower(coalesce(new.email,'')) <> 'rohin.juneja@berkeley.edu' or coalesce(new.is_anonymous,false) then
    raise exception 'Account registration is restricted';
  end if;
  return new;
end;
$$;
revoke all on function private.restrict_santorio_signup() from public,anon,authenticated;
create trigger santorio_owner_only before insert or update of email on auth.users
for each row execute function private.restrict_santorio_signup();

create table public.records (
 owner_id uuid not null references auth.users(id) on delete cascade,
 collection text not null check (collection in ('profiles','locations','exercises','routines','workouts','foods','recipes','batches','diary','metrics','measurements','healthWorkouts')),
 id text not null check(length(id)<=100), data jsonb not null, version bigint not null default 1 check(version>0),
 deleted boolean not null default false, updated_at timestamptz not null default now(),
 primary key(owner_id,collection,id),
 check (jsonb_typeof(data)='object'), check (data->>'id'=id), check (octet_length(data::text)<=1048576)
);
create index records_dates on public.records(owner_id,collection,(data->>'date')) where not deleted;
create table public.record_versions (
 owner_id uuid not null references auth.users(id) on delete cascade,collection text not null,id text not null,version bigint not null,
 data jsonb not null, deleted boolean not null, updated_at timestamptz not null,
 primary key(owner_id,collection,id,version)
);
create table public.record_mutations (
 owner_id uuid not null references auth.users(id) on delete cascade, mutation_id uuid not null,fingerprint text not null,
 result jsonb not null,created_at timestamptz not null default now(),primary key(owner_id,mutation_id)
);
alter table public.records enable row level security;
alter table public.record_versions enable row level security;
alter table public.record_mutations enable row level security;
create policy owner_records on public.records to authenticated using ((select auth.uid())=owner_id and (select private.is_santorio_owner())) with check ((select auth.uid())=owner_id and (select private.is_santorio_owner()));
create policy owner_record_versions on public.record_versions to authenticated using ((select auth.uid())=owner_id and (select private.is_santorio_owner())) with check ((select auth.uid())=owner_id and (select private.is_santorio_owner()));
create policy owner_mutations on public.record_mutations to authenticated using ((select auth.uid())=owner_id and (select private.is_santorio_owner())) with check ((select auth.uid())=owner_id and (select private.is_santorio_owner()));
revoke all on public.records,public.record_versions,public.record_mutations from anon,authenticated;
grant select,insert,update on public.records to authenticated;
grant select,insert on public.record_versions,public.record_mutations to authenticated;
grant all on public.records,public.record_versions,public.record_mutations to service_role;

create or replace function public.save_record(p_owner_id uuid,p_collection text,p_id text,p_data jsonb,p_expected_version bigint,p_mutation_id uuid,p_fingerprint text,p_deleted boolean default false)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare old_row public.records; saved public.records; prior public.record_mutations; response jsonb;
begin
  if current_user <> 'service_role' and (auth.uid() is distinct from p_owner_id or not private.is_santorio_owner()) then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_expected_version<0 or length(p_fingerprint)<>64 then raise exception 'Invalid mutation'; end if;
  -- Single-owner serialization also makes reuse of a mutation ID across records atomic.
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text,0));
  select * into prior from public.record_mutations where owner_id=p_owner_id and mutation_id=p_mutation_id;
  if found then
    if prior.fingerprint<>p_fingerprint then return jsonb_build_object('ok',false,'reason','mutation_reused'); end if;
    return prior.result;
  end if;
  select * into old_row from public.records where owner_id=p_owner_id and collection=p_collection and id=p_id for update;
  if coalesce(old_row.version,0)<>p_expected_version then return jsonb_build_object('ok',false,'reason','conflict','current',case when old_row.id is null then null else to_jsonb(old_row) end); end if;
  if p_deleted and old_row.id is null then raise exception 'Record not found' using errcode='P0002'; end if;
  if not p_deleted and (p_data->>'id' is distinct from p_id or jsonb_typeof(p_data) is distinct from 'object') then raise exception 'Invalid record'; end if;
  if not p_deleted and p_collection in ('foods','recipes') and old_row.id is not null then
    p_data=jsonb_set(p_data,'{revision}',to_jsonb(coalesce((old_row.data->>'revision')::bigint,0)+1));
  end if;
  insert into public.records(owner_id,collection,id,data,version,deleted,updated_at)
    values(p_owner_id,p_collection,p_id,case when p_deleted then old_row.data else p_data end,coalesce(old_row.version,0)+1,p_deleted,clock_timestamp())
    on conflict(owner_id,collection,id) do update set data=excluded.data,version=excluded.version,deleted=excluded.deleted,updated_at=excluded.updated_at returning * into saved;
  insert into public.record_versions(owner_id,collection,id,version,data,deleted,updated_at) values(saved.owner_id,saved.collection,saved.id,saved.version,saved.data,saved.deleted,saved.updated_at);
  response=jsonb_build_object('ok',true,'record',to_jsonb(saved));
  insert into public.record_mutations(owner_id,mutation_id,fingerprint,result) values(p_owner_id,p_mutation_id,p_fingerprint,response);
  return response;
end;
$$;
revoke all on function public.save_record(uuid,text,text,jsonb,bigint,uuid,text,boolean) from public,anon;
grant execute on function public.save_record(uuid,text,text,jsonb,bigint,uuid,text,boolean) to authenticated,service_role;

-- OAuth credentials are hashed. Only server-only service credentials can access these tables.
create table public.oauth_clients (client_id text primary key,metadata jsonb not null,created_at timestamptz not null default now());
create table public.oauth_requests (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade,
 client_id text not null,client_name text not null,redirect_uri text not null,state text,scope text not null,resource text not null,
 code_challenge text not null,csrf_hash text,expires_at timestamptz not null,created_at timestamptz not null default now()
);
create table public.oauth_grants (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade,
 client_id text not null,client_name text not null,scope text not null,resource text not null,
 revoked_at timestamptz,created_at timestamptz not null default now(),last_used_at timestamptz
);
create index oauth_grants_owner on public.oauth_grants(owner_id);
create table public.oauth_codes (
 code_hash text primary key,grant_id uuid not null references public.oauth_grants(id) on delete cascade,
 redirect_uri text not null,code_challenge text not null,expires_at timestamptz not null,used_at timestamptz
);
create table public.oauth_tokens (
 token_hash text primary key,grant_id uuid not null references public.oauth_grants(id) on delete cascade,
 kind text not null check(kind in ('access','refresh')),expires_at timestamptz not null,used_at timestamptz
);
create index oauth_tokens_grant on public.oauth_tokens(grant_id);
create table public.api_rate_limits (key text primary key,hits integer not null,expires_at timestamptz not null);
create index api_rate_limits_expiry on public.api_rate_limits(expires_at);
alter table public.oauth_clients enable row level security;
alter table public.oauth_requests enable row level security;
alter table public.oauth_grants enable row level security;
alter table public.oauth_codes enable row level security;
alter table public.oauth_tokens enable row level security;
alter table public.api_rate_limits enable row level security;
revoke all on public.oauth_clients,public.oauth_requests,public.oauth_grants,public.oauth_codes,public.oauth_tokens,public.api_rate_limits from public,anon,authenticated;
grant all on public.oauth_clients,public.oauth_requests,public.oauth_grants,public.oauth_codes,public.oauth_tokens,public.api_rate_limits to service_role;

create or replace function public.check_rate_limit(p_key text,p_limit integer,p_seconds integer) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare count integer;
begin
 insert into public.api_rate_limits(key,hits,expires_at) values(p_key,1,now()+make_interval(secs=>p_seconds))
 on conflict(key) do update set hits=case when api_rate_limits.expires_at<now() then 1 else api_rate_limits.hits+1 end,
 expires_at=case when api_rate_limits.expires_at<now() then excluded.expires_at else api_rate_limits.expires_at end returning hits into count;
 -- Cleanup is bounded by activity rather than an extra scheduled service.
 delete from public.api_rate_limits where expires_at<now()-interval '1 day';
 return count<=p_limit;
end;
$$;
revoke all on function public.check_rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.check_rate_limit(text,integer,integer) to service_role;

-- Consume a consent request and generate its code in the same transaction; repeated submissions cannot create grants.
create or replace function public.approve_oauth_request(p_request uuid,p_owner uuid,p_csrf text,p_code_hash text,p_approve boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare req public.oauth_requests; grant_id uuid;
begin
 delete from public.oauth_requests where id=p_request and owner_id=p_owner and csrf_hash=p_csrf and expires_at>now() returning * into req;
 if req.id is null then return null; end if;
 if p_approve then
   insert into public.oauth_grants(owner_id,client_id,client_name,scope,resource) values(req.owner_id,req.client_id,req.client_name,req.scope,req.resource) returning id into grant_id;
   insert into public.oauth_codes(code_hash,grant_id,redirect_uri,code_challenge,expires_at) values(p_code_hash,grant_id,req.redirect_uri,req.code_challenge,now()+interval '5 minutes');
 end if;
 return jsonb_build_object('redirect_uri',req.redirect_uri,'state',req.state);
end;
$$;
revoke all on function public.approve_oauth_request(uuid,uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.approve_oauth_request(uuid,uuid,text,text,boolean) to service_role;

create or replace function public.exchange_oauth_token(p_kind text,p_token_hash text,p_client_id text,p_resource text,p_redirect_uri text,p_challenge text,p_access_hash text,p_refresh_hash text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare old_code public.oauth_codes; old_token public.oauth_tokens; permission public.oauth_grants;
begin
 if p_kind='authorization_code' then
   select * into old_code from public.oauth_codes where code_hash=p_token_hash for update;
   if old_code.code_hash is null or old_code.expires_at<=now() or old_code.redirect_uri<>p_redirect_uri or old_code.code_challenge<>p_challenge then return null; end if;
   select * into permission from public.oauth_grants where id=old_code.grant_id for update;
 elsif p_kind='refresh_token' then
   select * into old_token from public.oauth_tokens where token_hash=p_token_hash and kind='refresh' for update;
   if old_token.token_hash is null or old_token.expires_at<=now() then return null; end if;
   select * into permission from public.oauth_grants where id=old_token.grant_id for update;
 else return null;
 end if;
 if permission.id is null or permission.client_id<>p_client_id or permission.resource<>p_resource or permission.revoked_at is not null then return null; end if;
 if (p_kind='refresh_token' and old_token.used_at is not null) or (p_kind='authorization_code' and old_code.used_at is not null) then
   update public.oauth_grants set revoked_at=now() where id=permission.id;
   return null;
 end if;
 if p_kind='authorization_code' then update public.oauth_codes set used_at=now() where code_hash=p_token_hash;
 else update public.oauth_tokens set used_at=now() where token_hash=p_token_hash; end if;
 insert into public.oauth_tokens(token_hash,grant_id,kind,expires_at) values(p_access_hash,permission.id,'access',now()+interval '1 hour'),(p_refresh_hash,permission.id,'refresh',now()+interval '30 days');
 update public.oauth_grants set last_used_at=now() where id=permission.id;
 return jsonb_build_object('scope',permission.scope,'owner_id',permission.owner_id);
end;
$$;
revoke all on function public.exchange_oauth_token(text,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.exchange_oauth_token(text,text,text,text,text,text,text,text) to service_role;
