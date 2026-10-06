import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import { ROLES } from '../../../../lib/rbac';
import { requireWorkspaceMember, rbacErrorResponse } from '../../../../lib/rbacMiddleware';
import { findStaffEmails, STAFF_SIGNER_MESSAGE } from '../../../../lib/staffSigners';

/**
 * Pre-flight check run before any signing link is created or emailed, so a
 * workflow containing a Staff email is rejected as a whole rather than
 * partially sent.
 */
export async function POST(request) {
  try {
    await requireWorkspaceMember([ROLES.LAWYER, ROLES.STAFF]);
  } catch (error) {
    return rbacErrorResponse(error);
  }

  const body = await request.json().catch(() => ({}));
  const emails = Array.isArray(body?.emails) ? body.emails.slice(0, 50) : [];
  const staffEmails = await findStaffEmails(getSupabaseAdmin(), emails);

  return NextResponse.json({ staffEmails, message: staffEmails.length ? STAFF_SIGNER_MESSAGE : null });
}
