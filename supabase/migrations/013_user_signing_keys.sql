-- Stores per-user signing key pairs. The private key is never stored in
-- plaintext: it is generated server-side and immediately wrapped with
-- AES-256-GCM under a master Key Encryption Key held only in the server
-- environment (KEY_WRAPPING_MASTER_KEY), then stored as opaque ciphertext.
-- Only the service role (which bypasses RLS) ever writes or unwraps it.

create table if not exists public.user_signing_keys (
  user_id uuid primary key references auth.users(id) on delete cascade,
  public_key text not null,
  wrapped_private_key text not null,
  key_version integer not null default 1,
  created_at timestamptz not null default now()
);

alter table public.user_signing_keys enable row level security;

drop policy if exists user_signing_keys_select_policy on public.user_signing_keys;
create policy user_signing_keys_select_policy on public.user_signing_keys
for select
using (user_id = auth.uid() or is_administrator(auth.uid()));

-- Intentionally no insert/update/delete policies: with RLS enabled and no
-- matching policy, ordinary authenticated users are denied by default.
-- Only the service-role key (used server-side via getSupabaseAdmin()) can
-- write wrapped key material.
