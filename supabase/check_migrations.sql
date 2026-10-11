-- Read-only: reports which migrations in supabase/migrations/ are applied.
-- Paste into Supabase → SQL Editor → Run. It changes nothing.
-- Each row checks one object that only exists once that migration has run.

select migration, applied
from (values
  ('007_signing_requests', to_regclass('public.signing_requests') is not null),
  ('008_documents_org_scope', exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'documents' and column_name = 'org_id')),
  ('010_signing_hash_chain', exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'signing_requests' and column_name = 'pre_sign_hash')),
  ('011_audit_chain_immutability', exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'audit_logs' and column_name = 'record_hash')),
  ('012_document_status_lifecycle', exists (
    select 1 from pg_trigger where tgname = 'trigger_enforce_document_status_transition')),
  ('013_user_signing_keys', to_regclass('public.user_signing_keys') is not null),
  ('014_signer_certificate_keys', to_regclass('public.external_signer_keys') is not null),
  ('015_file_completed_documents', exists (
    select 1 from pg_proc
    where proname = 'enforce_document_status_transition' and prosrc like '%Filed%')),
  ('015a_rbac_enum_values', exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'app_role' and e.enumlabel = 'default_admin')),
  ('016_strict_rbac', to_regclass('public.granular_audit_log') is not null),
  ('017_two_tier_admin_rbac', exists (select 1 from pg_proc where proname = 'is_default_admin')),
  ('018_rbac_hardening', exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'documents' and policyname = 'documents_org_isolation')),
  ('020_realtime_documents', exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'documents')),
  ('021_audit_integrity', exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'audit_logs' and policyname = 'audit_logs_no_client_insert')),
  ('022_document_metadata_editing', exists (select 1 from pg_proc where proname = 'update_document_metadata')),
  ('023_fix_metadata_search_path', exists (
    select 1 from pg_proc
    where proname = 'update_document_metadata' and array_to_string(proconfig, ',') like '%search_path%'))
) as checks(migration, applied)
order by migration;

-- 009 and 019 only back-fill data and are safe to re-run, so they are not listed.
