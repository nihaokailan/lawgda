import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { PERMISSIONS, ROLES } from '../../../../../lib/rbac';
import { requirePermission, rbacErrorResponse } from '../../../../../lib/rbacMiddleware';
import { logGranularAudit } from '../../../../../lib/granularAudit';

/**
 * Approves or rejects a pending request_admin_role submission. This is a
 * Default Admin action, not an Organization Admin one: approving creates the
 * requester's law firm (organizations row) and promotes them to that firm's
 * Organization Admin in a single update, so a profile is never left with
 * role=admin and org_id=null (or vice versa).
 */
export async function PATCH(request, { params }) {
  let user;
  let profile;
  try {
    ({ user, profile } = await requirePermission(PERMISSIONS.MANAGE_ORG_ADMINS));
  } catch (error) {
    return rbacErrorResponse(error);
  }

  const targetUserId = String(params?.userId || '').trim();
  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || '').trim();

  if (!targetUserId || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'A target user and action ("approve" or "reject") are required.' }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: target, error: fetchError } = await supabaseAdmin
    .from('profiles')
    .select('user_id,role,org_id,admin_request_status,requested_org_name')
    .eq('user_id', targetUserId)
    .single();

  if (fetchError || !target) {
    return NextResponse.json({ error: 'Requesting user not found.' }, { status: 404 });
  }

  // Only a firm-less Normal account can be promoted into a new firm's Admin.
  if (target.role !== ROLES.NORMAL || target.org_id) {
    return NextResponse.json({ error: 'This account is not eligible for an organization admin request.' }, { status: 409 });
  }

  if (target.admin_request_status !== 'pending') {
    return NextResponse.json({ error: 'This request is no longer pending.' }, { status: 409 });
  }

  let newOrgId = null;

  if (action === 'approve') {
    const organizationName = String(target.requested_org_name || '').trim();
    if (!organizationName) {
      return NextResponse.json({ error: 'This request has no organization name on file.' }, { status: 400 });
    }

    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .insert({ name: organizationName, created_by: user.id })
      .select('id')
      .single();

    if (orgError || !org) {
      return NextResponse.json({ error: orgError?.message || 'Unable to create the organization.' }, { status: 400 });
    }
    newOrgId = org.id;
  }

  const updates = action === 'approve'
    ? { admin_request_status: 'approved', role: ROLES.ADMIN, org_id: newOrgId }
    : { admin_request_status: 'rejected' };

  const { error: updateError } = await supabaseAdmin
    .from('profiles')
    .update(updates)
    .eq('user_id', targetUserId);

  if (updateError) {
    if (newOrgId) {
      await supabaseAdmin.from('organizations').delete().eq('id', newOrgId);
    }
    return NextResponse.json({ error: 'Unable to update the request.' }, { status: 500 });
  }

  await logGranularAudit({
    actorUserId: user.id,
    actorRole: profile.role,
    action: 'update',
    resourceTable: 'profiles',
    resourceId: targetUserId,
    fieldName: 'admin_request_status',
    oldValue: target.admin_request_status,
    newValue: updates.admin_request_status,
    orgId: newOrgId,
    metadata: { reason: `admin_request_${action}`, roleChangedTo: updates.role ?? null, organizationId: newOrgId },
  });

  return NextResponse.json({ success: true, role: updates.role ?? target.role, org_id: newOrgId, admin_request_status: updates.admin_request_status });
}
