alter type app_role add value if not exists 'staff';

alter table user_profiles
  alter column role set default 'staff'::app_role;

alter table user_profiles
  add column if not exists is_internal boolean not null default true;

create table if not exists internal_user_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text,
  role app_role not null,
  invited_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'sent',
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint internal_user_invitations_status_check check (status in ('sent', 'accepted', 'revoked')),
  constraint internal_user_invitations_role_check check (role in ('administrator'::app_role, 'lawyer'::app_role, 'staff'::app_role))
);

alter table internal_user_invitations enable row level security;

drop policy if exists internal_user_invitations_select_policy on internal_user_invitations;
create policy internal_user_invitations_select_policy on internal_user_invitations
for select
using (is_administrator(auth.uid()));

drop policy if exists internal_user_invitations_insert_policy on internal_user_invitations;
create policy internal_user_invitations_insert_policy on internal_user_invitations
for insert
with check (is_administrator(auth.uid()) and invited_by = auth.uid());

drop policy if exists internal_user_invitations_update_policy on internal_user_invitations;
create policy internal_user_invitations_update_policy on internal_user_invitations
for update
using (is_administrator(auth.uid()))
with check (is_administrator(auth.uid()));

alter table documents
  add column if not exists sha256_hash text,
  add column if not exists hash_recorded_at timestamptz,
  add column if not exists document_history jsonb not null default '[]'::jsonb;

create table if not exists signing_requests (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  internal_signer_id uuid references auth.users(id) on delete set null,
  signer_name text not null,
  signer_email text not null,
  signing_order integer not null default 1,
  enforce_sequential boolean not null default false,
  status text not null default 'pending',
  token_reference uuid not null default gen_random_uuid(),
  token_hash text not null unique,
  expires_at timestamptz not null,
  viewed_at timestamptz,
  signed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint signing_requests_status_check check (status in ('pending', 'viewed', 'signed', 'revoked', 'expired')),
  constraint signing_requests_signing_order_check check (signing_order > 0)
);

create index if not exists signing_requests_document_idx on signing_requests(document_id);
create index if not exists signing_requests_email_idx on signing_requests(lower(signer_email));
create index if not exists signing_requests_internal_signer_idx on signing_requests(internal_signer_id);

create or replace function set_signing_request_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trigger_set_signing_request_updated_at on signing_requests;
create trigger trigger_set_signing_request_updated_at
before update on signing_requests
for each row
execute procedure set_signing_request_updated_at();

create table if not exists signing_audit_events (
  id uuid primary key default gen_random_uuid(),
  signing_request_id uuid references signing_requests(id) on delete set null,
  document_id uuid not null references documents(id) on delete cascade,
  event_type text not null,
  actor_type text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint signing_audit_actor_type_check check (actor_type in ('internal_user', 'external_signer', 'system')),
  constraint signing_audit_event_type_check check (
    event_type in (
      'request_created',
      'invitation_sent',
      'document_viewed',
      'signer_verified',
      'signing_completed',
      'request_revoked',
      'request_expired'
    )
  )
);

create index if not exists signing_audit_document_idx on signing_audit_events(document_id, created_at desc);
create index if not exists signing_audit_request_idx on signing_audit_events(signing_request_id, created_at desc);

alter table signing_requests enable row level security;
alter table signing_audit_events enable row level security;

drop policy if exists signing_requests_select_policy on signing_requests;
create policy signing_requests_select_policy on signing_requests
for select
using (
  is_administrator(auth.uid())
  or requested_by = auth.uid()
  or internal_signer_id = auth.uid()
  or exists (
    select 1
    from documents d
    where d.id = document_id
      and d.user_id = auth.uid()
  )
);

drop policy if exists signing_requests_insert_policy on signing_requests;
create policy signing_requests_insert_policy on signing_requests
for insert
with check (
  requested_by = auth.uid()
  and (
    is_administrator(auth.uid())
    or current_app_role() = 'lawyer'::app_role
  )
);

drop policy if exists signing_requests_update_policy on signing_requests;
create policy signing_requests_update_policy on signing_requests
for update
using (
  is_administrator(auth.uid())
  or requested_by = auth.uid()
)
with check (
  is_administrator(auth.uid())
  or requested_by = auth.uid()
);

drop policy if exists signing_requests_delete_policy on signing_requests;
create policy signing_requests_delete_policy on signing_requests
for delete
using (is_administrator(auth.uid()));

drop policy if exists signing_audit_events_select_policy on signing_audit_events;
create policy signing_audit_events_select_policy on signing_audit_events
for select
using (
  is_administrator(auth.uid())
  or exists (
    select 1
    from signing_requests sr
    where sr.id = signing_request_id
      and (sr.requested_by = auth.uid() or sr.internal_signer_id = auth.uid())
  )
  or exists (
    select 1
    from documents d
    where d.id = document_id
      and d.user_id = auth.uid()
  )
);

create or replace function prevent_signing_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'signing_audit_events is append-only';
end;
$$;

drop trigger if exists trigger_prevent_signing_audit_update on signing_audit_events;
create trigger trigger_prevent_signing_audit_update
before update on signing_audit_events
for each row
execute procedure prevent_signing_audit_mutation();

drop trigger if exists trigger_prevent_signing_audit_delete on signing_audit_events;
create trigger trigger_prevent_signing_audit_delete
before delete on signing_audit_events
for each row
execute procedure prevent_signing_audit_mutation();

create or replace function create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (user_id, email, full_name, role, is_internal)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', null),
    'staff'::app_role,
    true
  )
  on conflict (user_id)
  do update
  set
    email = excluded.email,
    full_name = coalesce(public.user_profiles.full_name, excluded.full_name),
    is_internal = true;
  return new;
end;
$$;

update user_profiles
set is_internal = true
where is_internal is distinct from true;

drop policy if exists user_profiles_select_policy on user_profiles;
create policy user_profiles_select_policy on user_profiles
for select
using (
  auth.uid() = user_id
  or is_administrator(auth.uid())
  or current_app_role() in ('lawyer'::app_role, 'staff'::app_role)
);

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'signature_requests'
  ) and not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'legacy_signature_requests'
  ) then
    alter table signature_requests rename to legacy_signature_requests;
  end if;
end;
$$;
