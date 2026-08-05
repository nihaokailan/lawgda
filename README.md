# Lawgda

A starter Next.js + Supabase MVP scaffold for legal evidence tracking.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a `.env.local` file with your Supabase keys:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
   ```
3. Run the app:
   ```bash
   npm run dev
   ```

## Supabase setup

- Create a Supabase project
- Create a storage bucket named `evidence`
- Create a table named `cases` with columns:
  - `id` (uuid or text primary key)
  - `title` (text)
  - `status` (text)
  - `description` (text, optional)

## Pages

- `/` - Home
- `/signin` - Sign in page
- `/signup` - Create account
- `/dashboard` - Dashboard with sign out
- `/cases` - Case list from Supabase or fallback sample data
- `/upload` - Document upload to Supabase storage

## Notes

- Authentication uses Supabase Auth helper client
- Upload page writes to `evidence` storage bucket
- Case list loads from `cases` table if available
- Update the app and Supabase schema for audit trails, RBAC, and document metadata

## Overall Product Vision

See the product vision document for the final scope and capabilities: [PRODUCT_VISION.md](PRODUCT_VISION.md)
