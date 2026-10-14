import { NextResponse } from 'next/server';
import { resolveSigningRequestByToken } from '../../../../../lib/signingValidation';
import { getSupabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { sendSignerCodeEmail } from '../../../../../lib/email';
import { logDocumentAuditEvent } from '../../../../../lib/auditLog';
import { logSigningAuditEvent } from '../../../../../lib/signingAudit';
import {
  SignerVerificationError,
  issueSignerCode,
  setSignerSessionCookie,
  verifySignerCode,
} from '../../../../../lib/signerVerification';

export const dynamic = 'force-dynamic';

/**
 * Email one-time-code check for a signer.
 *   { action: 'send', email }  emails a 6-digit code to the assigned address
 *   { action: 'check', code }  verifies it and sets the verified-signer cookie
 */
export async function POST(request, { params }) {
  const token = String(params?.token || '');
  const body = await request.json().catch(() => ({}));
  const { request: signingRequest, reason } = await resolveSigningRequestByToken(token);
  if (!signingRequest || reason) {
    return NextResponse.json({ error: 'This signing link is no longer available.' }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const signerEmail = String(signingRequest.signer_email).toLowerCase();

  try {
    if (body?.action === 'send') {
      const providedEmail = String(body?.email ?? '').trim().toLowerCase();
      if (providedEmail !== signerEmail) {
        return NextResponse.json({ error: 'That email does not match the one this request was sent to.' }, { status: 403 });
      }

      const code = await issueSignerCode(supabaseAdmin, signingRequest.id);
      const delivery = await sendSignerCodeEmail({ to: signerEmail, signerName: signingRequest.signer_name, code });
      if (!delivery.ok) {
        if (process.env.NODE_ENV !== 'production') {
          console.info(`[signer-code] Email not sent (${delivery.reason}). Development code for ${signerEmail}: ${code}`);
        }
        return NextResponse.json({ error: 'We could not email your code right now. Please try again shortly.' }, { status: 502 });
      }

      await logDocumentAuditEvent({
        documentId: signingRequest.document_id,
        eventType: 'signer_code_sent',
        details: { signing_request_id: signingRequest.id, signer_email: signerEmail },
      }).catch((failure) => console.error('[audit] Unable to record signer code:', failure));

      return NextResponse.json({ sent: true });
    }

    if (body?.action === 'check') {
      const sessionToken = await verifySignerCode(supabaseAdmin, signingRequest.id, body?.code);
      await logSigningAuditEvent({
        signingRequestId: signingRequest.id,
        documentId: signingRequest.document_id,
        eventType: 'signer_verified',
        actorType: 'external_signer',
        actorEmail: signerEmail,
        details: { method: 'email_code' },
      });
      return setSignerSessionCookie(NextResponse.json({ verified: true }), token, sessionToken);
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (error) {
    if (error instanceof SignerVerificationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[signer-code] Unexpected failure:', error);
    return NextResponse.json({ error: 'Unable to verify right now. Please try again.' }, { status: 500 });
  }
}
