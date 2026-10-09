-- Closes two gaps in the audit trail's integrity guarantees.
--
-- 1. Forged entries. Migration 005 let ANY signed-in user insert into
--    audit_logs (`with check (auth.uid() is not null)`), so a browser session
--    could append events under another user's name or for another firm's
--    document, and the hash chain would link them in as genuine. All audit
--    writes now go through server code using the service role (which bypasses
--    RLS); browser sessions can no longer write any audit table.
--
-- 2. Chain forks. Two events for the same document inserted concurrently
--    could both read the same "previous" hash. A per-document transaction
--    advisory lock now serialises chain computation.

begin;

drop policy if exists audit_logs_insert_policy on public.audit_logs;

do $$
declare
  t text;
begin
  foreach t in array array['audit_logs', 'signing_audit_events', 'granular_audit_log'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists %I on public.%I', t || '_no_client_insert', t);
      -- Restrictive: overrides any permissive insert policy added later.
      execute format(
        'create policy %I on public.%I as restrictive for insert to anon, authenticated with check (false)',
        t || '_no_client_insert', t
      );
    end if;
  end loop;
end;
$$;

create or replace function public.compute_audit_logs_chain_hash()
returns trigger
language plpgsql
as $$
declare
  prior_hash text;
begin
  perform pg_advisory_xact_lock(hashtextextended('audit_logs:' || coalesce(new.document_id::text, ''), 0));

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

create or replace function public.compute_signing_audit_chain_hash()
returns trigger
language plpgsql
as $$
declare
  prior_hash text;
begin
  perform pg_advisory_xact_lock(hashtextextended('signing_audit_events:' || coalesce(new.document_id::text, ''), 0));

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

commit;
