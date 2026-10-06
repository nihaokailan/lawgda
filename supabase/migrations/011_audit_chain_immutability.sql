-- Makes the general audit_logs table append-only (mirrors signing_audit_events)
-- and adds a cryptographic hash chain to both audit tables so the log sequence
-- itself is tamper-evident, not just the documents it describes.

alter table public.audit_logs
  add column if not exists previous_hash text,
  add column if not exists record_hash text;

alter table public.signing_audit_events
  add column if not exists previous_hash text,
  add column if not exists record_hash text;

create or replace function public.prevent_audit_logs_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs is append-only';
end;
$$;

drop trigger if exists trigger_prevent_audit_logs_update on public.audit_logs;
create trigger trigger_prevent_audit_logs_update
before update on public.audit_logs
for each row
execute procedure public.prevent_audit_logs_mutation();

drop trigger if exists trigger_prevent_audit_logs_delete on public.audit_logs;
create trigger trigger_prevent_audit_logs_delete
before delete on public.audit_logs
for each row
execute procedure public.prevent_audit_logs_mutation();

create or replace function public.compute_audit_logs_chain_hash()
returns trigger
language plpgsql
as $$
declare
  prior_hash text;
begin
  select record_hash into prior_hash
  from public.audit_logs
  where document_id = new.document_id
  order by created_at desc, id desc
  limit 1;

  new.previous_hash := coalesce(prior_hash, repeat('0', 64));
  new.record_hash := encode(
    digest(
      coalesce(new.previous_hash, '') ||
      coalesce(new.id::text, '') ||
      coalesce(new.document_id::text, '') ||
      coalesce(new.event_type, '') ||
      coalesce(new.actor_user_id::text, '') ||
      coalesce(new.details::text, '{}') ||
      coalesce(new.created_at::text, now()::text),
      'sha256'
    ),
    'hex'
  );
  return new;
end;
$$;

drop trigger if exists trigger_compute_audit_logs_chain_hash on public.audit_logs;
create trigger trigger_compute_audit_logs_chain_hash
before insert on public.audit_logs
for each row
execute procedure public.compute_audit_logs_chain_hash();

create or replace function public.compute_signing_audit_chain_hash()
returns trigger
language plpgsql
as $$
declare
  prior_hash text;
begin
  select record_hash into prior_hash
  from public.signing_audit_events
  where document_id = new.document_id
  order by created_at desc, id desc
  limit 1;

  new.previous_hash := coalesce(prior_hash, repeat('0', 64));
  new.record_hash := encode(
    digest(
      coalesce(new.previous_hash, '') ||
      coalesce(new.id::text, '') ||
      coalesce(new.signing_request_id::text, '') ||
      coalesce(new.document_id::text, '') ||
      coalesce(new.event_type, '') ||
      coalesce(new.actor_type, '') ||
      coalesce(new.actor_user_id::text, '') ||
      coalesce(new.actor_email, '') ||
      coalesce(new.details::text, '{}') ||
      coalesce(new.created_at::text, now()::text),
      'sha256'
    ),
    'hex'
  );
  return new;
end;
$$;

drop trigger if exists trigger_compute_signing_audit_chain_hash on public.signing_audit_events;
create trigger trigger_compute_signing_audit_chain_hash
before insert on public.signing_audit_events
for each row
execute procedure public.compute_signing_audit_chain_hash();
