import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { ROLES } from '../../../../lib/rbac';
import { requireWorkspaceMember, rbacErrorResponse } from '../../../../lib/rbacMiddleware';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import { INDEX_LIMITS } from '../../../../lib/documentIndexing';
import { canManageCase, caseErrorResponse, validateCaseFields } from '../../../../lib/caseFolders';

/**
 * Renames a case folder (title and/or case number). A new case number is
 * applied to every non-Filed document in the case, each change logged on that
 * document's audit trail, all in one transaction (rename_case).
 */
export async function PATCH(request, { params }) {
  let user;
  let profile;
  try {
    ({ user, profile } = await requireWorkspaceMember([ROLES.LAWYER, ROLES.STAFF]));
  } catch (error) {
    return rbacErrorResponse(error);
  }

  const caseId = String(params?.caseId || '');
  const admin = getSupabaseAdmin();
  const { data: caseRow } = await admin.from('cases').select('id,org_id').eq('id', caseId).maybeSingle();
  if (!caseRow || !canManageCase(profile, caseRow)) {
    return NextResponse.json({ error: 'Case not found.' }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const title = String(body?.title ?? '').trim();
  const caseNumber = String(body?.caseNumber ?? '').trim();
  const note = String(body?.note ?? '').trim();
  const problem = validateCaseFields({ title, caseNumber });
  if (problem) {
    return NextResponse.json({ error: problem }, { status: 400 });
  }
  if (note.length > INDEX_LIMITS.note) {
    return NextResponse.json({ error: `The reason for the change must be at most ${INDEX_LIMITS.note} characters.` }, { status: 400 });
  }

  const { data: updated, error } = await admin.rpc('rename_case', {
    p_case_id: caseId,
    p_actor: user.id,
    p_actor_role: profile.role,
    p_title: title,
    p_case_number: caseNumber,
    p_note: note || null,
  });

  if (error || !updated) {
    console.error('[cases] rename_case failed:', error?.message || 'no row returned');
    const { status, error: message } = caseErrorResponse(error?.message);
    return NextResponse.json({ error: message }, { status });
  }

  revalidatePath(`/cases/${caseId}`);
  revalidatePath('/case-folders');
  revalidatePath('/cases');
  return NextResponse.json({ success: true, case: { id: updated.id, title: updated.title, caseNumber: updated.case_number } });
}
