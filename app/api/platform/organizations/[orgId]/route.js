import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { PERMISSIONS } from '../../../../../lib/rbac';
import { requirePermission, rbacErrorResponse } from '../../../../../lib/rbacMiddleware';
import { logGranularAudit } from '../../../../../lib/granularAudit';

const ORG_STATUSES = ['active', 'inactive'];

/**
 * Default Admin renames or activates/deactivates a law firm. Touches the
 * organizations row only; it never reads or writes the firm's users,
 * documents or keys. A deactivated firm is locked out at the guard level
 * (lib/rbacMiddleware.js, lib/authGuard.js).
 */
export async function PATCH(request, { params }) {
  let user;
  let profile;
  try {
    ({ user, profile } = await requirePermission(PERMISSIONS.MANAGE_ORGANIZATIONS));
  } catch (error) {
    return rbacErrorResponse(error);
  }

  const orgId = String(params?.orgId || '').trim();
  const body = await request.json().catch(() => ({}));
  const updates = {};

  if (body?.status !== undefined) {
    if (!ORG_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: 'Status must be "active" or "inactive".' }, { status: 400 });
    }
    updates.status = body.status;
  }
  if (body?.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) {
      return NextResponse.json({ error: 'Organization name cannot be empty.' }, { status: 400 });
    }
    updates.name = name;
  }

  if (!orgId || Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Provide an organization and at least one of: name, status.' }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: before } = await supabaseAdmin
    .from('organizations')
    .select('id,name,status')
    .eq('id', orgId)
    .maybeSingle();

  if (!before) {
    return NextResponse.json({ error: 'Organization not found.' }, { status: 404 });
  }

  const { data: updated, error } = await supabaseAdmin
    .from('organizations')
    .update(updates)
    .eq('id', orgId)
    .select('id,name,status')
    .single();

  if (error) {
    return NextResponse.json({ error: 'Unable to update the organization.' }, { status: 400 });
  }

  for (const [field, newValue] of Object.entries(updates)) {
    if (before[field] === newValue) continue;
    await logGranularAudit({
      actorUserId: user.id,
      actorRole: profile.role,
      action: 'update',
      resourceTable: 'organizations',
      resourceId: orgId,
      fieldName: field,
      oldValue: before[field],
      newValue,
      orgId,
      metadata: { source: 'platform_org_management' },
    });
  }

  return NextResponse.json({ organization: updated });
}
