-- Case folders: a firm-scoped case that groups documents and backs the
-- printable QR label for the physical case folder.
--   * Each case belongs to an organization and carries a case number.
--   * A document belongs to at most one case (documents.case_id).
--   * Joining a case fills the document's case number from the case; renaming
--     a case updates every non-Filed document in it (Filed records keep the
--     number they were filed under).
--   * Deleting a case can never delete its documents.
-- All writes go through the functions below (service role only), so every
-- change is recorded in the audit trail in the same transaction.

begin;

alter table public.cases
  add column if not exists org_id uuid references public.organizations(id) on delete set null,
  add column if not exists case_number text,
  add column if not exists updated_at timestamptz not null default now();

update public.cases c
set org_id = p.org_id
from public.profiles p
where c.org_id is null and p.user_id = c.owner_id;

create index if not exists idx_cases_org_id on public.cases(org_id);

-- Replace any existing documents.case_id foreign key (earlier migrations
-- created it with ON DELETE CASCADE) with one that blocks deleting a case
-- while documents are still in it.
do $$
declare
  fk record;
begin
  for fk in
    select con.conname
    from pg_constraint con
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
    where con.conrelid = 'public.documents'::regclass
      and con.contype = 'f'
      and att.attname = 'case_id'
  loop
    execute format('alter table public.documents drop constraint %I', fk.conname);
  end loop;
end;
$$;

alter table public.documents
  add constraint documents_case_id_fkey
  foreign key (case_id) references public.cases(id) on delete restrict;

-- Access: Lawyers and Staff of the case's firm, the case creator, and anyone
-- granted access to a document in the case may read it. There are no
-- insert/update/delete policies: browser sessions cannot write cases at all.
-- (The restrictive cases_deny_default_admin policy from 018 still applies.)
drop policy if exists cases_select_access_policy on public.cases;
drop policy if exists cases_insert_access_policy on public.cases;
drop policy if exists cases_update_access_policy on public.cases;
drop policy if exists cases_delete_access_policy on public.cases;
drop policy if exists cases_select_policy on public.cases;
drop policy if exists cases_insert_policy on public.cases;
drop policy if exists cases_update_policy on public.cases;
drop policy if exists cases_delete_policy on public.cases;

create or replace function public.is_case_firm_member(p_org_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_org_id is not null and exists (
    select 1 from public.profiles p
    where p.user_id = p_user_id
      and p.org_id = p_org_id
      and p.role in ('lawyer', 'staff')
      and p.is_active is not false
  );
$$;

create policy cases_select_policy
on public.cases
for select
using (
  owner_id = auth.uid()
  or public.is_case_firm_member(org_id, auth.uid())
  or exists (
    select 1
    from public.documents d
    left join public.document_permissions dp on dp.document_id = d.id
    where d.case_id = cases.id
      and (d.owner_id = auth.uid() or dp.user_id = auth.uid())
  )
);

-- Case-level changes are recorded in the field-level accountability log
-- (resource_table = 'cases'); document-level changes go to each document's
-- hash-chained audit trail.
create or replace function public.create_case(
  p_actor uuid,
  p_actor_role app_role,
  p_org_id uuid,
  p_title text,
  p_case_number text
)
returns public.cases
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  created public.cases;
begin
  if nullif(btrim(coalesce(p_title, '')), '') is null then
    raise exception 'A case title is required.';
  end if;

  insert into public.cases (owner_id, org_id, title, case_number)
  values (p_actor, p_org_id, btrim(p_title), nullif(btrim(coalesce(p_case_number, '')), ''))
  returning * into created;

  insert into public.granular_audit_log
    (actor_user_id, actor_role, action, resource_table, resource_id, field_name, old_value, new_value, metadata, org_id)
  values
    (p_actor, p_actor_role, 'insert', 'cases', created.id::text, 'title', null, created.title,
     jsonb_build_object('source', 'create_case', 'case_number', created.case_number), p_org_id);

  return created;
end;
$$;

create or replace function public.rename_case(
  p_case_id uuid,
  p_actor uuid,
  p_actor_role app_role,
  p_title text,
  p_case_number text,
  p_note text default null
)
returns public.cases
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  before_row public.cases;
  after_row public.cases;
  doc record;
begin
  select * into before_row from public.cases where id = p_case_id for update;
  if not found then
    raise exception 'Case not found.';
  end if;
  if nullif(btrim(coalesce(p_title, '')), '') is null then
    raise exception 'A case title is required.';
  end if;

  update public.cases
  set title = btrim(p_title),
      case_number = nullif(btrim(coalesce(p_case_number, '')), ''),
      updated_at = now()
  where id = p_case_id
  returning * into after_row;

  if before_row.title is distinct from after_row.title then
    insert into public.granular_audit_log
      (actor_user_id, actor_role, action, resource_table, resource_id, field_name, old_value, new_value, metadata, org_id)
    values (p_actor, p_actor_role, 'update', 'cases', p_case_id::text, 'title', before_row.title, after_row.title,
            jsonb_build_object('source', 'rename_case', 'note', nullif(btrim(coalesce(p_note, '')), '')), after_row.org_id);
  end if;

  if before_row.case_number is distinct from after_row.case_number then
    insert into public.granular_audit_log
      (actor_user_id, actor_role, action, resource_table, resource_id, field_name, old_value, new_value, metadata, org_id)
    values (p_actor, p_actor_role, 'update', 'cases', p_case_id::text, 'case_number', before_row.case_number, after_row.case_number,
            jsonb_build_object('source', 'rename_case', 'note', nullif(btrim(coalesce(p_note, '')), '')), after_row.org_id);

    -- Like renaming a folder: every document in the case follows, each change
    -- logged on that document's own audit trail. Filed documents are locked
    -- and keep the number they were filed under.
    for doc in
      select id from public.documents
      where case_id = p_case_id
        and status is distinct from 'Filed'
        and case_number is distinct from after_row.case_number
    loop
      perform public.update_document_metadata(
        doc.id, p_actor, p_actor_role, null, coalesce(after_row.case_number, ''), null,
        coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Case folder renumbered')
      );
    end loop;
  end if;

  return after_row;
end;
$$;

create or replace function public.add_document_to_case(
  p_document_id uuid,
  p_case_id uuid,
  p_actor uuid,
  p_actor_role app_role
)
returns public.documents
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target_case public.cases;
  doc public.documents;
begin
  select * into target_case from public.cases where id = p_case_id for share;
  if not found then
    raise exception 'Case not found.';
  end if;

  select * into doc from public.documents where id = p_document_id for update;
  if not found then
    raise exception 'Document not found.';
  end if;
  if doc.org_id is distinct from target_case.org_id then
    raise exception 'Document not found.';
  end if;
  if doc.case_id is not null then
    raise exception 'This document is already in a case folder. Remove it from that case first.';
  end if;
  if doc.status = 'Filed' then
    raise exception 'Filed documents are locked and cannot be moved into a case folder.';
  end if;

  update public.documents set case_id = p_case_id where id = p_document_id;

  insert into public.audit_logs (document_id, actor_user_id, event_type, details)
  values (p_document_id, p_actor, 'added_to_case',
          jsonb_build_object('case_id', p_case_id, 'case_title', target_case.title,
                             'case_number', target_case.case_number, 'role', p_actor_role));

  -- Fill in the case number from the case (logged as a details edit).
  if doc.case_number is distinct from target_case.case_number then
    perform public.update_document_metadata(
      p_document_id, p_actor, p_actor_role, null, coalesce(target_case.case_number, ''), null,
      'Case number filled in from case folder'
    );
  end if;

  select * into doc from public.documents where id = p_document_id;
  return doc;
end;
$$;

create or replace function public.remove_document_from_case(
  p_document_id uuid,
  p_case_id uuid,
  p_actor uuid,
  p_actor_role app_role
)
returns public.documents
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target_case public.cases;
  doc public.documents;
begin
  select * into doc from public.documents where id = p_document_id for update;
  if not found or doc.case_id is distinct from p_case_id then
    raise exception 'Document not found in this case.';
  end if;
  if doc.status = 'Filed' then
    raise exception 'Filed documents are locked and cannot be removed from their case folder.';
  end if;

  select * into target_case from public.cases where id = p_case_id;

  update public.documents set case_id = null where id = p_document_id returning * into doc;

  insert into public.audit_logs (document_id, actor_user_id, event_type, details)
  values (p_document_id, p_actor, 'removed_from_case',
          jsonb_build_object('case_id', p_case_id, 'case_title', target_case.title,
                             'case_number', target_case.case_number, 'role', p_actor_role));

  return doc;
end;
$$;

-- Server-only: callable with the service role, never from a browser session.
revoke all on function public.create_case(uuid, app_role, uuid, text, text) from public, anon, authenticated;
revoke all on function public.rename_case(uuid, uuid, app_role, text, text, text) from public, anon, authenticated;
revoke all on function public.add_document_to_case(uuid, uuid, uuid, app_role) from public, anon, authenticated;
revoke all on function public.remove_document_from_case(uuid, uuid, uuid, app_role) from public, anon, authenticated;
grant execute on function public.create_case(uuid, app_role, uuid, text, text) to service_role;
grant execute on function public.rename_case(uuid, uuid, app_role, text, text, text) to service_role;
grant execute on function public.add_document_to_case(uuid, uuid, uuid, app_role) to service_role;
grant execute on function public.remove_document_from_case(uuid, uuid, uuid, app_role) to service_role;

commit;
