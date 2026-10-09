import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { PERMISSIONS, ROLES, assertPermission } from '../../../../../lib/rbac';
import { requireWorkspaceMember, rbacErrorResponse } from '../../../../../lib/rbacMiddleware';
import { loadAccessibleDocument } from '../../../../../lib/documentAccess';
import { transitionDocumentStatus } from '../../../../../lib/documentLifecycle';

/**
 * Moves a fully signed document to the final "Filed" state. This is a
 * deliberate Lawyer action (the "Sole Control" holder), not an automatic
 * side effect of the last signature. The DB trigger additionally refuses
 * Filed unless every signer has signed and the signed PDF is saved.
 */
export async function POST(request, { params }) {
  const documentId = String(params?.documentId || '').trim();
  if (!documentId) {
    return NextResponse.json({ error: 'Document ID is required.' }, { status: 400 });
  }

  let user;
  let document;
  try {
    const context = await requireWorkspaceMember([ROLES.LAWYER]);
    assertPermission(context.profile.role, PERMISSIONS.SET_STATUS_FILED);
    ({ user } = context);
    document = await loadAccessibleDocument({ user, profile: context.profile, documentId });
  } catch (error) {
    return rbacErrorResponse(error);
  }

  if (document.status === 'Filed') {
    return NextResponse.json({ error: 'This document is already filed.' }, { status: 409 });
  }
  if (document.status !== 'Signed') {
    return NextResponse.json({ error: 'Only fully signed documents can be filed.' }, { status: 409 });
  }

  const result = await transitionDocumentStatus({
    documentId,
    toStatus: 'Filed',
    actorUserId: user.id,
    reason: 'filed_by_lawyer',
  });

  if (!result.transitioned) {
    return NextResponse.json({ error: result.error || 'Unable to file this document.' }, { status: 409 });
  }

  revalidatePath(`/documents/${documentId}`);
  revalidatePath(`/documents/${documentId}/signed`);
  revalidatePath('/dashboard');
  revalidatePath('/cases');

  return NextResponse.json({ success: true, status: 'Filed' });
}
