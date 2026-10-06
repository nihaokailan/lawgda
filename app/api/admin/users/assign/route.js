import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { PERMISSIONS, ADMIN_CREATABLE_ROLES } from '../../../../../lib/rbac';
import { requirePermission, rbacErrorResponse } from '../../../../../lib/rbacMiddleware';
import { logGranularAudit } from '../../../../../lib/granularAudit';
import { findAssignableAccount, ASSIGNABLE_ACCOUNT_MESSAGES } from '../../../../../lib/orgMembership';

/**
 * Step 2: assigns Lawyer or Staff to an existing, confirmed account and
 * attaches it to the caller's organization. Requires explicit confirmation
 * (`confirmed: true`) so a role can never be granted by a stray request.
 */
export async function POST(request) {
  let user;
  let profile;
  try {
    ({ user, profile } = await requirePermission(PERMISSIONS.CREATE_USERS));
  } catch (error) {
    return rbacErrorResponse(error);
  }

  const body = await request.json().catch(() => ({}));
  const role = String(body?.role ?? '').trim();

  if (!ADMIN_CREATABLE_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Role must be lawyer or staff.' }, { status: 400 });
  }
  if (body?.confirmed !== true) {
    return NextResponse.json({ error: 'The role assignment must be confirmed.' }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const result = await findAssignableAccount(supabaseAdmin, profile.org_id, body?.email);
  if (result.status !== 'eligible') {
    return NextResponse.json({ error: ASSIGNABLE_ACCOUNT_MESSAGES[result.status] }, { status: 404 });
  }

  // Conditional update: only a still-firm-less Normal account can be claimed,
  // so two admins cannot race for the same person.
  const { data: updated, error } = await supabaseAdmin
    .from('profiles')
    .update({ role, org_id: profile.org_id, admin_request_status: 'none' })
    .eq('user_id', result.profile.user_id)
    .eq('role', 'normal')
    .is('org_id', null)
    .select('user_id')
    .maybeSingle();

  if (error || !updated) {
    return NextResponse.json({ error: ASSIGNABLE_ACCOUNT_MESSAGES.unavailable }, { status: 409 });
  }

  await logGranularAudit({
    actorUserId: user.id,
    actorRole: profile.role,
    action: 'update',
    resourceTable: 'profiles',
    resourceId: result.profile.user_id,
    fieldName: 'role',
    oldValue: 'normal',
    newValue: role,
    orgId: profile.org_id,
    metadata: { source: 'org_admin_role_assignment' },
  });

  return NextResponse.json({ success: true });
}
