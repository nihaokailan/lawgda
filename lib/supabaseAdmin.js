import { createClient } from '@supabase/supabase-js';

let cachedAdmin = null;

export function getSupabaseAdmin() {
  if (cachedAdmin) {
    return cachedAdmin;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }

  cachedAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    // Next.js 14 caches server fetch() responses by default. A cached
    // documents row once served a later signer the pre-signature file, so
    // every admin read must hit the database.
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    },
  });

  return cachedAdmin;
}
