begin;
create temporary table backend_test_context(owner_id uuid);
insert into backend_test_context select coalesce((select id from auth.users where lower(email)='rohin.juneja@berkeley.edu' limit 1),gen_random_uuid());
insert into auth.users(id,email,email_confirmed_at,is_anonymous)
select owner_id,'rohin.juneja@berkeley.edu',now(),false from backend_test_context where not exists(select 1 from auth.users where lower(email)='rohin.juneja@berkeley.edu');
-- These fixtures, credentials and writes are all rolled back at the end.
do $$ begin
 if has_table_privilege('anon','public.records','SELECT') then raise exception 'Anonymous table access'; end if;
 if has_table_privilege('authenticated','public.oauth_tokens','SELECT') then raise exception 'Authenticated token table access'; end if;
 if has_function_privilege('anon','public.save_record(uuid,text,text,jsonb,bigint,uuid,text,boolean)','EXECUTE') then raise exception 'Anonymous mutation access'; end if;
 if has_function_privilege('authenticated','public.exchange_oauth_token(text,text,text,text,text,text,text,text)','EXECUTE') then raise exception 'Authenticated token RPC access'; end if;
end $$;
grant select on backend_test_context to authenticated,service_role;
select set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true) from backend_test_context;
set local role authenticated;
do $$ declare owner uuid; saved jsonb; replay jsonb; conflict jsonb; bad jsonb; begin
 select owner_id into owner from backend_test_context;
 saved=public.save_record(owner,'locations','dfbdc27b-0cbd-48d0-b86c-ce798ed76129','{"id":"dfbdc27b-0cbd-48d0-b86c-ce798ed76129","name":"Rollback test gym"}'::jsonb,0,'c3d2f521-a359-486b-a89b-2ce9db181fe0',repeat('a',64),false);
 if saved->>'ok'<>'true' or saved->'record'->>'version'<>'1' then raise exception 'Initial save failed'; end if;
 replay=public.save_record(owner,'locations','dfbdc27b-0cbd-48d0-b86c-ce798ed76129','{"id":"dfbdc27b-0cbd-48d0-b86c-ce798ed76129","name":"Rollback test gym"}'::jsonb,0,'c3d2f521-a359-486b-a89b-2ce9db181fe0',repeat('a',64),false);
 if replay is distinct from saved then raise exception 'Idempotency failed'; end if;
 conflict=public.save_record(owner,'locations','dfbdc27b-0cbd-48d0-b86c-ce798ed76129','{"id":"dfbdc27b-0cbd-48d0-b86c-ce798ed76129","name":"Changed"}'::jsonb,0,gen_random_uuid(),repeat('b',64),false);
 if conflict->>'reason'<>'conflict' then raise exception 'Stale version accepted'; end if;
 bad=public.save_record(owner,'locations','dfbdc27b-0cbd-48d0-b86c-ce798ed76129','{"id":"dfbdc27b-0cbd-48d0-b86c-ce798ed76129","name":"Changed"}'::jsonb,1,'c3d2f521-a359-486b-a89b-2ce9db181fe0',repeat('c',64),false);
 if bad->>'reason'<>'mutation_reused' then raise exception 'Mutation reuse accepted'; end if;
 saved=public.save_record(owner,'locations','dfbdc27b-0cbd-48d0-b86c-ce798ed76129',null,1,gen_random_uuid(),repeat('d',64),true);
 if saved->'record'->>'deleted'<>'true' or saved->'record'->>'version'<>'2' then raise exception 'Tombstone failed'; end if;
 if (select count(*) from public.record_versions where owner_id=owner and id='dfbdc27b-0cbd-48d0-b86c-ce798ed76129')<>2 then raise exception 'Version history failed'; end if;
end $$;
-- A valid-looking JWT for another account sees no records.
select set_config('request.jwt.claims','{"sub":"9a3e2d57-41f9-40dd-adf3-7c5c9a1b79c9","role":"authenticated"}',true);
do $$ declare rejected boolean=false; owner uuid; begin
 if exists(select 1 from public.records) then raise exception 'Cross-owner read succeeded'; end if;
 select owner_id into owner from backend_test_context;
 begin
  perform public.save_record(owner,'locations','dfbdc27b-0cbd-48d0-b86c-ce798ed76129','{}'::jsonb,2,gen_random_uuid(),repeat('9',64),false);
 exception when insufficient_privilege then rejected=true;
 end;
 if not rejected then raise exception 'Cross-owner write succeeded'; end if;
end $$;
reset role;
set local role service_role;
do $$ declare owner uuid; req uuid; permission uuid; consent jsonb; result jsonb; begin
 select owner_id into owner from backend_test_context;
 insert into public.oauth_requests(owner_id,client_id,client_name,redirect_uri,state,scope,resource,code_challenge,csrf_hash,expires_at)
 values(owner,'https://client.example/metadata.json','Rollback client','https://client.example/callback','test-state','nutrition:read nutrition:write','https://santorio.example/api/mcp','challenge',repeat('e',64),now()+interval '10 minutes') returning id into req;
 consent=public.approve_oauth_request(req,owner,repeat('e',64),repeat('f',64),true);
 if consent->>'state'<>'test-state' then raise exception 'Consent failed'; end if;
 if public.approve_oauth_request(req,owner,repeat('e',64),repeat('f',64),true) is not null then raise exception 'Consent replay accepted'; end if;
 result=public.exchange_oauth_token('authorization_code',repeat('f',64),'https://client.example/metadata.json','https://other.example/api/mcp','https://client.example/callback','challenge',repeat('1',64),repeat('2',64));
 if result is not null then raise exception 'Wrong resource accepted'; end if;
 result=public.exchange_oauth_token('authorization_code',repeat('f',64),'https://client.example/metadata.json','https://santorio.example/api/mcp','https://client.example/callback','wrong',repeat('1',64),repeat('2',64));
 if result is not null then raise exception 'Wrong PKCE accepted'; end if;
 result=public.exchange_oauth_token('authorization_code',repeat('f',64),'https://client.example/metadata.json','https://santorio.example/api/mcp','https://client.example/callback','challenge',repeat('1',64),repeat('2',64));
 if result->>'owner_id' is distinct from owner::text then raise exception 'Code exchange failed'; end if;
 select grant_id into permission from public.oauth_tokens where token_hash=repeat('2',64);
 result=public.exchange_oauth_token('refresh_token',repeat('2',64),'https://client.example/metadata.json','https://santorio.example/api/mcp','','',repeat('3',64),repeat('4',64));
 if result is null then raise exception 'Refresh failed'; end if;
 result=public.exchange_oauth_token('refresh_token',repeat('2',64),'https://client.example/metadata.json','https://santorio.example/api/mcp','','',repeat('5',64),repeat('6',64));
 if result is not null then raise exception 'Refresh replay accepted'; end if;
 if not exists(select 1 from public.oauth_grants where id=permission and revoked_at is not null) then raise exception 'Replay did not revoke grant'; end if;
 if public.exchange_oauth_token('refresh_token',repeat('4',64),'https://client.example/metadata.json','https://santorio.example/api/mcp','','',repeat('7',64),repeat('8',64)) is not null then raise exception 'Revoked grant refreshed'; end if;
end $$;
reset role;
select json_build_object('record_idempotency',true,'stale_conflicts',true,'mutation_reuse_denied',true,'tombstones',true,'history',true,'owner_rls',true,'private_tokens',true,'oauth_consent_once',true,'resource_binding',true,'pkce_binding',true,'refresh_rotation',true,'replay_revokes',true,'rolled_back',true) as checks;
rollback;
