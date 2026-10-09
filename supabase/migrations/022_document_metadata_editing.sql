-- Staff/Lawyer data entry and indexing (title, case number, tags) with an
-- audit record that cannot be skipped. The edit and both audit rows are
-- written by one function in one transaction: if logging fails, the edit is
-- rolled back, so there is no way to change a document's details silently.
--   * audit_logs        — hash-chained; shows on the document's timeline
--   * granular_audit_log — one row per changed field (old -> new) for admins

begin;

alter table public.documents
  add column if not exists case_number text,
  add column if not exists tags text[] not null default '{}';

create or replace function public.update_document_metadata(
  p_document_id uuid,
  p_actor uuid,
  p_actor_role app_role,
  p_title text default null,
  p_case_number text default null,
  p_tags text[] default null,
  p_note text default null
)
returns public.documents
language plpgsql
security definer
-- `extensions` is where Supabase installs pgcrypto (digest() for the audit chain).
set search_path = public, extensions
as $$
declare
  before_row public.documents;
  after_row public.documents;
  changes jsonb := '[]'::jsonb;
begin
  select * into before_row from public.documents where id = p_document_id for update;
  if not found then
    raise exception 'Document not found';
  end if;
  if before_row.status = 'Filed' then
    raise exception 'Filed documents are locked; their details can no longer be edited.';
  end if;

  update public.documents
  set title = coalesce(nullif(btrim(p_title), ''), title),
      case_number = case when p_case_number is null then case_number else nullif(btrim(p_case_number), '') end,
      tags = coalesce(p_tags, tags)
  where id = p_document_id
  returning * into after_row;

  if before_row.title is distinct from after_row.title then
    changes := changes || jsonb_build_object('field', 'title', 'old', before_row.title, 'new', after_row.title);
  end if;
  if before_row.case_number is distinct from after_row.case_number then
    changes := changes || jsonb_build_object('field', 'case_number', 'old', before_row.case_number, 'new', after_row.case_number);
  end if;
  if before_row.tags is distinct from after_row.tags then
    changes := changes || jsonb_build_object('field', 'tags',
      'old', array_to_string(before_row.tags, ', '), 'new', array_to_string(after_row.tags, ', '));
  end if;

  if jsonb_array_length(changes) = 0 then
    return after_row;
  end if;

  insert into public.audit_logs (document_id, actor_user_id, event_type, details)
  values (p_document_id, p_actor, 'metadata_updated',
          jsonb_build_object('changes', changes, 'role', p_actor_role, 'note', nullif(btrim(coalesce(p_note, '')), '')));

  insert into public.granular_audit_log
    (actor_user_id, actor_role, action, resource_table, resource_id, field_name, old_value, new_value, metadata, org_id)
  select p_actor, p_actor_role, 'update', 'documents', p_document_id::text,
         change->>'field', change->>'old', change->>'new',
         jsonb_build_object('source', 'update_document_metadata'), after_row.org_id
  from jsonb_array_elements(changes) as change;

  return after_row;
end;
$$;

-- Server-only: callable with the service role, never from a browser session.
revoke all on function public.update_document_metadata(uuid, uuid, app_role, text, text, text[], text) from public, anon, authenticated;
grant execute on function public.update_document_metadata(uuid, uuid, app_role, text, text, text[], text) to service_role;

commit;
