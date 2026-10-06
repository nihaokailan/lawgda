import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import { PERMISSIONS } from '../../../../lib/rbac';
import { requirePermission, rbacErrorResponse } from '../../../../lib/rbacMiddleware';
import { loadOrgDocumentEvents } from '../../../../lib/orgRepository';

/**
 * Organization Admin's view into the granular accountability log, scoped to
 * their own firm only — never document content, and never another
 * organization's entries (Default Admin has no view_audit_logs permission
 * at all, enforced in lib/rbac.js).
 */
export async function GET(request) {
  let profile;
  try {
    ({ profile } = await requirePermission(PERMISSIONS.VIEW_AUDIT_LOGS));
  } catch (error) {
    return rbacErrorResponse(error);
  }

  const searchParams = new URL(request.url).searchParams;
  const resourceTable = searchParams.get('resourceTable');
  const resourceId = searchParams.get('resourceId');
  const limit = Math.min(Number(searchParams.get('limit')) || 100, 500);

  const supabaseAdmin = getSupabaseAdmin();
  let query = supabaseAdmin
    .from('granular_audit_log')
    .select('id,actor_user_id,actor_role,action,resource_table,resource_id,field_name,old_value,new_value,metadata,created_at')
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (resourceTable) {
    query = query.eq('resource_table', resourceTable);
  }
  if (resourceId) {
    query = query.eq('resource_id', resourceId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: 'Unable to load audit log.' }, { status: 500 });
  }

  const documentEvents = await loadOrgDocumentEvents(profile.org_id, { limit });

  return NextResponse.json({ entries: data, documentEvents }, { headers: { 'Cache-Control': 'private, no-store' } });
}
