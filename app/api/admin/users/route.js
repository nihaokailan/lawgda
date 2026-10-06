import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import { PERMISSIONS } from '../../../../lib/rbac';
import { requirePermission, rbacErrorResponse } from '../../../../lib/rbacMiddleware';

/**
 * Organization Admin's roster of their own firm. The org filter comes from
 * the caller's profile, never from the request, so another firm's members
 * cannot be requested.
 */
export async function GET() {
  let profile;
  try {
    ({ profile } = await requirePermission(PERMISSIONS.MANAGE_USERS));
  } catch (error) {
    return rbacErrorResponse(error);
  }

  const { data, error } = await getSupabaseAdmin()
    .from('profiles')
    .select('user_id,email,full_name,role,is_active,created_at')
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: 'Unable to load organization members.' }, { status: 500 });
  }

  return NextResponse.json({ users: data || [] });
}
