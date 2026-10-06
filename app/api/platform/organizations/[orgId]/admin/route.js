import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../../../lib/supabaseAdmin';
import { PERMISSIONS, ROLES } from '../../../../../../lib/rbac';
import { requirePermission, rbacErrorResponse } from '../../../../../../lib/rbacMiddleware';
import { logGranularAudit } from '../../../../../../lib/granularAudit';
import { setAuthAccountActive } from '../../../../../../lib/accountStatus';

/**
 * Activates or deactivates an organization's Admin account. Scoped so it can
 * only ever touch a profile with role=admin inside the given org — never a
 * Lawyer, Staff, or another organization's admin.
 */
export async function PATCH(request, { params }) {
  let user;
  let profile;
  try {
    ({ user, profile } = await requirePermission(PERMISSIONS.MANAGE_ORG_ADMINS));
  } catch (error) {
    return rbacErrorResponse(error);
  }

  const orgId = String(params?.orgId || '').trim();
  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || '').trim();

  if (!orgId || !['activate', 'deactivate'].includes(action)) {
    return NextResponse.json({ error: 'An organization and action ("activate" or "deactivate") are required.' }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: admin, error: fetchError } = await supabaseAdmin
    .from('profiles')
    .select('user_id,is_active')
    .eq('org_id', orgId)
    .eq('role', ROLES.ADMIN)
    .limit(1)
    .maybeSingle();

  if (fetchError || !admin) {
    return NextResponse.json({ error: "This organization's admin account was not found." }, { status: 404 });
  }

  const nextIsActive = action === 'activate';
  const { error: updateError } = await supabaseAdmin
    .from('profiles')
    .update({ is_active: nextIsActive })
    .eq('user_id', admin.user_id)
    .eq('org_id', orgId)
    .eq('role', ROLES.ADMIN);

  if (updateError) {
    return NextResponse.json({ error: 'Unable to update the admin account.' }, { status: 500 });
  }

  try {
    await setAuthAccountActive(supabaseAdmin, admin.user_id, nextIsActive);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logGranularAudit({
    actorUserId: user.id,
    actorRole: profile.role,
    action: 'update',
    resourceTable: 'profiles',
    resourceId: admin.user_id,
    fieldName: 'is_active',
    oldValue: admin.is_active,
    newValue: nextIsActive,
    orgId,
    metadata: { reason: `org_admin_${action}` },
  });

  return NextResponse.json({ success: true, isActive: nextIsActive });
}
