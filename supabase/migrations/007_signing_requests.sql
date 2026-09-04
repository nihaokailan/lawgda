-- Apply this migration to the connected Supabase project to enable guest signing.
-- It is safe to run after the canonical profiles/documents migrations.

create table if not exists public.signing_requests (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  internal_signer_id uuid references auth.users(id) on delete set null,
  signer_name text not null,
  signer_email text not null,
  signing_order integer not null default 1 check (signing_order > 0),
  enforce_sequential boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'viewed', 'signed', 'revoked', 'expired')),
  token_reference uuid not null default gen_random_uuid(),
  token_hash text not null unique,
  expires_at timestamptz not null,
  viewed_at timestamptz,
  signed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists signing_requests_document_idx on public.signing_requests(document_id);
create index if not exists signing_requests_email_idx on public.signing_requests(lower(signer_email));

create or replace function public.set_signing_request_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists trigger_set_signing_request_updated_at on public.signing_requests;
create trigger trigger_set_signing_request_updated_at
before update on public.signing_requests
for each row execute procedure public.set_signing_request_updated_at();

create table if not exists public.signing_audit_events (
  id uuid primary key default gen_random_uuid(),
  signing_request_id uuid references public.signing_requests(id) on delete set null,
  document_id uuid not null references public.documents(id) on delete cascade,
  event_type text not null,
  actor_type text not null check (actor_type in ('internal_user', 'external_signer', 'system')),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists signing_audit_document_idx on public.signing_audit_events(document_id, created_at desc);

alter table public.signing_requests enable row level security;
alter table public.signing_audit_events enable row level security;

drop policy if exists signing_requests_select_policy on public.signing_requests;
create policy signing_requests_select_policy on public.signing_requests for select using (
  requested_by = auth.uid()
  or internal_signer_id = auth.uid()
  or exists (select 1 from public.documents d where d.id = document_id and d.owner_id = auth.uid())
  or is_administrator(auth.uid())
);

drop policy if exists signing_audit_events_select_policy on public.signing_audit_events;
create policy signing_audit_events_select_policy on public.signing_audit_events for select using (
  exists (select 1 from public.documents d where d.id = document_id and d.owner_id = auth.uid())
  or is_administrator(auth.uid())
);
