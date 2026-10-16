-- Indexes for the document lookups the dashboard and Documents page run on
-- every load: "my documents" matches owner_id OR uploaded_by OR user_id, and
-- the storage backfill matches stored files by path. owner_id and file_path
-- are already indexed (005_case_document_permissions_rls.sql).

create index if not exists idx_documents_uploaded_by on public.documents(uploaded_by);
create index if not exists idx_documents_user_id on public.documents(user_id);
-- Not "idx_documents_path": schema.sql already uses that name for (bucket, storage_path).
create index if not exists idx_documents_path_lookup on public.documents(path);
create index if not exists idx_documents_created_at on public.documents(created_at desc);
