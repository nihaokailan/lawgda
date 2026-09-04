-- Ensure documents are scoped to an organization and backfill existing rows.

alter table public.documents
  add column if not exists org_id uuid references public.organizations(id) on delete set null;

create index if not exists idx_documents_org_id on public.documents(org_id);

update public.documents d
set org_id = p.org_id
from public.profiles p
where d.org_id is null
  and d.owner_id = p.user_id;

update public.documents d
set org_id = p.org_id
from public.profiles p
where d.org_id is null
  and d.uploaded_by = p.user_id;

update public.documents d
set org_id = p.org_id
from public.profiles p
where d.org_id is null
  and d.user_id = p.user_id;
