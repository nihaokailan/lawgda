import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { PERMISSIONS, ADMIN_CREATABLE_ROLES } from '../../../../../lib/rbac';
import { requirePermission, rbacErrorResponse } from '../../../../../lib/rbacMiddleware';
import { logGranularAudit } from '../../../../../lib/granularAudit';
import { setAuthAccountActive } from '../../../../../lib/accountStatus';

/**
 * Organization Admin edits a Lawyer/Staff account of their own firm: name,
 * role (lawyer <-> staff only) and active status. Admin accounts (including
 * the caller's own) and accounts of other organizations are untouchable.
 */
export async function PATCH(request, { params }) {
  let user;
  let profile;
  try {
    ({ user, profile } = await requirePermission(PERMISSIONS.MANAGE_USERS));
  } catch (error) {
    return rbacErrorResponse(error);
  }

  const targetUserId = String(params?.userId || '').trim();
  const body = await request.json().catch(() => ({}));
  const updates = {};

  if (body?.role !== undefined) {
    if (!ADMIN_CREATABLE_ROLES.includes(body.role)) {
      return NextResponse.json({ error: 'Role must be lawyer or staff.' }, { status: 400 });
    }
    updates.role = body.role;
  }
  if (body?.isActive !== undefined) {
    updates.is_active = Boolean(body.isActive);
  }
  if (body?.fullName !== undefined) {
    updates.full_name = String(body.fullName).trim() || null;
  }

  if ((updates.role !== undefined || updates.is_active !== undefined) && body?.confirmed !== true) {
    return NextResponse.json({ error: 'Role and status changes must be confirmed.' }, { status: 400 });
  }

  if (!targetUserId || Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Provide at least one of: role, isActive, fullName.' }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: target } = await supabaseAdmin
    .from('profiles')
    .select('user_id,role,is_active,full_name')
    .eq('user_id', targetUserId)
    .eq('org_id', profile.org_id)
    .in('role', ADMIN_CREATABLE_ROLES)
    .maybeSingle();

  if (!target || target.user_id === user.id) {
    return NextResponse.json({ error: 'User not found in your organization.' }, { status: 404 });
  }

  const { error: updateError } = await supabaseAdmin
    .from('profiles')
    .update(updates)
    .eq('user_id', targetUserId)
    .eq('org_id', profile.org_id);

  if (updateError) {
    return NextResponse.json({ error: 'Unable to update the user.' }, { status: 500 });
  }

  if (updates.is_active !== undefined && updates.is_active !== target.is_active) {
    try {
      await setAuthAccountActive(supabaseAdmin, targetUserId, updates.is_active);
    } catch (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  for (const [field, newValue] of Object.entries(updates)) {
    if (target[field] === newValue) continue;
    await logGranularAudit({
      actorUserId: user.id,
      actorRole: profile.role,
      action: 'update',
      resourceTable: 'profiles',
      resourceId: targetUserId,
      fieldName: field,
      oldValue: target[field],
      newValue,
      orgId: profile.org_id,
      metadata: { source: 'org_admin_user_management' },
    });
  }

  return NextResponse.json({ success: true });
}
