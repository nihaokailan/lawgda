import { createSupabaseServerClient } from './supabase/server';
import { ROLES } from './roles';
import { redirect } from 'next/navigation';

function isSuperAdminEmail(email) {
  const raw = process.env.SUPERADMIN_EMAILS || process.env.SUPERADMIN_EMAIL || '';
  const configured = raw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return Boolean(email && configured.includes(String(email).toLowerCase()));
}

function normalizeProfile(profile, user) {
  if (!profile) {
    return null;
  }

  return {
    user_id: profile.user_id ?? user.id,
    email: profile.email ?? user.email ?? null,
    full_name: profile.full_name ?? user.user_metadata?.full_name ?? null,
    role: profile.role ?? ROLES.STAFF,
    org_id: profile.org_id ?? null,
    admin_request_status: profile.admin_request_status ?? 'none',
  };
}

async function fetchProfile(supabase, userId) {
  const profilesResult = await supabase
    .from('profiles')
    .select('user_id,email,full_name,role,org_id,admin_request_status')
    .eq('user_id', userId)
    .single();

  if (!profilesResult.error && profilesResult.data) {
    return { source: 'profiles', profile: profilesResult.data };
  }

  return { source: 'profiles', profile: null };
}

export async function requireAuth(redirectTo = '/signin') {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect(redirectTo);
  }

  return user;
}

export async function requireAuthProfile(redirectTo = '/signin') {
  const user = await requireAuth(redirectTo);
  const supabase = createSupabaseServerClient();
  const fetched = await fetchProfile(supabase, user.id);
  const normalized = normalizeProfile(fetched.profile, user);

  if (normalized) {
    if (isSuperAdminEmail(user.email)) {
      return {
        user,
        profile: {
          ...normalized,
          role: ROLES.ADMIN,
        },
      };
    }
    return { user, profile: normalized };
  }

  const fallbackProfile = {
    user_id: user.id,
    email: user.email ?? null,
    full_name: user.user_metadata?.full_name ?? null,
    role: ROLES.STAFF,
  };

  const { error: upsertError } = await supabase
    .from('profiles')
    .upsert(fallbackProfile, { onConflict: 'user_id' });

  if (upsertError) {
    return {
      user,
      profile: {
        ...fallbackProfile,
        org_id: null,
        admin_request_status: 'none',
      },
    };
  }

  const ensured = await fetchProfile(supabase, user.id);
  const ensuredNormalized = normalizeProfile(ensured.profile, user);

  if (!ensuredNormalized) {
    return {
      user,
      profile: {
        ...fallbackProfile,
        org_id: null,
        admin_request_status: 'none',
      },
    };
  }

  if (isSuperAdminEmail(user.email)) {
    return {
      user,
      profile: {
        ...ensuredNormalized,
        role: ROLES.ADMIN,
      },
    };
  }

  return { user, profile: ensuredNormalized };
}

export async function requireRole(roles, redirectTo = '/dashboard') {
  const { user, profile } = await requireAuthProfile();
  if (!roles.includes(profile.role)) {
    redirect(redirectTo);
  }

  return { user, profile };
}

export async function requireWorkspaceAccess(redirectTo = '/dashboard') {
  const { user, profile } = await requireAuthProfile();

  if (profile.role !== ROLES.ADMIN && !profile.org_id) {
    redirect(redirectTo);
  }

  return { user, profile };
}
