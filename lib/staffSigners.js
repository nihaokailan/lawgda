import { ROLES } from './rbac';

export const STAFF_SIGNER_MESSAGE = 'Staff members are not allowed to sign documents. Please change this email.';

/**
 * Returns the subset of `emails` that belong to Staff accounts. Staff may
 * draft and organize documents but never sign them, so a signing link must
 * never be issued to (or accepted from) a Staff account.
 */
export async function findStaffEmails(supabaseAdmin, emails) {
  const wanted = [...new Set((emails || []).map((email) => String(email ?? '').trim().toLowerCase()).filter(Boolean))];
  if (wanted.length === 0) {
    return [];
  }

  const { data } = await supabaseAdmin
    .from('profiles')
    .select('email')
    .eq('role', ROLES.STAFF)
    .in('email', wanted);

  const staff = new Set((data || []).map((row) => String(row.email).toLowerCase()));
  return wanted.filter((email) => staff.has(email));
}
