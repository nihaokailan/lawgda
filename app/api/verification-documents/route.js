import { NextResponse } from 'next/server';
import { ROLES } from '../../../lib/rbac';
import { requireWorkspaceMember, rbacErrorResponse } from '../../../lib/rbacMiddleware';
import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { listVerificationDocuments } from '../../../lib/verificationDocuments';

export const dynamic = 'force-dynamic';

export async function GET() {
  let user;
  try {
    ({ user } = await requireWorkspaceMember([ROLES.LAWYER, ROLES.STAFF, ROLES.NORMAL]));
  } catch (error) {
    return rbacErrorResponse(error);
  }

  try {
    const documents = await listVerificationDocuments(getSupabaseAdmin(), user.id);
    return NextResponse.json({ documents }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (failure) {
    console.error('[verification] Document list failed:', failure);
    return NextResponse.json({ error: 'Unable to load your documents. Please try again.' }, { status: 500 });
  }
}
