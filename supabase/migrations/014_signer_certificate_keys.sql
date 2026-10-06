-- Supports two signer verification paths:
-- (A) DICT-issued .p12 certificate: the extracted RSA private key is wrapped
--     with AES-256 (see lib/keyWrapping.js) and stored per signing request.
-- (B) Standard signature (drawn or uploaded image): every signer — internal
--     or external — gets a persistent AES-wrapped Ed25519 "system" key,
--     keyed by email for external signers since they have no auth.users row.

create table if not exists public.signing_request_certificates (
  signing_request_id uuid primary key references public.signing_requests(id) on delete cascade,
  wrapped_private_key text not null,
  certificate_pem text not null,
  subject_cn text,
  created_at timestamptz not null default now()
);

alter table public.signing_request_certificates enable row level security;
-- No select/insert/update/delete policies: only the service role (server-side,
-- bypasses RLS) may ever read or write this table.

create table if not exists public.external_signer_keys (
  signer_email text primary key,
  public_key text not null,
  wrapped_private_key text not null,
  created_at timestamptz not null default now()
);

alter table public.external_signer_keys enable row level security;
-- No select/insert/update/delete policies: service role only.

alter table public.signing_requests
  add column if not exists signing_method text;
