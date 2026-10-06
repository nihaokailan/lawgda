-- Filed is the final state once every signer has signed and the PDF is saved.
begin;

create or replace function public.enforce_document_status_transition()
returns trigger
language plpgsql
as $$
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  if new.status = 'Filed' then
    if not exists (
      select 1 from public.signing_requests where document_id = new.id
    ) or exists (
      select 1 from public.signing_requests
      where document_id = new.id and status is distinct from 'signed'
    ) or coalesce(new.metadata->>'signed_file_path', '') = '' then
      raise exception 'A document can only be Filed after every signer has signed and the signed PDF is saved';
    end if;
  end if;

  if old.status is null then
    return new;
  end if;

  if (old.status, new.status) in (
    ('Drafting', 'Pending'),
    ('Pending', 'Signed'),
    ('Drafting', 'Signed'),
    ('Drafting', 'Filed'),
    ('Pending', 'Filed'),
    ('Signed', 'Filed')
  ) then
    return new;
  end if;

  raise exception 'Invalid document status transition: % -> %', old.status, new.status;
end;
$$;

-- Upgrade existing completed workflows and retain an audit record of each change.
with eligible as materialized (
  select d.id, d.status
  from public.documents d
  where d.status in ('Drafting', 'Pending', 'Signed')
    and coalesce(d.metadata->>'signed_file_path', '') <> ''
    and exists (select 1 from public.signing_requests r where r.document_id = d.id)
    and not exists (
      select 1 from public.signing_requests r
      where r.document_id = d.id and r.status is distinct from 'signed'
    )
), updated as (
  update public.documents d set status = 'Filed'
  from eligible e where d.id = e.id
  returning d.id, e.status as previous_status
)
insert into public.audit_logs (document_id, actor_user_id, event_type, details)
select id, null, 'status_changed', jsonb_build_object(
  'from', previous_status, 'to', 'Filed', 'reason', 'completed_workflow_backfill'
) from updated;

commit;
