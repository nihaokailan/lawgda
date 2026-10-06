import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { PERMISSIONS } from '../../../../../lib/rbac';
import { requirePermission, rbacErrorResponse } from '../../../../../lib/rbacMiddleware';
import { findAssignableAccount, ASSIGNABLE_ACCOUNT_MESSAGES } from '../../../../../lib/orgMembership';

/** Step 1 of adding a member: confirm the email belongs to a real, assignable account. */
export async function POST(request) {
  let profile;
  try {
    ({ profile } = await requirePermission(PERMISSIONS.CREATE_USERS));
  } catch (error) {
    return rbacErrorResponse(error);
  }

  const body = await request.json().catch(() => ({}));
  const result = await findAssignableAccount(getSupabaseAdmin(), profile.org_id, body?.email);

  if (result.status !== 'eligible') {
    return NextResponse.json({ error: ASSIGNABLE_ACCOUNT_MESSAGES[result.status] }, { status: 404 });
  }

  return NextResponse.json({
    account: { email: result.profile.email, fullName: result.profile.full_name },
  });
}
