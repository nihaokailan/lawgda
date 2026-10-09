import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { ROLES } from '../../../../../lib/rbac';
import { requireWorkspaceMember, rbacErrorResponse } from '../../../../../lib/rbacMiddleware';
import { loadAccessibleDocument } from '../../../../../lib/documentAccess';
import { getSupabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { INDEX_LIMITS, parseTags, validateIndexFields } from '../../../../../lib/documentIndexing';

/**
 * Data entry & indexing for Lawyers and Paralegal/Staff (title, case number,
 * tags). Metadata only — file content can never be changed in Lawgda. Every
 * edit, including typo fixes, goes through update_document_metadata(), which
 * writes the change and its audit records in a single transaction.
 */
export async function PATCH(request, { params }) {
  let user;
  let profile;
  try {
    ({ user, profile } = await requireWorkspaceMember([ROLES.LAWYER, ROLES.STAFF]));
    await loadAccessibleDocument({ user, profile, documentId: String(params?.documentId || '') });
  } catch (error) {
    return rbacErrorResponse(error);
  }

  const body = await request.json().catch(() => ({}));
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);

  if (!has('title') && !has('caseNumber') && !has('tags')) {
    return NextResponse.json({ error: 'Provide at least one of: title, caseNumber, tags.' }, { status: 400 });
  }

  const title = has('title') ? String(body.title ?? '').trim() : null;
  const caseNumber = has('caseNumber') ? String(body.caseNumber ?? '').trim() : null;
  const tags = has('tags') ? parseTags(body.tags) : null;
  const note = String(body.note ?? '').trim();

  if (title !== null && (!title || title.length > INDEX_LIMITS.title)) {
    return NextResponse.json({ error: `Title is required and must be at most ${INDEX_LIMITS.title} characters.` }, { status: 400 });
  }
  const indexProblem = validateIndexFields({ caseNumber: caseNumber ?? '', tags: tags ?? [] });
  if (indexProblem) {
    return NextResponse.json({ error: indexProblem }, { status: 400 });
  }
  if (note.length > INDEX_LIMITS.note) {
    return NextResponse.json({ error: `The reason for the change must be at most ${INDEX_LIMITS.note} characters.` }, { status: 400 });
  }

  const { data: updated, error } = await getSupabaseAdmin().rpc('update_document_metadata', {
    p_document_id: params.documentId,
    p_actor: user.id,
    p_actor_role: profile.role,
    p_title: title,
    p_case_number: caseNumber,
    p_tags: tags,
    p_note: note || null,
  });

  if (error || !updated) {
    console.error('[index] update_document_metadata failed:', error?.message || 'no row returned');
    const locked = error?.message?.includes('Filed documents are locked');
    return NextResponse.json({ error: locked ? 'Filed documents are locked; their details can no longer be edited.' : 'Unable to save the changes.' }, { status: locked ? 409 : 400 });
  }

  revalidatePath(`/documents/${params.documentId}`);
  revalidatePath('/dashboard');
  revalidatePath('/cases');

  return NextResponse.json({
    success: true,
    document: { id: updated.id, title: updated.title, caseNumber: updated.case_number, tags: updated.tags },
  });
}
