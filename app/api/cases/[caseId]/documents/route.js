import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { ROLES } from '../../../../../lib/rbac';
import { requireWorkspaceMember, rbacErrorResponse } from '../../../../../lib/rbacMiddleware';
import { loadAccessibleDocument } from '../../../../../lib/documentAccess';
import { getSupabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { canManageCase, caseErrorResponse } from '../../../../../lib/caseFolders';

/**
 * Adds a document to (POST) or removes it from (DELETE) a case folder. Body:
 * { documentId }. The caller must manage the case and have access to the
 * document; the move and its audit records are written in one transaction.
 */
async function changeMembership(request, params, functionName) {
  let user;
  let profile;
  const caseId = String(params?.caseId || '');
  const body = await request.json().catch(() => ({}));
  const documentId = String(body?.documentId || '');

  try {
    ({ user, profile } = await requireWorkspaceMember([ROLES.LAWYER, ROLES.STAFF]));
    await loadAccessibleDocument({ user, profile, documentId });
  } catch (error) {
    return rbacErrorResponse(error);
  }

  const admin = getSupabaseAdmin();
  const { data: caseRow } = await admin.from('cases').select('id,org_id').eq('id', caseId).maybeSingle();
  if (!caseRow || !canManageCase(profile, caseRow)) {
    return NextResponse.json({ error: 'Case not found.' }, { status: 404 });
  }

  const { data: updated, error } = await admin.rpc(functionName, {
    p_document_id: documentId,
    p_case_id: caseId,
    p_actor: user.id,
    p_actor_role: profile.role,
  });

  if (error || !updated) {
    console.error(`[cases] ${functionName} failed:`, error?.message || 'no row returned');
    const { status, error: message } = caseErrorResponse(error?.message);
    return NextResponse.json({ error: message }, { status });
  }

  revalidatePath(`/cases/${caseId}`);
  revalidatePath(`/documents/${documentId}`);
  revalidatePath('/case-folders');
  revalidatePath('/cases');
  return NextResponse.json({ success: true, document: { id: updated.id, caseId: updated.case_id, caseNumber: updated.case_number } });
}

export async function POST(request, context) {
  return changeMembership(request, context.params, 'add_document_to_case');
}

export async function DELETE(request, context) {
  return changeMembership(request, context.params, 'remove_document_from_case');
}
