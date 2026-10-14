-- Email one-time codes for signers. Before a signer can view or sign, Lawgda
-- emails a 6-digit code to the signer's assigned address; entering it proves
-- they control that inbox. Only hashes are stored, never the code or the
-- session token. One row per signing request, replaced on each new code.

create table if not exists public.signer_email_verifications (
  signing_request_id uuid primary key references public.signing_requests(id) on delete cascade,
  code_hash text,
  code_expires_at timestamptz,
  attempts integer not null default 0,
  last_sent_at timestamptz,
  verified_at timestamptz,
  session_hash text,
  session_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.signer_email_verifications enable row level security;
-- No policies: only the server (service role, which bypasses RLS) may read or
-- write verification state. Browser sessions cannot see codes or sessions.
