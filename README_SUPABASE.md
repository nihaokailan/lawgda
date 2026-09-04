Supabase setup and migration guide for this project

1) Environment
- Copy `.env.local.example` to `.env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Restart the Next.js dev server after editing env vars.

2) Run SQL migration
- Open your Supabase project → SQL editor.
- Open and run these files in order:
  - `supabase/migrations/001_init.sql`
  - `supabase/migrations/002_roles_profiles.sql`
  - `supabase/migrations/003_external_signers_and_audit.sql`
  - `supabase/migrations/004_public_signup_user_and_admin_safety.sql`
  - `supabase/migrations/005_case_document_permissions_rls.sql`
  - `supabase/migrations/006_canonical_profiles_and_documents.sql`
  - `supabase/migrations/007_signing_requests.sql`
  - `supabase/migrations/008_documents_org_scope.sql`
  - `supabase/migrations/009_backfill_storage_documents.sql`
- This creates the `cases`, `documents`, `user_profiles`, `internal_user_invitations`, `signing_requests`, and `signing_audit_events` tables, including Row Level Security (RLS), role-aware policies, and external-signer token workflow support.

3) Create storage bucket
- In Supabase UI → Storage → Create bucket:
  - Name: `evidence`
  - Privacy: Private (recommended)

4) Storage policy (allow authenticated upload)
- In Storage → Policies, create a policy to allow uploads for authenticated users. Example condition:
  - `auth.role() = 'authenticated'`
- If you prefer SQL-like policy, configure it in the Storage UI or via the Supabase CLI.

5) Test the flow locally
- Start the app:
```
npm run dev
```
- In the running app:
  - Sign up at `/signup`
  - Sign in at `/signin`
  - Visit `/profile` to validate profile creation and role assignment
  - (Optional) set one user to `administrator` directly in Supabase SQL editor:
    ```sql
    update user_profiles
    set role = 'administrator'
    where email = 'admin@example.com';
    ```
  - Visit `/upload` and upload a PDF or DOCX

6) Optional: link storage objects to `documents` table
- After uploading to the `evidence` bucket (client-side), write a row into `documents` with the path returned by Supabase storage and the current user's id. Example insert via server API:

```sql
insert into documents (user_id, bucket, path, filename) values ('<user-id>', 'evidence', 'documents/1600000000-file.pdf', 'file.pdf');
```

7) Deploy
- Add the same env vars to your hosting provider (Vercel, Netlify, etc):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `NEXT_PUBLIC_SITE_URL` (used for invitation and external signer links)
  - `SUPABASE_SERVICE_ROLE_KEY` (only if needed server-side)

8) Send signing invitation emails
- Create a Resend account and verify the sender domain or email address.
- Add these server-only values to `.env.local`:
```
RESEND_API_KEY=re_your_api_key
RESEND_FROM_EMAIL=Lawgda <signing@your-verified-domain.com>
```
- Restart `npm run dev` after changing `.env.local`.
- Without these values, signing requests are saved but no email is sent; the server logs a temporary signing link instead.

If you want, I can:
- Create a small server API route to write `documents` rows after successful uploads.
- Add a migration runner script (using `supabase` CLI) and a `supabase/config` folder.
