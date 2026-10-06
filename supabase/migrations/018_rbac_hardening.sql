-- RBAC hardening (run after 017_two_tier_admin_rbac.sql; not auto-applied).
--
-- Closes the remaining ways a session using only the public anon key could
-- escalate or cross an organization boundary, so the guarantees hold at the
-- database level and not just in the Next.js API routes:
--   1. Users can no longer edit their own role / organization / status.
--   2. The legacy cross-organization is_administrator() bypass is retired.
--   3. DEFAULT_ADMIN is denied (restrictively) on every firm-level table and
--      on storage, regardless of any other permissive policy.
--   4. Exactly one DEFAULT_ADMIN, and at most one ADMIN per organization.
--   5. Documents are always stamped with, and confined to, an organization.

-- ---------------------------------------------------------------------------
-- 1. Privileged profile columns are not writable by end users
-- ---------------------------------------------------------------------------
-- Calls made with the service role, the SQL editor, or the auth signup
-- trigger carry no end-user JWT (auth.uid() is null) and are trusted; every
-- route that changes role/org/status runs server-side after its own RBAC
-- check. Anything arriving with a user JWT is limited to the cases below.
create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Self-provisioning can only ever produce a firm-less Normal account
    -- (the request-admin upsert may carry status 'pending').
    if new.user_id <> caller
       or new.role <> 'normal'::app_role
       or new.org_id is not null
       or coalesce(new.is_active, true) is not true
       or new.admin_request_status not in ('none', 'pending') then
      raise exception 'Profiles cannot be created with elevated privileges.' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.user_id <> old.user_id then
    raise exception 'profiles.user_id is immutable.' using errcode = '42501';
  end if;

  if new.role is not distinct from old.role
     and new.org_id is not distinct from old.org_id
     and new.is_active is not distinct from old.is_active
     and new.admin_request_status is not distinct from old.admin_request_status then
    return new;
  end if;

  -- (a) A firm-less Normal user submitting an admin request for themselves.
  if caller = old.user_id
     and old.role = 'normal'::app_role
     and old.org_id is null
     and new.role = old.role
     and new.org_id is null
     and new.is_active is not distinct from old.is_active
     and new.admin_request_status = 'pending'
     and old.admin_request_status in ('none', 'rejected') then
    return new;
  end if;

  -- (b) An Organization Admin managing a Lawyer/Staff account of their own
  -- firm (role between lawyer/staff, activate/deactivate). Never themselves,
  -- never another Admin, never moving anyone to another organization.
  if caller <> old.user_id
     and old.role in ('lawyer'::app_role, 'staff'::app_role)
     and new.role in ('lawyer'::app_role, 'staff'::app_role)
     and new.org_id is not distinct from old.org_id
     and new.admin_request_status is not distinct from old.admin_request_status
     and public.is_admin_of_org(old.org_id, caller) then
    return new;
  end if;

  -- (c) DEFAULT_ADMIN activating/deactivating an Organization Admin only.
  if old.role = 'admin'::app_role
     and new.role = old.role
     and new.org_id is not distinct from old.org_id
     and new.admin_request_status is not distinct from old.admin_request_status
     and public.is_default_admin(caller) then
    return new;
  end if;

  raise exception 'You are not allowed to change role, organization or status on this profile.' using errcode = '42501';
end;
$$;

drop trigger if exists trigger_guard_profile_privileged_columns on public.profiles;
create trigger trigger_guard_profile_privileged_columns
before insert or update on public.profiles
for each row execute procedure public.guard_profile_privileged_columns();

-- Tighten the 017 profile policies to match the trigger: nobody can create
-- someone else's profile through RLS (admin provisioning is server-side),
-- and an Organization Admin only reaches Lawyer/Staff rows or their own.
drop policy if exists profiles_insert_policy on public.profiles;
create policy profiles_insert_policy on public.profiles
for insert with check (auth.uid() = user_id);

drop policy if exists profiles_update_policy on public.profiles;
create policy profiles_update_policy on public.profiles
for update
using (
  auth.uid() = user_id
  or (is_admin_of_org(org_id, auth.uid()) and role in ('lawyer'::app_role, 'staff'::app_role))
  or (is_default_admin(auth.uid()) and role = 'admin'::app_role)
)
with check (
  auth.uid() = user_id
  or (is_admin_of_org(org_id, auth.uid()) and role in ('lawyer'::app_role, 'staff'::app_role))
  or (is_default_admin(auth.uid()) and role = 'admin'::app_role)
);

drop policy if exists profiles_delete_policy on public.profiles;
create policy profiles_delete_policy on public.profiles
for delete using (
  (is_admin_of_org(org_id, auth.uid()) and role in ('lawyer'::app_role, 'staff'::app_role))
  or (is_default_admin(auth.uid()) and role = 'admin'::app_role)
);

-- ---------------------------------------------------------------------------
-- 2. Retire the legacy "any admin sees everything" helper
-- ---------------------------------------------------------------------------
-- Migrations 002/003/006 granted is_administrator() blanket, cross-organization
-- access on cases, documents, signing requests and legacy tables. Organization
-- scoping now goes through is_admin_of_org(); keeping this helper permissive
-- would let any firm's Admin read every firm's rows, so it now grants nothing.
create or replace function is_administrator(user_uuid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select false;
$$;

-- ---------------------------------------------------------------------------
-- 3. DEFAULT_ADMIN is walled off from every firm-level table and bucket
-- ---------------------------------------------------------------------------
-- RESTRICTIVE policies are ANDed with all permissive ones, so even a future
-- permissive policy cannot hand DEFAULT_ADMIN firm data. The service role
-- bypasses RLS; platform routes only ever select the columns they need.
do $$
declare
  t text;
begin
  foreach t in array array[
    'cases', 'documents', 'document_permissions', 'audit_logs',
    'signing_requests', 'signing_audit_events', 'signing_request_certificates',
    'external_signer_keys', 'user_signing_keys', 'granular_audit_log',
    'folders', 'internal_user_invitations'
  ] loop
    if exists (select 1 from pg_class where oid = to_regclass('public.' || t) and relkind = 'r') then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists %I on public.%I', t || '_deny_default_admin', t);
      execute format(
        'create policy %I on public.%I as restrictive for all using (not public.is_default_admin(auth.uid())) with check (not public.is_default_admin(auth.uid()))',
        t || '_deny_default_admin', t
      );
    end if;
  end loop;
end;
$$;

drop policy if exists storage_objects_deny_default_admin on storage.objects;
create policy storage_objects_deny_default_admin on storage.objects
as restrictive for all
using (not public.is_default_admin(auth.uid()))
with check (not public.is_default_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- 4. Cardinality: one DEFAULT_ADMIN, one ADMIN per organization
-- ---------------------------------------------------------------------------
create unique index if not exists profiles_single_default_admin
  on public.profiles ((true))
  where role = 'default_admin'::app_role;

do $$
begin
  if exists (
    select 1 from public.profiles where role = 'admin'::app_role and org_id is not null
    group by org_id having count(*) > 1
  ) then
    raise notice 'Some organizations have more than one ADMIN; profiles_one_admin_per_org was not created. Resolve duplicates and re-run.';
  else
    create unique index if not exists profiles_one_admin_per_org
      on public.profiles (org_id)
      where role = 'admin'::app_role;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Documents always belong to an organization and stay inside it
-- ---------------------------------------------------------------------------
create or replace function public.set_document_org_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_json jsonb := to_jsonb(new);
  creator uuid;
begin
  if new.org_id is null then
    creator := coalesce(
      nullif(row_json ->> 'owner_id', '')::uuid,
      nullif(row_json ->> 'uploaded_by', '')::uuid,
      nullif(row_json ->> 'user_id', '')::uuid
    );
    select p.org_id into new.org_id from public.profiles p where p.user_id = creator;
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_set_document_org_id on public.documents;
create trigger trigger_set_document_org_id
before insert on public.documents
for each row execute procedure public.set_document_org_id();

drop policy if exists documents_org_isolation on public.documents;
create policy documents_org_isolation on public.documents
as restrictive for all
using (org_id is null or org_id = public.current_org_id())
with check (org_id is null or org_id = public.current_org_id());

-- Folders are always organization-scoped; mirror the same boundary.
do $$
begin
  if to_regclass('public.folders') is not null then
    execute 'drop policy if exists folders_org_isolation on public.folders';
    execute 'create policy folders_org_isolation on public.folders as restrictive for all using (org_id = public.current_org_id()) with check (org_id = public.current_org_id())';
  end if;
end;
$$;

-- Backfill organization on legacy documents from their owner so the
-- "org_id is null" escape hatch above only covers genuinely firm-less data.
update public.documents d
set org_id = p.org_id
from public.profiles p
where d.org_id is null
  and p.user_id = d.owner_id
  and p.org_id is not null;

-- Document grants may never cross an organization boundary, including for
-- legacy documents that still have no org_id (their owner's org applies).
-- Helpers are SECURITY DEFINER because an ordinary Lawyer cannot read other
-- users' profile rows through RLS.
create or replace function public.org_of_user(target uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.profiles where user_id = target;
$$;

create or replace function public.document_effective_org(doc uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(d.org_id, public.org_of_user(d.owner_id)) from public.documents d where d.id = doc;
$$;

drop policy if exists document_permissions_same_org_insert on public.document_permissions;
create policy document_permissions_same_org_insert on public.document_permissions
as restrictive for insert
with check (public.org_of_user(user_id) is not distinct from public.document_effective_org(document_id));

drop policy if exists document_permissions_same_org_update on public.document_permissions;
create policy document_permissions_same_org_update on public.document_permissions
as restrictive for update
using (true)
with check (public.org_of_user(user_id) is not distinct from public.document_effective_org(document_id));

-- ---------------------------------------------------------------------------
-- 6. Signing requests: only a document's owner, within its own organization
-- ---------------------------------------------------------------------------
-- Replaces the legacy 003 policies, whose insert/update branches never tied a
-- request to a document the requester actually owns (and, through
-- is_administrator(), to any organization).
drop policy if exists signing_requests_insert_policy on public.signing_requests;
create policy signing_requests_insert_policy on public.signing_requests
for insert
with check (
  requested_by = auth.uid()
  and current_app_role() = 'lawyer'::app_role
  and exists (
    select 1 from public.documents d
    where d.id = document_id
      and d.owner_id = auth.uid()
      and (d.org_id is null or d.org_id = public.current_org_id())
  )
);

drop policy if exists signing_requests_update_policy on public.signing_requests;
create policy signing_requests_update_policy on public.signing_requests
for update
using (requested_by = auth.uid())
with check (requested_by = auth.uid());

-- Requests are revoked, never deleted; service-role code is unaffected.
drop policy if exists signing_requests_delete_policy on public.signing_requests;
