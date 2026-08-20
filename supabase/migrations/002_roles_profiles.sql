do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type app_role as enum (
      'administrator',
      'lawyer',
      'paralegal',
      'signer'
    );
  end if;
end;
$$;

create table if not exists user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role app_role not null default 'signer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function set_profile_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trigger_set_profile_updated_at on user_profiles;
create trigger trigger_set_profile_updated_at
before update on user_profiles
for each row
execute procedure set_profile_updated_at();

create or replace function create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (user_id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', null))
  on conflict (user_id)
  do update
  set
    email = excluded.email,
    full_name = coalesce(public.user_profiles.full_name, excluded.full_name);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure create_profile_for_new_user();

insert into user_profiles (user_id, email, full_name)
select id, email, coalesce(raw_user_meta_data ->> 'full_name', null)
from auth.users
on conflict (user_id)
do update
set
  email = excluded.email,
  full_name = coalesce(user_profiles.full_name, excluded.full_name);

create or replace function current_app_role()
returns app_role
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from user_profiles where user_id = auth.uid()), 'signer'::app_role);
$$;

create or replace function is_administrator(user_uuid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from user_profiles
    where user_id = user_uuid
      and role = 'administrator'::app_role
  );
$$;

create or replace function enforce_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role is distinct from new.role and not is_administrator(auth.uid()) then
    raise exception 'Only administrators can change user roles';
  end if;

  return new;
end;
$$;

drop trigger if exists trigger_enforce_profile_role_change on user_profiles;
create trigger trigger_enforce_profile_role_change
before update on user_profiles
for each row
execute procedure enforce_profile_role_change();

alter table user_profiles enable row level security;

drop policy if exists user_profiles_select_policy on user_profiles;
create policy user_profiles_select_policy on user_profiles
for select
using (auth.uid() = user_id or is_administrator(auth.uid()));

drop policy if exists user_profiles_insert_policy on user_profiles;
create policy user_profiles_insert_policy on user_profiles
for insert
with check (auth.uid() = user_id or is_administrator(auth.uid()));

drop policy if exists user_profiles_update_policy on user_profiles;
create policy user_profiles_update_policy on user_profiles
for update
using (auth.uid() = user_id or is_administrator(auth.uid()))
with check (auth.uid() = user_id or is_administrator(auth.uid()));

drop policy if exists user_profiles_delete_policy on user_profiles;
create policy user_profiles_delete_policy on user_profiles
for delete
using (is_administrator(auth.uid()));

create table if not exists document_assignments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  assignee_id uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (document_id, assignee_id)
);

create table if not exists signature_requests (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  signer_id uuid not null references auth.users(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint signature_requests_status_check check (status in ('pending', 'signed', 'declined', 'cancelled'))
);

alter table cases alter column user_id set default auth.uid();
alter table documents alter column user_id set default auth.uid();

alter table document_assignments enable row level security;
alter table signature_requests enable row level security;

create or replace function set_signature_request_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trigger_set_signature_request_updated_at on signature_requests;
create trigger trigger_set_signature_request_updated_at
before update on signature_requests
for each row
execute procedure set_signature_request_updated_at();

drop policy if exists document_assignments_select_policy on document_assignments;
create policy document_assignments_select_policy on document_assignments
for select
using (
  is_administrator(auth.uid())
  or assignee_id = auth.uid()
  or assigned_by = auth.uid()
  or exists (
    select 1
    from documents d
    where d.id = document_id
      and d.user_id = auth.uid()
  )
);

drop policy if exists document_assignments_insert_policy on document_assignments;
create policy document_assignments_insert_policy on document_assignments
for insert
with check (
  assigned_by = auth.uid()
  and (
    is_administrator(auth.uid())
    or current_app_role() in ('lawyer'::app_role, 'paralegal'::app_role)
  )
);

drop policy if exists document_assignments_delete_policy on document_assignments;
create policy document_assignments_delete_policy on document_assignments
for delete
using (
  is_administrator(auth.uid())
  or assigned_by = auth.uid()
);

drop policy if exists signature_requests_select_policy on signature_requests;
create policy signature_requests_select_policy on signature_requests
for select
using (
  is_administrator(auth.uid())
  or signer_id = auth.uid()
  or requested_by = auth.uid()
  or exists (
    select 1
    from documents d
    where d.id = document_id
      and d.user_id = auth.uid()
  )
);

drop policy if exists signature_requests_insert_policy on signature_requests;
create policy signature_requests_insert_policy on signature_requests
for insert
with check (
  requested_by = auth.uid()
  and (
    is_administrator(auth.uid())
    or current_app_role() in ('lawyer'::app_role, 'paralegal'::app_role)
  )
);

drop policy if exists signature_requests_update_policy on signature_requests;
create policy signature_requests_update_policy on signature_requests
for update
using (
  is_administrator(auth.uid())
  or requested_by = auth.uid()
  or signer_id = auth.uid()
)
with check (
  is_administrator(auth.uid())
  or requested_by = auth.uid()
  or signer_id = auth.uid()
);

drop policy if exists signature_requests_delete_policy on signature_requests;
create policy signature_requests_delete_policy on signature_requests
for delete
using (
  is_administrator(auth.uid())
  or requested_by = auth.uid()
);

drop policy if exists cases_select_owner on cases;
drop policy if exists cases_insert_authenticated on cases;
drop policy if exists cases_update_owner on cases;
drop policy if exists cases_delete_owner on cases;

create policy cases_select_access_policy on cases
for select
using (
  is_administrator(auth.uid())
  or user_id = auth.uid()
);

create policy cases_insert_access_policy on cases
for insert
with check (
  user_id = auth.uid()
  and (
    is_administrator(auth.uid())
    or current_app_role() in ('lawyer'::app_role, 'paralegal'::app_role)
  )
);

create policy cases_update_access_policy on cases
for update
using (
  is_administrator(auth.uid())
  or user_id = auth.uid()
)
with check (
  is_administrator(auth.uid())
  or (
    user_id = auth.uid()
    and current_app_role() in ('lawyer'::app_role, 'paralegal'::app_role)
  )
);

create policy cases_delete_access_policy on cases
for delete
using (
  is_administrator(auth.uid())
  or (
    user_id = auth.uid()
    and current_app_role() in ('lawyer'::app_role, 'paralegal'::app_role)
  )
);

drop policy if exists documents_select_owner on documents;
drop policy if exists documents_insert_authenticated on documents;
drop policy if exists documents_update_owner on documents;
drop policy if exists documents_delete_owner on documents;

create policy documents_select_access_policy on documents
for select
using (
  is_administrator(auth.uid())
  or user_id = auth.uid()
  or exists (
    select 1
    from document_assignments a
    where a.document_id = id
      and a.assignee_id = auth.uid()
  )
);

create policy documents_insert_access_policy on documents
for insert
with check (
  user_id = auth.uid()
  and (
    is_administrator(auth.uid())
    or current_app_role() in ('lawyer'::app_role, 'paralegal'::app_role)
  )
);

create policy documents_update_access_policy on documents
for update
using (
  is_administrator(auth.uid())
  or user_id = auth.uid()
)
with check (
  is_administrator(auth.uid())
  or (
    user_id = auth.uid()
    and current_app_role() in ('lawyer'::app_role, 'paralegal'::app_role)
  )
);

create policy documents_delete_access_policy on documents
for delete
using (
  is_administrator(auth.uid())
  or (
    user_id = auth.uid()
    and current_app_role() in ('lawyer'::app_role, 'paralegal'::app_role)
  )
);
