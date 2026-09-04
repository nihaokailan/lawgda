-- Backfill public.documents rows for files already stored in Supabase Storage.
-- This keeps legacy storage records visible to the app even when the file was uploaded
-- before the canonical document schema was fully populated.

with storage_candidates as (
  select
    o.bucket_id as bucket,
    o.name as path,
    split_part(o.name, '/', array_length(string_to_array(o.name, '/'), 1)) as title,
    case
      when split_part(o.name, '/', 1) ~ '^[0-9a-fA-F-]{36}$' then split_part(o.name, '/', 1)::uuid
      else null
    end as owner_hint,
    (
      select p.user_id
      from public.profiles p
      where p.user_id = (
        case
          when split_part(o.name, '/', 1) ~ '^[0-9a-fA-F-]{36}$' then split_part(o.name, '/', 1)::uuid
          else null
        end
      )
      order by p.created_at asc
      limit 1
    ) as matched_user_id,
    (
      select p.org_id
      from public.profiles p
      where p.user_id = (
        case
          when split_part(o.name, '/', 1) ~ '^[0-9a-fA-F-]{36}$' then split_part(o.name, '/', 1)::uuid
          else null
        end
      )
      order by p.created_at asc
      limit 1
    ) as matched_org_id,
    coalesce(o.created_at, now()) as created_at
  from storage.objects o
  where o.bucket_id in ('secure_docs', 'evidence', 'org-documents')
    and o.name is not null
),
new_rows as (
  select
    gen_random_uuid() as id,
    coalesce(sc.owner_hint, sc.matched_user_id) as owner_id,
    coalesce(sc.owner_hint, sc.matched_user_id) as user_id,
    coalesce(sc.owner_hint, sc.matched_user_id) as uploaded_by,
    sc.matched_org_id as org_id,
    sc.title,
    sc.path,
    sc.path as file_path,
    sc.bucket,
    'Drafting' as status,
    sc.created_at
  from storage_candidates sc
  where coalesce(sc.owner_hint, sc.matched_user_id) is not null
    and not exists (
    select 1
    from public.documents d
    where d.path = sc.path
      and d.bucket = sc.bucket
  )
)
insert into public.documents (
  id,
  owner_id,
  user_id,
  uploaded_by,
  org_id,
  title,
  path,
  file_path,
  bucket,
  status,
  created_at
)
select
  id,
  owner_id,
  user_id,
  uploaded_by,
  org_id,
  title,
  path,
  file_path,
  bucket,
  status,
  created_at
from new_rows;
