import { NextResponse } from 'next/server';
import { resolveSigningRequestByToken } from '../../../../lib/signingValidation';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import { logSigningAuditEvent } from '../../../../lib/signingAudit';

function buildError(reason) {
  const messages = {
    invalid_token: 'This signing link is invalid.',
    expired: 'This signing link has expired.',
    revoked: 'This signing request was revoked.',
    already_completed: 'This signing request has already been completed.',
    not_your_turn: 'This signer cannot sign yet because previous signers are still pending.',
  };
  return messages[reason] ?? 'Signing request is not available.';
}

export async function GET(request, { params }) {
  const supabaseAdmin = getSupabaseAdmin();
  const token = params?.token;
  const url = new URL(request.url);
  const providedEmail = String(url.searchParams.get('email') ?? '').trim().toLowerCase();
  const { request: signingRequest, reason } = await resolveSigningRequestByToken(token);

  if (!signingRequest || reason) {
    if (signingRequest && reason === 'expired') {
      await logSigningAuditEvent({
        signingRequestId: signingRequest.id,
        documentId: signingRequest.document_id,
        eventType: 'request_expired',
        actorType: 'system',
      });
    }
    return NextResponse.json({ error: buildError(reason ?? 'invalid_token'), reason }, { status: 400 });
  }

  if (!signingRequest.viewed_at) {
    await supabaseAdmin
      .from('signing_requests')
      .update({ viewed_at: new Date().toISOString(), status: 'viewed' })
      .eq('id', signingRequest.id);

    await logSigningAuditEvent({
      signingRequestId: signingRequest.id,
      documentId: signingRequest.document_id,
      eventType: 'document_viewed',
      actorType: 'external_signer',
      actorEmail: signingRequest.signer_email,
    });
  }

  const { data: document, error: documentError } = await supabaseAdmin
    .from('documents')
    .select('id,filename,bucket,path,sha256_hash,user_id')
    .eq('id', signingRequest.document_id)
    .single();

  if (documentError || !document) {
    return NextResponse.json({ error: 'Requested document was not found.' }, { status: 404 });
  }

  const { data: requesterProfile } = await supabaseAdmin
    .from('user_profiles')
    .select('full_name,email')
    .eq('user_id', signingRequest.requested_by)
    .single();

  const requestedByName = requesterProfile?.full_name || requesterProfile?.email || 'Lawgda Team';

  const emailMatches = providedEmail && providedEmail === String(signingRequest.signer_email).toLowerCase();
  let reviewUrl = null;

  if (emailMatches) {
    const { data: urlData, error: urlError } = await supabaseAdmin
      .storage
      .from(document.bucket)
      .createSignedUrl(document.path, 5 * 60);

    if (urlError) {
      return NextResponse.json({ error: `Unable to create document URL: ${urlError.message}` }, { status: 500 });
    }

    reviewUrl = urlData.signedUrl;

    await logSigningAuditEvent({
      signingRequestId: signingRequest.id,
      documentId: signingRequest.document_id,
      eventType: 'signer_verified',
      actorType: 'external_signer',
      actorEmail: providedEmail,
      details: {
        context: 'document_access',
      },
    });
  }

  return NextResponse.json({
    signingRequest: {
      id: signingRequest.id,
      signerName: signingRequest.signer_name,
      signerEmail: signingRequest.signer_email,
      expiresAt: signingRequest.expires_at,
      status: signingRequest.status,
      requestedBy: requestedByName,
      signingOrder: signingRequest.signing_order,
    },
    document: {
      id: document.id,
      filename: document.filename,
      sha256Hash: document.sha256_hash,
      reviewUrl,
    },
    requiresSignerVerification: !emailMatches,
  });
}

export async function POST(request, { params }) {
  const supabaseAdmin = getSupabaseAdmin();
  const token = params?.token;
  const body = await request.json();
  const providedEmail = String(body?.email ?? '').trim().toLowerCase();

  const { request: signingRequest, reason } = await resolveSigningRequestByToken(token);

  if (!signingRequest || reason) {
    if (signingRequest && reason === 'expired') {
      await logSigningAuditEvent({
        signingRequestId: signingRequest.id,
        documentId: signingRequest.document_id,
        eventType: 'request_expired',
        actorType: 'system',
      });
    }
    return NextResponse.json({ error: buildError(reason ?? 'invalid_token'), reason }, { status: 400 });
  }

  if (!providedEmail || providedEmail !== String(signingRequest.signer_email).toLowerCase()) {
    return NextResponse.json({ error: 'Signer identity could not be verified.' }, { status: 403 });
  }

  await logSigningAuditEvent({
    signingRequestId: signingRequest.id,
    documentId: signingRequest.document_id,
    eventType: 'signer_verified',
    actorType: 'external_signer',
    actorEmail: providedEmail,
  });

  const now = new Date().toISOString();
  const { error: signError } = await supabaseAdmin
    .from('signing_requests')
    .update({ status: 'signed', signed_at: now })
    .eq('id', signingRequest.id);

  if (signError) {
    return NextResponse.json({ error: signError.message }, { status: 400 });
  }

  const { data: doc } = await supabaseAdmin
    .from('documents')
    .select('document_history')
    .eq('id', signingRequest.document_id)
    .single();

  const history = Array.isArray(doc?.document_history) ? doc.document_history : [];
  history.push({
    event: 'signing_completed',
    signing_request_id: signingRequest.id,
    signer_email: providedEmail,
    at: now,
  });

  await supabaseAdmin
    .from('documents')
    .update({ document_history: history })
    .eq('id', signingRequest.document_id);

  await logSigningAuditEvent({
    signingRequestId: signingRequest.id,
    documentId: signingRequest.document_id,
    eventType: 'signing_completed',
    actorType: 'external_signer',
    actorEmail: providedEmail,
  });

  return NextResponse.json({ success: true });
}
