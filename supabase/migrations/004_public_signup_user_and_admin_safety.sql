do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type app_role as enum (
      'administrator',
      'lawyer',
      'staff',
      'user'
    );
  end if;
end;
$$;

alter type app_role add value if not exists 'user';

update user_profiles
set role = 'user'::app_role
where role::text in ('signer');

alter table user_profiles
  alter column role set default 'user'::app_role;

alter table user_profiles
  add column if not exists is_active boolean not null default true;

alter table internal_user_invitations
  drop constraint if exists internal_user_invitations_role_check;

alter table internal_user_invitations
  add constraint internal_user_invitations_role_check
  check (role in ('administrator'::app_role, 'lawyer'::app_role, 'staff'::app_role, 'user'::app_role));

create or replace function count_active_admins()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from user_profiles
  where role = 'administrator'::app_role
    and coalesce(is_active, true) = true;
$$;

create or replace function enforce_last_admin_safety()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admins integer;
begin
  admins := count_active_admins();

  if tg_op = 'DELETE' then
    if old.role = 'administrator'::app_role and coalesce(old.is_active, true) = true and admins <= 1 then
      raise exception 'Cannot delete the last active administrator';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.role = 'administrator'::app_role and coalesce(old.is_active, true) = true then
      if (new.role is distinct from old.role or coalesce(new.is_active, true) = false) and admins <= 1 then
        raise exception 'Cannot remove or deactivate the last active administrator';
      end if;
    end if;
    return new;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trigger_enforce_last_admin_safety_update on user_profiles;
create trigger trigger_enforce_last_admin_safety_update
before update on user_profiles
for each row
execute procedure enforce_last_admin_safety();

drop trigger if exists trigger_enforce_last_admin_safety_delete on user_profiles;
create trigger trigger_enforce_last_admin_safety_delete
before delete on user_profiles
for each row
execute procedure enforce_last_admin_safety();

create or replace function create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (user_id, email, full_name, role, is_internal, is_active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', null),
    'user'::app_role,
    true,
    true
  )
  on conflict (user_id)
  do update
  set
    email = excluded.email,
    full_name = coalesce(public.user_profiles.full_name, excluded.full_name),
    is_internal = true,
    is_active = true,
    role = case
      when public.user_profiles.role = 'administrator'::app_role then 'administrator'::app_role
      else 'user'::app_role
    end;

  return new;
end;
$$;

update user_profiles
set is_active = true
where is_active is null;
