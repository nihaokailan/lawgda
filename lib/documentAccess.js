import { getSupabaseAdmin } from './supabaseAdmin';
import { RbacError, ROLES } from './rbac';

/**
 * True when Staff may work on a document because it belongs to a Lawyer of
 * their own firm (paralegals support their firm's Lawyers). Pure check, given
 * the owner's profile.
 */
export function isFirmLawyerDocumentForStaff(profile, document, ownerProfile) {
  return profile?.role === ROLES.STAFF
    && Boolean(profile.org_id)
    && document?.org_id === profile.org_id
    && ownerProfile?.role === ROLES.LAWYER
    && ownerProfile?.org_id === profile.org_id;
}

/**
 * Whether this user may open a document: its owner or uploader, Staff of the
 * owning Lawyer's firm, or someone with an explicit document_permissions
 * grant. Read with the service role (browser-session reads of these tables
 * hit a recursive RLS policy). Does not check the organization; callers that
 * need that (loadAccessibleDocument) check it first.
 */
export async function hasDocumentAccess({ user, profile, document }) {
  if (!document || profile?.role === ROLES.DEFAULT_ADMIN) {
    return false;
  }

  const ownerId = document.owner_id ?? document.user_id;
  if (ownerId === user.id || document.uploaded_by === user.id) {
    return true;
  }

  const admin = getSupabaseAdmin();
  if (profile.role === ROLES.STAFF && ownerId && document.org_id === profile.org_id) {
    const { data: ownerProfile } = await admin
      .from('profiles')
      .select('role,org_id')
      .eq('user_id', ownerId)
      .maybeSingle();
    if (isFirmLawyerDocumentForStaff(profile, document, ownerProfile)) {
      return true;
    }
  }

  const { data: permission } = await admin
    .from('document_permissions')
    .select('id')
    .eq('document_id', document.id)
    .eq('user_id', user.id)
    .maybeSingle();
  return Boolean(permission);
}

/**
 * Service-role routes bypass RLS, so document access has to be re-checked
 * here: the caller must belong to the document's organization AND pass
 * hasDocumentAccess. Admins are never treated as owners and get no special
 * path here.
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

  if (!(await hasDocumentAccess({ user, profile, document }))) {
    throw new RbacError('Access denied.', 403);
  }

  return document;
}
