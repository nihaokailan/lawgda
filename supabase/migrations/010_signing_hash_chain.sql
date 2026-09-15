-- Per-signer hash fields make the PDF chain queryable without parsing audit JSON.
alter table public.signing_requests
  add column if not exists pre_sign_hash text,
  add column if not exists post_sign_hash text,
  add column if not exists signed_file_path text;

create index if not exists signing_requests_post_sign_hash_idx
  on public.signing_requests(post_sign_hash)
  where post_sign_hash is not null;