-- One-off backfill: signing requests created before Lawyers were auto-granted
-- access. Gives every active Lawyer who is a signer on a same-firm document a
-- 'signer' permission so the document appears in their Documents list and
-- dashboard. Idempotent; new requests are handled by the app itself.

insert into public.document_permissions (document_id, user_id, role)
select distinct sr.document_id, p.user_id, 'signer'
from public.signing_requests sr
join public.documents d on d.id = sr.document_id
join public.profiles p
  on lower(p.email) = lower(sr.signer_email)
 and p.role = 'lawyer'::app_role
 and p.is_active = true
 and p.org_id is not distinct from d.org_id
where sr.status <> 'revoked'
on conflict (document_id, user_id) do nothing;
