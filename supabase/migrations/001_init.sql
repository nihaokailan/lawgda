-- Enable pgcrypto for gen_random_uuid()
create extension if not exists "pgcrypto";

-- cases table
create table if not exists cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  title text not null,
  status text default 'Draft',
  description text,
  created_at timestamptz default now()
);

alter table cases enable row level security;

create policy "cases_insert_authenticated" on cases
  for insert with check (auth.role() = 'authenticated' and (user_id = auth.uid()));

create policy "cases_select_owner" on cases
  for select using (auth.role() = 'authenticated' and user_id = auth.uid());

create policy "cases_update_owner" on cases
  for update using (auth.role() = 'authenticated' and user_id = auth.uid())
  with check (auth.role() = 'authenticated' and user_id = auth.uid());

create policy "cases_delete_owner" on cases
  for delete using (auth.role() = 'authenticated' and user_id = auth.uid());

-- documents table (links storage objects to users/cases)
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  case_id uuid references cases(id),
  bucket text not null default 'evidence',
  path text not null,
  filename text,
  metadata jsonb,
  created_at timestamptz default now()
);

alter table documents enable row level security;

create policy "documents_insert_authenticated" on documents
  for insert with check (auth.role() = 'authenticated' and (user_id = auth.uid()));

create policy "documents_select_owner" on documents
  for select using (auth.role() = 'authenticated' and user_id = auth.uid());

create policy "documents_update_owner" on documents
  for update using (auth.role() = 'authenticated' and user_id = auth.uid())
  with check (auth.role() = 'authenticated' and user_id = auth.uid());

create policy "documents_delete_owner" on documents
  for delete using (auth.role() = 'authenticated' and user_id = auth.uid());
