-- Strict RBAC: adds the "normal" role (default on signup), a granular
-- accountability log for Paralegal/Staff writes, and lays the DB-side
-- groundwork for the "Admin is blind to document content" doctrine (the
-- actual read-block is enforced in application code — see
-- lib/rbacMiddleware.js — because it must apply even when the service role
-- key is used, which RLS alone cannot restrict).
--
-- As with all files in supabase/migrations, this is NOT auto-applied — run
-- it manually in the Supabase SQL editor.

-- The 'normal' enum value is added by 015a_rbac_enum_values.sql, which must be
-- run (and committed) before this file.

-- Signup now provisions the lowest-privilege role by default. Lawyer and
-- Staff accounts are provisioned exclusively by an Admin
-- (app/api/admin/invite-user). Admin accounts are provisioned only by the
-- seed script (scripts/seedAdmin.mjs) or by promoting a profile by hand.
alter table public.profiles
  alter column role set default 'normal'::app_role;

create or replace function create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, full_name, role, is_active)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name', 'normal'::app_role, true)
  on conflict (user_id) do update
  set email = excluded.email,
      full_name = coalesce(public.profiles.full_name, excluded.full_name);
  return new;
end;
$$;

-- Granular, append-only accountability log. Every write performed by a
-- Paralegal/Staff account (and anything else routed through
-- lib/granularAudit.js) lands here at the individual-field level, so a
-- single typo fix is just as traceable as a bulk edit.
create table if not exists public.granular_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role app_role not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  resource_table text not null,
  resource_id text not null,
  field_name text,
  old_value text,
  new_value text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_granular_audit_log_resource
  on public.granular_audit_log(resource_table, resource_id);
create index if not exists idx_granular_audit_log_actor
  on public.granular_audit_log(actor_user_id);
create index if not exists idx_granular_audit_log_created_at
  on public.granular_audit_log(created_at);

alter table public.granular_audit_log enable row level security;
-- No select/insert/update/delete policies: only the service role (server
-- side, bypasses RLS) may ever read or write this table. Admins read it
-- exclusively through /api/admin/audit-logs, which uses the service role.

create or replace function forbid_granular_audit_log_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'granular_audit_log is append-only';
end;
$$;

drop trigger if exists trigger_granular_audit_log_immutable on public.granular_audit_log;
create trigger trigger_granular_audit_log_immutable
before update or delete on public.granular_audit_log
for each row execute procedure forbid_granular_audit_log_mutation();
