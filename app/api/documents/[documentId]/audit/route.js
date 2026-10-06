import { NextResponse } from 'next/server';
import { loadAccessibleDocument } from '../../../../../lib/documentAccess';
import { getAuthContext, assertCanViewDocumentContent, rbacErrorResponse } from '../../../../../lib/rbacMiddleware';
import { logDocumentAuditEvent } from '../../../../../lib/auditLog';
import { getSupabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { loadDocumentAuditHistory } from '../../../../../lib/documentAuditHistory';
import { enrichAuditEntries } from '../../../../../lib/auditPresentation';

export async function GET(_request, { params }) {
  const documentId = String(params?.documentId || '').trim();
  if (!documentId) {
    return NextResponse.json({ error: 'Document ID is required.' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  let user;
  let document;
  try {
    // Document-level audit trails expose signer details, so they follow the
    // same owner/permission + organization rules as the document itself.
    const context = await getAuthContext();
    ({ user } = context);
    assertCanViewDocumentContent(context.profile.role);
    document = await loadAccessibleDocument({ user, profile: context.profile, documentId });
  } catch (error) {
    return rbacErrorResponse(error);
  }

  let history;
  try {
    history = await loadDocumentAuditHistory(admin, documentId);
  } catch {
    return NextResponse.json({ error: 'Unable to load the complete audit history.' }, { status: 500 });
  }

  await logDocumentAuditEvent({
    documentId,
    actorUserId: user.id,
    eventType: 'document_viewed',
    details: { context: 'audit_trail_view' },
  });

  return NextResponse.json({
    auditTrail: await enrichAuditEntries(admin, [...history.events].reverse()),
    hashChain: Array.isArray(document.metadata?.hash_chain) ? document.metadata.hash_chain : [],
    chainIntegrity: {
      signingAuditValid: history.signingChain.valid,
      auditLogsValid: history.documentChain.valid,
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
