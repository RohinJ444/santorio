-- Supporting indexes for deletes/revocation and short-lived authorization requests.
create index oauth_codes_grant on public.oauth_codes(grant_id);
create index oauth_requests_owner on public.oauth_requests(owner_id);
create index oauth_requests_expiry on public.oauth_requests(expires_at);
-- Supabase's optional automatic-RLS event trigger runs as its owner. Clients
-- never need to invoke the trigger function through the public RPC endpoint.
do $$ begin
 if to_regprocedure('public.rls_auto_enable()') is not null then
  revoke execute on function public.rls_auto_enable() from public,anon,authenticated;
 end if;
end $$;
