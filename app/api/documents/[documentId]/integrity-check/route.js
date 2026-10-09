import { NextResponse } from 'next/server';
import { getAuthContext, rbacErrorResponse } from '../../../../../lib/rbacMiddleware';
import { loadAccessibleDocument } from '../../../../../lib/documentAccess';
import { logDocumentAuditEvent } from '../../../../../lib/auditLog';
import { classifyFileHash } from '../../../../../lib/publicVerification';

const SHA256_HEX = /^[0-9a-f]{64}$/;

/**
 * Records the result of an in-app integrity check in the document's
 * hash-chained audit trail. The browser sends only the SHA-256 it computed;
 * the server decides match/mismatch itself against the recorded hash, so a
 * client cannot log a false "verified" result.
 */
export async function POST(request, { params }) {
  let user;
  let document;
  try {
    const context = await getAuthContext();
    ({ user } = context);
    document = await loadAccessibleDocument({ user, profile: context.profile, documentId: String(params?.documentId || '') });
  } catch (error) {
    return rbacErrorResponse(error);
  }

  const body = await request.json().catch(() => ({}));
  const computedHash = String(body?.computedHash || '').trim().toLowerCase();
  const version = body?.version === 'signed' ? 'signed' : 'original';
  const channel = ['verify_page', 'document_page'].includes(body?.channel) ? body.channel : 'verify_page';

  if (!SHA256_HEX.test(computedHash)) {
    return NextResponse.json({ error: 'A SHA-256 hash computed in the browser is required.' }, { status: 400 });
  }

  const metadata = document.metadata && typeof document.metadata === 'object' && !Array.isArray(document.metadata) ? document.metadata : {};
  const expectedHash = String((version === 'signed' ? metadata.post_sign_hash : document.sha256_hash) || '').toLowerCase();
  if (!SHA256_HEX.test(expectedHash)) {
    return NextResponse.json({ error: 'This document version does not have a recorded hash yet.' }, { status: 409 });
  }

  const matches = computedHash === expectedHash;
  const { outcome, matchedVersion } = classifyFileHash(document, computedHash);

  await logDocumentAuditEvent({
    documentId: document.id,
    actorUserId: user.id,
    eventType: matches ? 'integrity_check_passed' : 'integrity_check_failed',
    details: { channel, version, expected_hash: expectedHash, computed_hash: computedHash, matched_other_version: matches ? null : matchedVersion, outcome },
  });

  return NextResponse.json({ matches, outcome, matchedVersion, expectedHash }, { headers: { 'Cache-Control': 'no-store' } });
}
