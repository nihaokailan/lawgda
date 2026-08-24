-- Canonical application contract: profiles + owner_id/title/file_path.
-- Legacy user_profiles rows are copied once; application code must use profiles.

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type app_role as enum ('admin', 'lawyer', 'staff');
  end if;

  alter type app_role add value if not exists 'admin';
  alter type app_role add value if not exists 'lawyer';
  alter type app_role add value if not exists 'staff';
end;
$$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role app_role not null default 'staff'::app_role,
  org_id uuid references public.organizations(id) on delete set null,
  admin_request_status text not null default 'none',
  requested_org_name text,
  admin_request_note text,
  admin_requested_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists org_id uuid references public.organizations(id) on delete set null,
  add column if not exists admin_request_status text not null default 'none',
  add column if not exists requested_org_name text,
  add column if not exists admin_request_note text,
  add column if not exists admin_requested_at timestamptz,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.profiles
  drop constraint if exists profiles_admin_request_status_check;

alter table public.profiles
  add constraint profiles_admin_request_status_check
  check (admin_request_status in ('none', 'pending', 'approved', 'rejected'));

-- Normalize legacy role names while preserving existing organization assignments.
insert into public.profiles (user_id, email, full_name, role, is_active)
select
  legacy.user_id,
  legacy.email,
  legacy.full_name,
  case
    when legacy.role::text in ('administrator', 'admin') then 'admin'::app_role
    when legacy.role::text = 'lawyer' then 'lawyer'::app_role
    else 'staff'::app_role
  end,
  coalesce(legacy.is_active, true)
from public.user_profiles legacy
on conflict (user_id) do update
set
  email = coalesce(public.profiles.email, excluded.email),
  full_name = coalesce(public.profiles.full_name, excluded.full_name),
  role = case
    when public.profiles.role::text = 'admin' then public.profiles.role
    else excluded.role
  end,
  is_active = coalesce(public.profiles.is_active, excluded.is_active);

create or replace function current_app_role()
returns app_role
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where user_id = auth.uid()), 'staff'::app_role);
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
    from public.profiles
    where user_id = user_uuid
      and role = 'admin'::app_role
      and coalesce(is_active, true) = true
  );
$$;

create or replace function create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, full_name, role, is_active)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name', 'staff'::app_role, true)
  on conflict (user_id) do update
  set email = excluded.email,
      full_name = coalesce(public.profiles.full_name, excluded.full_name);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute procedure create_profile_for_new_user();

alter table public.profiles enable row level security;

drop policy if exists profiles_select_policy on public.profiles;
create policy profiles_select_policy on public.profiles
for select using (auth.uid() = user_id or is_administrator(auth.uid()));

drop policy if exists profiles_insert_policy on public.profiles;
create policy profiles_insert_policy on public.profiles
for insert with check (auth.uid() = user_id or is_administrator(auth.uid()));

drop policy if exists profiles_update_policy on public.profiles;
create policy profiles_update_policy on public.profiles
for update
using (auth.uid() = user_id or is_administrator(auth.uid()))
with check (auth.uid() = user_id or is_administrator(auth.uid()));

drop policy if exists profiles_delete_policy on public.profiles;
create policy profiles_delete_policy on public.profiles
for delete using (is_administrator(auth.uid()));

create index if not exists idx_profiles_org_id on public.profiles(org_id);
create index if not exists idx_profiles_role on public.profiles(role);

-- Canonical document aliases are added by migration 005 where needed.
-- New application code should use owner_id, title, and file_path only.
