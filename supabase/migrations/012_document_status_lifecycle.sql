-- Enforces valid document status-lifecycle transitions at the database level
-- so no application code path (including future ones) can set an invalid
-- status jump. 'Filed' is intentionally left unreachable for now — only its
-- column value and CHECK constraint already exist from earlier migrations.

create or replace function public.enforce_document_status_transition()
returns trigger
language plpgsql
as $$
begin
  -- No actual status change (other fields on the row may still be updated freely).
  if old.status is not distinct from new.status then
    return new;
  end if;

  -- Legacy/backfilled rows with no recorded status yet may adopt any status once.
  if old.status is null then
    return new;
  end if;

  if (old.status, new.status) in (
    ('Drafting', 'Pending'),
    ('Pending', 'Signed'),
    ('Drafting', 'Signed') -- defensive fallback for rows that skipped the Pending step
  ) then
    return new;
  end if;

  raise exception 'Invalid document status transition: % -> %', old.status, new.status;
end;
$$;

drop trigger if exists trigger_enforce_document_status_transition on public.documents;
create trigger trigger_enforce_document_status_transition
before update on public.documents
for each row
execute procedure public.enforce_document_status_transition();
