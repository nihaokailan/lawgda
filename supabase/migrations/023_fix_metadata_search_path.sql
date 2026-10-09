-- Fix for 022: update_document_metadata() pinned search_path to `public`, but
-- Supabase installs pgcrypto in the `extensions` schema. When the function
-- inserted its audit_logs row, the hash-chain trigger ran with that same
-- search_path and could not resolve digest(), so every real edit rolled back
-- ("Unable to save the changes"). The chain triggers now pin a search_path
-- that includes `extensions`, so they work no matter who invokes them.

alter function public.update_document_metadata(uuid, uuid, app_role, text, text, text[], text)
  set search_path = public, extensions;

alter function public.compute_audit_logs_chain_hash()
  set search_path = public, extensions;

alter function public.compute_signing_audit_chain_hash()
  set search_path = public, extensions;
