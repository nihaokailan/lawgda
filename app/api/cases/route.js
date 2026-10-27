import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { ROLES } from '../../../lib/rbac';
import { requireWorkspaceMember, rbacErrorResponse } from '../../../lib/rbacMiddleware';
import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { caseErrorResponse, validateCaseFields } from '../../../lib/caseFolders';

/** Creates a case folder in the caller's firm (Lawyers and Staff). */
export async function POST(request) {
  let user;
  let profile;
  try {
    ({ user, profile } = await requireWorkspaceMember([ROLES.LAWYER, ROLES.STAFF]));
  } catch (error) {
    return rbacErrorResponse(error);
  }

  const body = await request.json().catch(() => ({}));
  const title = String(body?.title ?? '').trim();
  const caseNumber = String(body?.caseNumber ?? '').trim();
  const problem = validateCaseFields({ title, caseNumber });
  if (problem) {
    return NextResponse.json({ error: problem }, { status: 400 });
  }

  const { data: created, error } = await getSupabaseAdmin().rpc('create_case', {
    p_actor: user.id,
    p_actor_role: profile.role,
    p_org_id: profile.org_id,
    p_title: title,
    p_case_number: caseNumber,
  });

  if (error || !created) {
    console.error('[cases] create_case failed:', error?.message || 'no row returned');
    const { status, error: message } = caseErrorResponse(error?.message);
    return NextResponse.json({ error: message }, { status });
  }

  revalidatePath('/cases');
  return NextResponse.json({ success: true, case: { id: created.id, title: created.title, caseNumber: created.case_number } });
}
