-- Two-tier admin RBAC: a single platform-level DEFAULT_ADMIN manages
-- organizations (law firms) and their Organization Admin accounts only — it
-- never gains access to any firm's Lawyers, Staff, documents, signatures,
-- certificates, or private keys. Each firm's own ADMIN (org-scoped) manages
-- that firm's Lawyers/Staff, settings, repository metadata, and audit logs.
--
-- Isolation is enforced here at the RLS level (not only in application
-- code), per the requirement that unauthorized rows must never be
-- returned by the database itself, even if an application bug forgets a
-- filter. Not auto-applied — run manually in the Supabase SQL editor,
-- after 015a_rbac_enum_values.sql and 016_strict_rbac.sql, then 018_rbac_hardening.sql.
-- Requires the 'default_admin' enum value from 015a_rbac_enum_values.sql,
-- which must have been run and committed beforehand.

-- Organizations need a lifecycle state so DEFAULT_ADMIN can activate/deactivate firms.
alter table public.organizations
  add column if not exists status text not null default 'active';

alter table public.organizations
  drop constraint if exists organizations_status_check;
alter table public.organizations
  add constraint organizations_status_check check (status in ('active', 'inactive'));

-- The one existing org-less admin (provisioned by the original
-- scripts/seedAdmin.mjs seed) is promoted to the new platform role — it was
-- always intended to be the platform-level account, never a firm's admin.
update public.profiles
set role = 'default_admin'::app_role
where role = 'admin'::app_role
  and org_id is null;

-- Legacy self-signups defaulted to 'staff' without an organization. Firm roles
-- now always require an organization, so those accounts become firm-less
-- 'normal' users (they can request a firm via /admin/request).
update public.profiles
set role = 'normal'::app_role
where role in ('staff'::app_role, 'lawyer'::app_role)
  and org_id is null;

-- Invariant: org_id is null only for DEFAULT_ADMIN (and NORMAL, before they
-- are promoted to an Organization Admin); ADMIN/LAWYER/STAFF always belong
-- to exactly one organization. Added NOT VALID so it governs new writes
-- immediately without requiring an immediate backfill of any pre-existing
-- non-conforming rows — run VALIDATE CONSTRAINT once those are cleaned up.
alter table public.profiles
  drop constraint if exists profiles_org_scope_check;
alter table public.profiles
  add constraint profiles_org_scope_check
  check (
    (role = 'default_admin'::app_role and org_id is null)
    or (role in ('admin'::app_role, 'lawyer'::app_role, 'staff'::app_role) and org_id is not null)
    or (role = 'normal'::app_role)
  ) not valid;

-- The caller's organization (NULL for DEFAULT_ADMIN and for firm-less users).
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.profiles where user_id = auth.uid();
$$;

create or replace function is_default_admin(user_uuid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where user_id = user_uuid
      and role = 'default_admin'::app_role
      and coalesce(is_active, true) = true
  );
$$;

-- Org-scoped admin check: unlike is_administrator() (role only, any org),
-- this also requires the admin's own org to match the row/resource being
-- evaluated. Every "an Organization Admin may see this" RLS predicate below
-- uses this instead of the old unscoped is_administrator() bypass.
create or replace function is_admin_of_org(target_org uuid, user_uuid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where user_id = user_uuid
      and role = 'admin'::app_role
      and org_id = target_org
      and coalesce(is_active, true) = true
  );
$$;

-- === organizations: DEFAULT_ADMIN manages all; org members see only their own firm's row ===
alter table public.organizations enable row level security;

drop policy if exists organizations_select_policy on public.organizations;
create policy organizations_select_policy on public.organizations
for select using (
  is_default_admin(auth.uid())
  or id = current_org_id()
);

drop policy if exists organizations_insert_policy on public.organizations;
create policy organizations_insert_policy on public.organizations
for insert with check (is_default_admin(auth.uid()));

drop policy if exists organizations_update_policy on public.organizations;
create policy organizations_update_policy on public.organizations
for update using (is_default_admin(auth.uid())) with check (is_default_admin(auth.uid()));

drop policy if exists organizations_delete_policy on public.organizations;
create policy organizations_delete_policy on public.organizations
for delete using (is_default_admin(auth.uid()));

-- === profiles: org-scoped admin visibility; DEFAULT_ADMIN sees ADMIN-role rows only (never Lawyer/Staff) ===
drop policy if exists profiles_select_policy on public.profiles;
create policy profiles_select_policy on public.profiles
for select using (
  auth.uid() = user_id
  or is_admin_of_org(org_id, auth.uid())
  or (is_default_admin(auth.uid()) and role = 'admin'::app_role)
);

drop policy if exists profiles_insert_policy on public.profiles;
create policy profiles_insert_policy on public.profiles
for insert with check (
  auth.uid() = user_id
  or is_admin_of_org(org_id, auth.uid())
  or (is_default_admin(auth.uid()) and role = 'admin'::app_role)
);

drop policy if exists profiles_update_policy on public.profiles;
create policy profiles_update_policy on public.profiles
for update
using (
  auth.uid() = user_id
  or is_admin_of_org(org_id, auth.uid())
  or (is_default_admin(auth.uid()) and role = 'admin'::app_role)
)
with check (
  auth.uid() = user_id
  or is_admin_of_org(org_id, auth.uid())
  or (is_default_admin(auth.uid()) and role = 'admin'::app_role)
);

drop policy if exists profiles_delete_policy on public.profiles;
create policy profiles_delete_policy on public.profiles
for delete using (
  is_admin_of_org(org_id, auth.uid())
  or (is_default_admin(auth.uid()) and role = 'admin'::app_role)
);

-- === signing_requests / signing_audit_events: org-scoped via the parent document — no blanket admin bypass ===
drop policy if exists signing_requests_select_policy on public.signing_requests;
create policy signing_requests_select_policy on public.signing_requests for select using (
  requested_by = auth.uid()
  or internal_signer_id = auth.uid()
  or exists (select 1 from public.documents d where d.id = document_id and d.owner_id = auth.uid())
  or exists (select 1 from public.documents d where d.id = document_id and is_admin_of_org(d.org_id, auth.uid()))
);

drop policy if exists signing_audit_events_select_policy on public.signing_audit_events;
create policy signing_audit_events_select_policy on public.signing_audit_events for select using (
  exists (select 1 from public.documents d where d.id = document_id and d.owner_id = auth.uid())
  or exists (select 1 from public.documents d where d.id = document_id and is_admin_of_org(d.org_id, auth.uid()))
);

-- === user_signing_keys: self-only. Neither admin tier reads key material
-- through RLS; the certificate/signing workflow only ever touches it
-- server-side via the service role, which bypasses RLS entirely. ===
do $$
begin
  if to_regclass('public.user_signing_keys') is not null then
    drop policy if exists user_signing_keys_select_policy on public.user_signing_keys;
    create policy user_signing_keys_select_policy on public.user_signing_keys
    for select
    using (user_id = auth.uid());
  end if;
end;
$$;

-- Org-scope the granular accountability log so an Organization Admin's
-- view_audit_logs is naturally limited to their own firm (DEFAULT_ADMIN has
-- no view_audit_logs permission at all — enforced in lib/rbac.js).
alter table public.granular_audit_log
  add column if not exists org_id uuid references public.organizations(id) on delete set null;

create index if not exists idx_granular_audit_log_org_id
  on public.granular_audit_log(org_id);
