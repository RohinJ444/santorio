-- A recovery link authorizes one password change in its verified auth session.
create table public.password_recovery_proofs (
 token_hash text primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null,
 expires_at timestamptz not null,
 created_at timestamptz not null default now()
);
create index password_recovery_proofs_owner on public.password_recovery_proofs(owner_id);
create index password_recovery_proofs_expiry on public.password_recovery_proofs(expires_at);
alter table public.password_recovery_proofs enable row level security;
revoke all on public.password_recovery_proofs from public,anon,authenticated;
grant all on public.password_recovery_proofs to service_role;
