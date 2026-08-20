create extension if not exists "pgcrypto";

create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now()
);

alter table public.cases
  add column if not exists owner_id uuid references auth.users(id) on delete cascade,
  add column if not exists title text,
  add column if not exists created_at timestamptz not null default now();

update public.cases
set owner_id = coalesce(owner_id, user_id)
where owner_id is null;

update public.cases
set title = coalesce(nullif(title, ''), 'Untitled Case')
where title is null or title = '';

alter table public.cases
  alter column owner_id set not null,
  alter column title set not null;

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.cases(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete cascade,
  title text not null,
  file_path text not null,
  sha256_hash text,
  status text not null default 'Drafting',
  created_at timestamptz not null default now(),
  constraint documents_status_check check (status in ('Drafting', 'Pending', 'Signed', 'Filed'))
);

alter table public.documents
  add column if not exists case_id uuid references public.cases(id) on delete cascade,
  add column if not exists owner_id uuid references auth.users(id) on delete cascade,
  add column if not exists title text,
  add column if not exists file_path text,
  add column if not exists sha256_hash text,
  add column if not exists status text,
  add column if not exists created_at timestamptz not null default now();

update public.documents
set owner_id = coalesce(owner_id, user_id)
where owner_id is null;

update public.documents
set title = coalesce(nullif(title, ''), nullif(name, ''), nullif(filename, ''), 'Untitled Document')
where title is null or title = '';

update public.documents
set file_path = coalesce(nullif(file_path, ''), nullif(storage_path, ''), nullif(path, ''))
where file_path is null or file_path = '';

update public.documents
set status = 'Drafting'
where status is null or status = '';

alter table public.documents
  alter column owner_id set not null,
  alter column title set not null,
  alter column file_path set not null,
  alter column status set not null;

alter table public.documents
  drop constraint if exists documents_status_check;

alter table public.documents
  add constraint documents_status_check
  check (status in ('Drafting', 'Pending', 'Signed', 'Filed'));

create table if not exists public.document_permissions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'signer',
  created_at timestamptz not null default now(),
  constraint document_permissions_role_check check (role in ('owner', 'signer')),
  unique (document_id, user_id)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.documents(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_cases_owner_id on public.cases(owner_id);
create index if not exists idx_documents_case_id on public.documents(case_id);
create index if not exists idx_documents_owner_id on public.documents(owner_id);
create index if not exists idx_documents_status on public.documents(status);
create index if not exists idx_documents_sha256_hash on public.documents(sha256_hash);
create index if not exists idx_documents_file_path on public.documents(file_path);
create index if not exists idx_document_permissions_document on public.document_permissions(document_id);
create index if not exists idx_document_permissions_user on public.document_permissions(user_id);
create index if not exists idx_audit_logs_document_id on public.audit_logs(document_id, created_at desc);

alter table public.cases enable row level security;
alter table public.documents enable row level security;
alter table public.document_permissions enable row level security;
alter table public.audit_logs enable row level security;

-- Cases can be read by owner or by users who can read at least one document in the case.
drop policy if exists cases_select_policy on public.cases;
create policy cases_select_policy
on public.cases
for select
using (
  owner_id = auth.uid()
  or exists (
    select 1
    from public.documents d
    left join public.document_permissions dp on dp.document_id = d.id
    where d.case_id = cases.id
      and (d.owner_id = auth.uid() or dp.user_id = auth.uid())
  )
);

drop policy if exists cases_insert_policy on public.cases;
create policy cases_insert_policy
on public.cases
for insert
with check (owner_id = auth.uid());

drop policy if exists cases_update_policy on public.cases;
create policy cases_update_policy
on public.cases
for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists cases_delete_policy on public.cases;
create policy cases_delete_policy
on public.cases
for delete
using (owner_id = auth.uid());

-- Strict document visibility: owner OR explicitly listed in document_permissions.
drop policy if exists documents_select_policy on public.documents;
create policy documents_select_policy
on public.documents
for select
using (
  owner_id = auth.uid()
  or exists (
    select 1
    from public.document_permissions dp
    where dp.document_id = documents.id
      and dp.user_id = auth.uid()
  )
);

drop policy if exists documents_insert_policy on public.documents;
create policy documents_insert_policy
on public.documents
for insert
with check (owner_id = auth.uid());

drop policy if exists documents_update_policy on public.documents;
create policy documents_update_policy
on public.documents
for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists documents_delete_policy on public.documents;
create policy documents_delete_policy
on public.documents
for delete
using (owner_id = auth.uid());

-- Only document owners can manage permissions.
drop policy if exists document_permissions_select_policy on public.document_permissions;
create policy document_permissions_select_policy
on public.document_permissions
for select
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.documents d
    where d.id = document_permissions.document_id
      and d.owner_id = auth.uid()
  )
);

drop policy if exists document_permissions_insert_policy on public.document_permissions;
create policy document_permissions_insert_policy
on public.document_permissions
for insert
with check (
  exists (
    select 1
    from public.documents d
    where d.id = document_permissions.document_id
      and d.owner_id = auth.uid()
  )
);

drop policy if exists document_permissions_update_policy on public.document_permissions;
create policy document_permissions_update_policy
on public.document_permissions
for update
using (
  exists (
    select 1
    from public.documents d
    where d.id = document_permissions.document_id
      and d.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.documents d
    where d.id = document_permissions.document_id
      and d.owner_id = auth.uid()
  )
);

drop policy if exists document_permissions_delete_policy on public.document_permissions;
create policy document_permissions_delete_policy
on public.document_permissions
for delete
using (
  exists (
    select 1
    from public.documents d
    where d.id = document_permissions.document_id
      and d.owner_id = auth.uid()
  )
);

-- Immutable audit logs: append-only.
drop policy if exists audit_logs_insert_policy on public.audit_logs;
create policy audit_logs_insert_policy
on public.audit_logs
for insert
with check (auth.uid() is not null);

drop policy if exists audit_logs_select_policy on public.audit_logs;
create policy audit_logs_select_policy
on public.audit_logs
for select
using (
  exists (
    select 1
    from public.documents d
    left join public.document_permissions dp on dp.document_id = d.id
    where d.id = audit_logs.document_id
      and (d.owner_id = auth.uid() or dp.user_id = auth.uid())
  )
);

-- Storage bucket + RLS for secure_docs downloads.
insert into storage.buckets (id, name, public)
values ('secure_docs', 'secure_docs', false)
on conflict (id) do nothing;

alter table storage.objects enable row level security;

drop policy if exists secure_docs_read_authorized on storage.objects;
create policy secure_docs_read_authorized
on storage.objects
for select
using (
  bucket_id = 'secure_docs'
  and exists (
    select 1
    from public.documents d
    left join public.document_permissions dp on dp.document_id = d.id
    where d.file_path = storage.objects.name
      and (d.owner_id = auth.uid() or dp.user_id = auth.uid())
  )
);

drop policy if exists secure_docs_upload_authenticated on storage.objects;
create policy secure_docs_upload_authenticated
on storage.objects
for insert
with check (
  bucket_id = 'secure_docs'
  and auth.uid() is not null
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists secure_docs_delete_owner on storage.objects;
create policy secure_docs_delete_owner
on storage.objects
for delete
using (
  bucket_id = 'secure_docs'
  and exists (
    select 1
    from public.documents d
    where d.file_path = storage.objects.name
      and d.owner_id = auth.uid()
  )
);
