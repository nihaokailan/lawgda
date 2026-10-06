import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import { ROLES } from '../../../../lib/rbac';
import { requireWorkspaceMember, rbacErrorResponse } from '../../../../lib/rbacMiddleware';
import { loadAccessibleDocument } from '../../../../lib/documentAccess';
import { loadMySigningTurns } from '../../../../lib/signingTurn';
import { generateSigningToken, hashSigningToken } from '../../../../lib/signingTokens';
import { logDocumentAuditEvent } from '../../../../lib/auditLog';

/**
 * Lets a Lawyer start signing from inside Lawgda instead of the emailed link.
 * It only works on the Lawyer's turn, and it replaces the request's signing
 * token — so the emailed link stops working. A request can therefore be
 * completed through exactly one entry point, and once signed neither works.
 */
async function handle(request) {
  let user;
  let profile;
  try {
    ({ user, profile } = await requireWorkspaceMember([ROLES.LAWYER]));
  } catch (error) {
    return rbacErrorResponse(error);
  }

  const body = await request.json().catch(() => ({}));
  const documentId = String(body?.documentId ?? '').trim();
  if (!documentId) {
    return NextResponse.json({ error: 'documentId is required.' }, { status: 400 });
  }

  try {
    await loadAccessibleDocument({ user, profile, documentId });
  } catch (error) {
    return rbacErrorResponse(error);
  }

  const admin = getSupabaseAdmin();
  const turns = await loadMySigningTurns(admin, profile.email ?? user.email, [documentId]);
  const turn = turns.get(documentId);

  if (!turn) {
    return NextResponse.json({ error: 'There is no pending signature for you on this document.' }, { status: 404 });
  }
  if (turn.state !== 'sign') {
    return NextResponse.json({ error: 'It is not your turn to sign yet. Other signers must sign first.' }, { status: 409 });
  }

  const token = generateSigningToken();
  const { data: claimed, error } = await admin
    .from('signing_requests')
    .update({ token_hash: hashSigningToken(token) })
    .eq('id', turn.requestId)
    .in('status', ['pending', 'viewed'])
    .select('id')
    .maybeSingle();

  if (error || !claimed) {
    return NextResponse.json({ error: 'This signature was just completed or is no longer available.' }, { status: 409 });
  }

  // Recorded in the document audit log (signing_audit_events only allows a fixed set of event types).
  await logDocumentAuditEvent({
    documentId,
    actorUserId: user.id,
    eventType: 'signing_started_in_app',
    details: { signing_request_id: turn.requestId },
  }).catch((failure) => console.error('[audit] Unable to record in-app signing start:', failure));

  return NextResponse.json({ url: `/sign/${encodeURIComponent(token)}` }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request) {
  try {
    return await handle(request);
  } catch (error) {
    console.error('[sign-now] Unexpected failure:', error);
    return NextResponse.json({ error: 'Unable to start signing. Please try again.' }, { status: 500 });
  }
}
