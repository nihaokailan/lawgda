#!/usr/bin/env node
// Seeds the single platform-level DEFAULT_ADMIN account on first setup.
// There is no public registration path for this role — this script is the
// only way to provision it. Idempotent: safe to re-run — it will not create
// a duplicate auth user or change the role of an account that already has one.
//
// Usage: SEED_ADMIN_EMAIL=you@example.com npm run seed:admin
//   (loads .env.local via --env-file). SEED_ADMIN_PASSWORD is optional (min 12
//   characters); when omitted a random password is generated and printed once.
// No credentials live in the repository.
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const ADMIN_EMAIL = String(process.env.SEED_ADMIN_EMAIL || '').trim().toLowerCase();
const providedPassword = process.env.SEED_ADMIN_PASSWORD || '';
const ADMIN_PASSWORD = providedPassword || `Lw!${randomBytes(18).toString('base64url')}`;

if (!ADMIN_EMAIL) {
  console.error('SEED_ADMIN_EMAIL must be set to the Default Admin email address.');
  process.exit(1);
}
if (providedPassword && providedPassword.length < 12) {
  console.error('SEED_ADMIN_PASSWORD must be at least 12 characters.');
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.local).');
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  // This script never opens a realtime channel, but supabase-js always
  // constructs a RealtimeClient, which throws on Node < 22 (no global
  // WebSocket) unless a transport is supplied. A never-invoked stub avoids
  // adding a `ws` dependency just for this one-off script.
  realtime: { transport: function NoopWebSocketTransport() {} },
});

async function findExistingUserByEmail(email) {
  const perPage = 200;
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`listUsers failed: ${error.message}`);
    }
    const match = data.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());
    if (match) {
      return match;
    }
    if (data.users.length < perPage) {
      return null;
    }
  }
}

async function main() {
  // The platform has exactly one DEFAULT_ADMIN; never create a second one.
  const { data: existingAdmins, error: existingError } = await supabaseAdmin
    .from('profiles')
    .select('user_id,email')
    .eq('role', 'default_admin');
  if (existingError) {
    throw new Error(`Unable to check for an existing Default Admin: ${existingError.message}`);
  }
  const conflicting = (existingAdmins || []).find((row) => String(row.email || '').toLowerCase() !== ADMIN_EMAIL);
  if (conflicting) {
    throw new Error(`A Default Admin already exists (${conflicting.email}). Refusing to create another.`);
  }

  let authUser = await findExistingUserByEmail(ADMIN_EMAIL);

  if (!authUser) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: 'Lawgda Default Admin' },
    });
    if (error) {
      throw new Error(`createUser failed: ${error.message}`);
    }
    authUser = data.user;
    console.log(`Created auth user ${authUser.id} for ${ADMIN_EMAIL}.`);
    if (!providedPassword) {
      console.log(`Generated password (shown once, store it securely): ${ADMIN_PASSWORD}`);
    }
  } else {
    // Never repurpose a firm member's account as the platform admin.
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('role,org_id')
      .eq('user_id', authUser.id)
      .maybeSingle();
    if (existingProfile?.org_id || ['lawyer', 'staff'].includes(existingProfile?.role)) {
      throw new Error(`${ADMIN_EMAIL} already belongs to an organization and cannot become the Default Admin.`);
    }
    console.log(`Default Admin auth user already exists (${authUser.id}); leaving credentials untouched.`);
  }

  const { error: profileError } = await supabaseAdmin.from('profiles').upsert(
    {
      user_id: authUser.id,
      email: ADMIN_EMAIL,
      full_name: 'Lawgda Default Admin',
      role: 'default_admin',
      org_id: null,
      is_active: true,
      admin_request_status: 'approved',
    },
    { onConflict: 'user_id' }
  );

  if (profileError) {
    throw new Error(`Profile upsert failed: ${profileError.message}`);
  }

  console.log('Default Admin profile is provisioned with role=default_admin (org_id null).');
  console.log('IMPORTANT: rotate the password after first login and enable MFA on this account.');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
