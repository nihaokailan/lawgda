-- Lawgda multi-tenant schema
-- Sprint 1 + Sprint 2 foundation using Supabase Auth, Postgres, and Storage.

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type app_role as enum ('admin', 'lawyer', 'staff');
  end if;
end;
$$;

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role app_role not null default 'staff',
  org_id uuid references organizations(id) on delete set null,
  admin_request_status text not null default 'none',
  requested_org_name text,
  admin_request_note text,
  admin_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_admin_request_status_check
    check (admin_request_status in ('none', 'pending', 'approved', 'rejected'))
);

create table if not exists folders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  parent_id uuid references folders(id) on delete cascade,
  name text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (org_id, parent_id, name)
);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  folder_id uuid references folders(id) on delete set null,
  name text not null,
  mime_type text,
  size_bytes bigint not null default 0,
  bucket text not null default 'org-documents',
  storage_path text not null,
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (bucket, storage_path)
);

create index if not exists idx_profiles_org_id on profiles(org_id);
create index if not exists idx_folders_org_parent on folders(org_id, parent_id);
create index if not exists idx_documents_org_folder on documents(org_id, folder_id);
create index if not exists idx_documents_path on documents(bucket, storage_path);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trigger_profiles_set_updated_at on profiles;
create trigger trigger_profiles_set_updated_at
before update on profiles
for each row
execute procedure set_updated_at();

create or replace function create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', null)
  )
  on conflict (user_id)
  do update
  set
    email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row
execute procedure create_profile_for_new_user();

insert into profiles (user_id, email, full_name)
select id, email, coalesce(raw_user_meta_data ->> 'full_name', null)
from auth.users
on conflict (user_id)
do update
set
  email = excluded.email,
  full_name = coalesce(profiles.full_name, excluded.full_name);

create or replace function current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from profiles where user_id = auth.uid();
$$;

create or replace function current_app_role()
returns app_role
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from profiles where user_id = auth.uid()), 'staff'::app_role);
$$;

create or replace function is_org_admin(user_uuid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from profiles p
    where p.user_id = user_uuid
      and p.role = 'admin'::app_role
      and p.org_id is not null
  );
$$;

create or replace function enforce_folder_parent_org()
returns trigger
language plpgsql
as $$
declare
  parent_org uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  select org_id into parent_org from folders where id = new.parent_id;

  if parent_org is null then
    raise exception 'Parent folder not found';
  end if;

  if parent_org <> new.org_id then
    raise exception 'Parent folder must belong to the same organization';
  end if;

  return new;
end;
$$;

drop trigger if exists trigger_enforce_folder_parent_org on folders;
create trigger trigger_enforce_folder_parent_org
before insert or update on folders
for each row
execute procedure enforce_folder_parent_org();

create or replace function enforce_document_folder_org()
returns trigger
language plpgsql
as $$
declare
  folder_org uuid;
begin
  if new.folder_id is null then
    return new;
  end if;

  select org_id into folder_org from folders where id = new.folder_id;

  if folder_org is null then
    raise exception 'Folder not found';
  end if;

  if folder_org <> new.org_id then
    raise exception 'Document folder must belong to the same organization';
  end if;

  return new;
end;
$$;

drop trigger if exists trigger_enforce_document_folder_org on documents;
create trigger trigger_enforce_document_folder_org
before insert or update on documents
for each row
execute procedure enforce_document_folder_org();

create or replace function get_folder_breadcrumbs(p_folder_id uuid)
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = public
as $$
  with recursive chain as (
    select f.id, f.name, f.parent_id, 0 as depth
    from folders f
    where f.id = p_folder_id
      and f.org_id = current_org_id()

    union all

    select p.id, p.name, p.parent_id, c.depth + 1
    from folders p
    join chain c on p.id = c.parent_id
  )
  select chain.id, chain.name
  from chain
  order by depth desc;
$$;

alter table profiles enable row level security;
alter table folders enable row level security;
alter table documents enable row level security;

drop policy if exists profiles_select_policy on profiles;
create policy profiles_select_policy on profiles
for select
using (
  auth.uid() = user_id
  or (
    is_org_admin(auth.uid())
    and org_id = current_org_id()
  )
);

drop policy if exists profiles_insert_policy on profiles;
create policy profiles_insert_policy on profiles
for insert
with check (
  auth.uid() = user_id
  or (
    is_org_admin(auth.uid())
    and org_id = current_org_id()
  )
);

drop policy if exists profiles_update_policy on profiles;
create policy profiles_update_policy on profiles
for update
using (
  auth.uid() = user_id
  or (
    is_org_admin(auth.uid())
    and org_id = current_org_id()
  )
)
with check (
  auth.uid() = user_id
  or (
    is_org_admin(auth.uid())
    and org_id = current_org_id()
  )
);

drop policy if exists folders_select_policy on folders;
create policy folders_select_policy on folders
for select
using (
  org_id = current_org_id()
);

drop policy if exists folders_insert_policy on folders;
create policy folders_insert_policy on folders
for insert
with check (
  auth.uid() = created_by
  and org_id = current_org_id()
);

drop policy if exists folders_update_policy on folders;
create policy folders_update_policy on folders
for update
using (
  org_id = current_org_id()
)
with check (
  org_id = current_org_id()
);

drop policy if exists folders_delete_policy on folders;
create policy folders_delete_policy on folders
for delete
using (
  org_id = current_org_id()
);

drop policy if exists documents_select_policy on documents;
create policy documents_select_policy on documents
for select
using (
  org_id = current_org_id()
);

drop policy if exists documents_insert_policy on documents;
create policy documents_insert_policy on documents
for insert
with check (
  uploaded_by = auth.uid()
  and org_id = current_org_id()
);

drop policy if exists documents_update_policy on documents;
create policy documents_update_policy on documents
for update
using (
  org_id = current_org_id()
)
with check (
  org_id = current_org_id()
);

drop policy if exists documents_delete_policy on documents;
create policy documents_delete_policy on documents
for delete
using (
  org_id = current_org_id()
);

insert into storage.buckets (id, name, public)
values ('org-documents', 'org-documents', false)
on conflict (id) do nothing;

drop policy if exists storage_objects_org_select on storage.objects;
create policy storage_objects_org_select on storage.objects
for select
using (
  bucket_id = 'org-documents'
  and split_part(name, '/', 1) = current_org_id()::text
);

drop policy if exists storage_objects_org_insert on storage.objects;
create policy storage_objects_org_insert on storage.objects
for insert
with check (
  bucket_id = 'org-documents'
  and split_part(name, '/', 1) = current_org_id()::text
);

drop policy if exists storage_objects_org_update on storage.objects;
create policy storage_objects_org_update on storage.objects
for update
using (
  bucket_id = 'org-documents'
  and split_part(name, '/', 1) = current_org_id()::text
)
with check (
  bucket_id = 'org-documents'
  and split_part(name, '/', 1) = current_org_id()::text
);

drop policy if exists storage_objects_org_delete on storage.objects;
create policy storage_objects_org_delete on storage.objects
for delete
using (
  bucket_id = 'org-documents'
  and split_part(name, '/', 1) = current_org_id()::text
);

-- Compatibility read model for existing routes that still read user_profiles.
create or replace view user_profiles as
select
  user_id,
  email,
  full_name,
  role::text as role,
  org_id,
  created_at,
  updated_at
from profiles;
