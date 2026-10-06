import { createSupabaseServerClient } from './supabase/server';
import { getSupabaseAdmin } from './supabaseAdmin';
import { ROLES } from './roles';
import { redirect } from 'next/navigation';

function normalizeProfile(profile, user) {
  if (!profile) {
    return null;
  }

  return {
    user_id: profile.user_id ?? user.id,
    email: profile.email ?? user.email ?? null,
    full_name: profile.full_name ?? user.user_metadata?.full_name ?? null,
    role: profile.role ?? ROLES.NORMAL,
    org_id: profile.org_id ?? null,
    admin_request_status: profile.admin_request_status ?? 'none',
    is_active: profile.is_active ?? true,
  };
}

async function fetchProfile(supabase, userId) {
  const profilesResult = await supabase
    .from('profiles')
    .select('user_id,email,full_name,role,org_id,admin_request_status,is_active')
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

async function assertAccountUsable(profile) {
  if (profile.is_active === false) {
    redirect('/account-disabled');
  }

  if (profile.org_id && profile.role !== ROLES.DEFAULT_ADMIN) {
    const { data: org } = await getSupabaseAdmin()
      .from('organizations')
      .select('status')
      .eq('id', profile.org_id)
      .maybeSingle();
    if (!org || org.status !== 'active') {
      redirect('/account-disabled');
    }
  }
}

export async function requireAuthProfile(redirectTo = '/signin') {
  const user = await requireAuth(redirectTo);
  const supabase = createSupabaseServerClient();
  const fetched = await fetchProfile(supabase, user.id);
  const normalized = normalizeProfile(fetched.profile, user);

  if (!normalized) {
    // The signup trigger always creates a profile; never mint one here with
    // elevated or org-scoped privileges.
    redirect('/account-disabled');
  }

  await assertAccountUsable(normalized);
  return { user, profile: normalized };
}

export async function requireRole(roles, redirectTo = '/dashboard') {
  const { user, profile } = await requireAuthProfile();
  if (!roles.includes(profile.role)) {
    redirect(redirectTo);
  }

  return { user, profile };
}

/**
 * Guard for firm-level pages (documents, cases, uploads, dashboards). The
 * platform-level Default Admin is never a firm member and is sent to its own
 * console; every other role needs an organization assignment.
 */
export async function requireWorkspaceAccess() {
  const { user, profile } = await requireAuthProfile();

  if (profile.role === ROLES.DEFAULT_ADMIN) {
    redirect('/platform');
  }

  // ADMIN/LAWYER/STAFF without an organization is an invalid state.
  if (!profile.org_id && profile.role !== ROLES.NORMAL) {
    redirect('/account-disabled');
  }

  return { user, profile };
}

/**
 * Guard for pages that render document data. The Organization Admin is also
 * kept out: Admins see repository metadata (/admin/repository) but are blind
 * to document content, so they are redirected to their own console.
 */
export async function requireDocumentAccess(adminRedirect = '/admin') {
  const context = await requireWorkspaceAccess();

  if (context.profile.role === ROLES.ADMIN) {
    redirect(adminRedirect);
  }

  return context;
}
