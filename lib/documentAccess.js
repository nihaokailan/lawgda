import { getSupabaseAdmin } from './supabaseAdmin';
import { RbacError, ROLES } from './rbac';

/**
 * Service-role routes bypass RLS, so document access has to be re-checked
 * here: the caller must belong to the document's organization AND be its
 * owner/uploader or hold an explicit document_permissions grant. Admins are never
 * treated as owners and get no special path here.
 */
export async function loadAccessibleDocument({ user, profile, documentId }) {
  if (profile.role === ROLES.DEFAULT_ADMIN) {
    throw new RbacError('Default Admin cannot access documents.', 403);
  }

  const admin = getSupabaseAdmin();
  const { data: document, error } = await admin
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .maybeSingle();

  if (error || !document) {
    throw new RbacError('Document not found.', 404);
  }

  if (document.org_id && document.org_id !== profile.org_id) {
    // Same response as a missing document so IDs of other firms are not confirmable.
    throw new RbacError('Document not found.', 404);
  }

  const ownerId = document.owner_id ?? document.user_id;
  if (ownerId === user.id || document.uploaded_by === user.id) {
    return document;
  }

  const { data: permission } = await admin
    .from('document_permissions')
    .select('id')
    .eq('document_id', documentId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!permission) {
    throw new RbacError('Access denied.', 403);
  }

  return document;
}
