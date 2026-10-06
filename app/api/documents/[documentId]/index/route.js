import { NextResponse } from 'next/server';
import { PERMISSIONS } from '../../../../../lib/rbac';
import { requirePermission, assertOwnOrganization, rbacErrorResponse } from '../../../../../lib/rbacMiddleware';
import { performAuditedUpdate } from '../../../../../lib/granularAudit';
import { getSupabaseAdmin } from '../../../../../lib/supabaseAdmin';

const EDITABLE_FIELDS = ['filename', 'folder_id'];

/**
 * Paralegal/Staff data-entry & document-indexing controller. Deliberately
 * limited to metadata fields (filename, folder placement) — never file
 * content — and every write goes through performAuditedUpdate(), which
 * forces a granular_audit_log entry per changed field. There is no path in
 * this route that can write to `documents` without logging.
 */
export async function PATCH(request, { params }) {
  let user;
  let profile;
  try {
    ({ user, profile } = await requirePermission(PERMISSIONS.DOCUMENT_INDEXING));
  } catch (error) {
    return rbacErrorResponse(error);
  }

  const documentId = String(params?.documentId || '').trim();
  if (!documentId) {
    return NextResponse.json({ error: 'Document ID is required.' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const updates = {};
  for (const field of EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: `Provide at least one of: ${EDITABLE_FIELDS.join(', ')}.` }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: document, error: fetchError } = await supabaseAdmin
    .from('documents')
    .select('org_id')
    .eq('id', documentId)
    .single();

  if (fetchError || !document) {
    return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  }

  try {
    assertOwnOrganization(profile, document.org_id);
  } catch (error) {
    return rbacErrorResponse(error);
  }

  try {
    const updated = await performAuditedUpdate({
      table: 'documents',
      id: documentId,
      updates,
      actorUserId: user.id,
      actorRole: profile.role,
      orgId: profile.org_id,
      metadata: { source: 'document_indexing_route' },
    });
    return NextResponse.json({ success: true, document: { id: updated.id, filename: updated.filename, folder_id: updated.folder_id } });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
