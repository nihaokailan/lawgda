import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from './supabase/server';
import { getSupabaseAdmin } from './supabaseAdmin';
import { hasPermission, RbacError, ROLES, ORG_SCOPED_ROLES } from './rbac';

/**
 * Loads the authenticated user and their profile/role. Throws RbacError(401)
 * if there is no session, RbacError(403) if the profile is missing or
 * deactivated. Use this (or requirePermission/requireRole) instead of
 * querying `profiles` directly in route handlers, so every controller gets
 * the same auth checks.
 */
export async function getAuthContext() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new RbacError('Not authenticated.', 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('user_id,email,full_name,role,org_id,is_active')
    .eq('user_id', user.id)
    .single();

  if (profileError || !profile) {
    throw new RbacError('No profile found for the authenticated user.', 403);
  }

  if (profile.is_active === false) {
    throw new RbacError('This account has been deactivated.', 403);
  }

  if (profile.role === ROLES.DEFAULT_ADMIN) {
    if (profile.org_id) {
      throw new RbacError('Default Admin must not belong to an organization.', 403);
    }
  } else if (ORG_SCOPED_ROLES.includes(profile.role)) {
    if (!profile.org_id) {
      throw new RbacError('This account is not assigned to an organization.', 403);
    }
    // Deactivating a firm locks out all of its members, not only its Admin.
    const { data: org } = await getSupabaseAdmin()
      .from('organizations')
      .select('status')
      .eq('id', profile.org_id)
      .maybeSingle();
    if (!org || org.status !== 'active') {
      throw new RbacError('This organization is deactivated.', 403);
    }
  }

  return { user, profile };
}

/**
 * Gate for every firm-level route (documents, folders, signing, uploads).
 * The platform-level Default Admin is never a member of a law firm, so it is
 * rejected here regardless of any other check the route performs.
 */
export async function requireWorkspaceMember(allowedRoles = null) {
  const context = await getAuthContext();
  if (context.profile.role === ROLES.DEFAULT_ADMIN) {
    throw new RbacError('Default Admin cannot access organization workspaces.', 403);
  }
  if (allowedRoles && !allowedRoles.includes(context.profile.role)) {
    throw new RbacError(`This action requires one of the following roles: ${allowedRoles.join(', ')}.`, 403);
  }
  return context;
}

export async function requirePermission(permission) {
  const context = await getAuthContext();
  if (!hasPermission(context.profile.role, permission)) {
    throw new RbacError(`Your role ("${context.profile.role}") does not have the "${permission}" permission.`, 403);
  }
  return context;
}

export async function requireRole(allowedRoles) {
  const context = await getAuthContext();
  if (!allowedRoles.includes(context.profile.role)) {
    throw new RbacError(`This action requires one of the following roles: ${allowedRoles.join(', ')}.`, 403);
  }
  return context;
}

/**
 * Enforces "neither admin tier is ever given document payload": call this at
 * the very top of any route that would return raw document bytes, a signed
 * storage URL, or file content — never rely on hasPermission() alone for
 * this, since it must hold even if ROLE_PERMISSIONS is edited later.
 */
export function assertCanViewDocumentContent(role) {
  if (role === ROLES.ADMIN || role === ROLES.DEFAULT_ADMIN) {
    throw new RbacError('Admins cannot access document content. This restriction is by design.', 403);
  }
}

/**
 * Enforces organization data isolation for routes that use the service-role
 * client (which bypasses RLS). Default Admin has no organization and may
 * never reach an org-scoped resource; an Organization Admin/Lawyer/Staff may
 * only reach resources belonging to their own org_id.
 */
export function assertOwnOrganization(profile, resourceOrgId) {
  if (profile.role === ROLES.DEFAULT_ADMIN) {
    throw new RbacError('Default Admin cannot access organization-scoped resources.', 403);
  }
  if (!resourceOrgId || profile.org_id !== resourceOrgId) {
    throw new RbacError('This resource belongs to a different organization.', 403);
  }
}

/** Converts an RbacError (or unknown error) into a JSON route response. */
export function rbacErrorResponse(error) {
  if (error instanceof RbacError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 });
}
