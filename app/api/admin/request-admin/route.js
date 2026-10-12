import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../../lib/supabase/server';
import { PERMISSIONS } from '../../../../lib/rbac';
import { requirePermission, rbacErrorResponse } from '../../../../lib/rbacMiddleware';

export async function POST(request) {
  let user;
  try {
    ({ user } = await requirePermission(PERMISSIONS.REQUEST_ADMIN_ROLE));
  } catch (error) {
    return rbacErrorResponse(error);
  }

  const supabase = createSupabaseServerClient();
  const body = await request.json();
  const organizationName = String(body?.organizationName ?? '').trim();
  const justification = String(body?.justification ?? '').trim();

  if (!organizationName) {
    return NextResponse.json({ error: 'Organization name is required.' }, { status: 400 });
  }

  const { data: updatedProfile, error: updateError } = await supabase
    .from('profiles')
    .update({
      email: user.email ?? null,
      requested_org_name: organizationName,
      admin_request_note: justification || null,
      admin_request_status: 'pending',
      admin_requested_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)
    .eq('role', 'normal')
    .is('org_id', null)
    .select('user_id,admin_request_status,requested_org_name,admin_requested_at')
    .maybeSingle();

  if (updateError) {
    return NextResponse.json({ error: `Unable to save the admin request: ${updateError.message}` }, { status: 400 });
  }

  if (!updatedProfile) {
    return NextResponse.json({ error: 'Your account could not be found or is not eligible to request admin access.' }, { status: 409 });
  }

  return NextResponse.json({ success: true, request: updatedProfile });
}
