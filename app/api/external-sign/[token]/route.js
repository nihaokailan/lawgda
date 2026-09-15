import { NextResponse } from 'next/server';
import { resolveSigningRequestByToken } from '../../../../lib/signingValidation';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import { logSigningAuditEvent } from '../../../../lib/signingAudit';
import { addElectronicSignature } from '../../../../lib/signedPdf';
import { sha256Hex } from '../../../../lib/documentHash';
import { generateSigningToken, hashSigningToken } from '../../../../lib/signingTokens';
import { sendSigningInvitationEmail } from '../../../../lib/email';
import { randomBytes } from 'node:crypto';
import QRCode from 'qrcode';

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
    .select('id,filename,title,bucket,path,file_path,storage_path,sha256_hash,user_id,metadata')
    .eq('id', signingRequest.document_id)
    .single();

  if (documentError || !document) {
    return NextResponse.json({ error: 'Requested document was not found.' }, { status: 404 });
  }

  const { data: requesterProfile } = await supabaseAdmin
    .from('profiles')
    .select('full_name,email')
    .eq('user_id', signingRequest.requested_by)
    .single();

  const requestedByName = requesterProfile?.full_name || requesterProfile?.email || 'Lawgda Team';

  const emailMatches = providedEmail && providedEmail === String(signingRequest.signer_email).toLowerCase();
  let reviewUrl = null;

  if (emailMatches) {
    const metadata = document.metadata && typeof document.metadata === 'object' && !Array.isArray(document.metadata)
      ? document.metadata
      : {};
    const reviewBucket = String(metadata.signed_bucket || document.bucket || 'secure_docs');
    const reviewPath = String(metadata.signed_file_path || metadata.signed_storage_path || metadata.signed_path || document.file_path || document.storage_path || document.path || '');
    const { data: urlData, error: urlError } = await supabaseAdmin
      .storage
      .from(reviewBucket)
      .createSignedUrl(reviewPath, 5 * 60);

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
  const signatureName = String(body?.signatureName ?? '').trim();
  const signatureDataUrl = String(body?.signatureDataUrl ?? '').trim();

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

  if (!signatureName) {
    return NextResponse.json({ error: 'Type your full name to sign the document.' }, { status: 400 });
  }

  if (!/^data:image\/png;base64,/.test(signatureDataUrl)) {
    return NextResponse.json({ error: 'Draw your signature before signing the document.' }, { status: 400 });
  }

  await logSigningAuditEvent({
    signingRequestId: signingRequest.id,
    documentId: signingRequest.document_id,
    eventType: 'signer_verified',
    actorType: 'external_signer',
    actorEmail: providedEmail,
  });

  const { data: document, error: documentError } = await supabaseAdmin
    .from('documents')
    .select('id,bucket,path,file_path,storage_path,metadata')
    .eq('id', signingRequest.document_id)
    .single();

  if (documentError || !document) {
    return NextResponse.json({ error: 'Requested document was not found.' }, { status: 404 });
  }

  const metadata = document.metadata && typeof document.metadata === 'object' && !Array.isArray(document.metadata)
    ? document.metadata
    : {};
  const existingHashChain = Array.isArray(metadata.hash_chain) ? metadata.hash_chain : [];
  const bucket = String(metadata.signed_bucket || document.bucket || 'secure_docs');
  const originalPath = String(document.file_path || document.storage_path || document.path || '');
  const sourcePath = String(metadata.signed_file_path || metadata.signed_storage_path || metadata.signed_path || originalPath);

  if (!sourcePath) {
    return NextResponse.json({ error: 'The uploaded PDF file could not be located.' }, { status: 404 });
  }

  const { data: originalFile, error: downloadError } = await supabaseAdmin.storage.from(bucket).download(sourcePath);
  if (downloadError || !originalFile) {
    return NextResponse.json({ error: `Unable to read the uploaded PDF: ${downloadError?.message || 'file unavailable'}` }, { status: 500 });
  }

  const now = new Date().toISOString();
  const sourceBytes = await originalFile.arrayBuffer();
  const preSignHash = sha256Hex(sourceBytes);
  const { data: otherSigningRequests } = await supabaseAdmin
    .from('signing_requests')
    .select('status')
    .eq('document_id', signingRequest.document_id)
    .neq('id', signingRequest.id);
  const allSignersCompleted = (otherSigningRequests ?? []).every((signingRequestRow) => signingRequestRow.status === 'signed');
  const auditToken = allSignersCompleted
    ? String(metadata.audit_token || `av_${randomBytes(32).toString('base64url')}`)
    : '';
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || new URL(request.url).origin;
  const auditUrl = auditToken ? `${baseUrl}/verify/${encodeURIComponent(auditToken)}` : '';
  let signedPdf;
  try {
    const verificationQrDataUrl = auditUrl
      ? await QRCode.toDataURL(auditUrl, { errorCorrectionLevel: 'M', margin: 1, width: 240 })
      : '';
    const signingResult = await addElectronicSignature(sourceBytes, {
      signerName: signatureName,
      signerEmail: providedEmail,
      signedAt: now,
      requestId: signingRequest.id,
      signatureDataUrl,
      previousDocumentHash: preSignHash,
      signaturePageIndex: metadata.signature_page_index,
      signatureCount: existingHashChain.length,
      verificationQrDataUrl,
    });
    signedPdf = signingResult.pdfBytes;
    metadata.signature_page_index = signingResult.signaturePageIndex;
  } catch (error) {
    return NextResponse.json({ error: `Unable to apply the signature to this PDF: ${error instanceof Error ? error.message : 'invalid PDF'}` }, { status: 400 });
  }

  const postSignHash = sha256Hex(signedPdf);
  const signedPath = `signed/${document.id}/${signingRequest.signing_order}-${signingRequest.id}-signed.pdf`;
  const { error: uploadError } = await supabaseAdmin.storage.from(bucket).upload(
    signedPath,
    new Blob([signedPdf], { type: 'application/pdf' }),
    { contentType: 'application/pdf', upsert: true }
  );

  if (uploadError) {
    return NextResponse.json({ error: `Unable to save signed PDF: ${uploadError.message}` }, { status: 500 });
  }

  let { error: signError } = await supabaseAdmin
    .from('signing_requests')
    .update({
      status: 'signed',
      signed_at: now,
      pre_sign_hash: preSignHash,
      post_sign_hash: postSignHash,
      signed_file_path: signedPath,
    })
    .eq('id', signingRequest.id);

  if (signError?.message?.includes("'post_sign_hash' column")) {
    ({ error: signError } = await supabaseAdmin
      .from('signing_requests')
      .update({ status: 'signed', signed_at: now })
      .eq('id', signingRequest.id));
  }

  if (signError) {
    return NextResponse.json({ error: signError.message }, { status: 400 });
  }

  const { data: doc } = await supabaseAdmin.from('documents').select('document_history,metadata').eq('id', signingRequest.document_id).single();
  const history = Array.isArray(doc?.document_history) ? doc.document_history : [];
  history.push({
    event: 'signing_completed',
    signing_request_id: signingRequest.id,
    signer_email: providedEmail,
    signer_name: signatureName,
    signed_file_path: signedPath,
    at: now,
  });

  const currentMetadata = doc?.metadata && typeof doc.metadata === 'object' && !Array.isArray(doc.metadata) ? doc.metadata : {};
  const hashChain = Array.isArray(currentMetadata.hash_chain) ? currentMetadata.hash_chain : [];
  const chainEntry = {
    signing_request_id: signingRequest.id,
    signing_order: signingRequest.signing_order,
    signer_name: signatureName,
    signer_email: providedEmail,
    pre_sign_hash: preSignHash,
    post_sign_hash: postSignHash,
    signed_file_path: signedPath,
    signed_at: now,
  };
  hashChain.push(chainEntry);
  const { error: documentUpdateError } = await supabaseAdmin
    .from('documents')
    .update({
      status: allSignersCompleted ? 'Signed' : 'Pending',
      document_history: history,
      metadata: {
        ...currentMetadata,
        signed_bucket: bucket,
        signed_file_path: signedPath,
        signed_at: now,
        signature_name: signatureName,
        signature_email: providedEmail,
        pre_sign_hash: preSignHash,
        post_sign_hash: postSignHash,
        hash_chain: hashChain,
        signature_page_index: metadata.signature_page_index,
        ...(auditToken ? { audit_token: auditToken, audit_url: auditUrl } : {}),
      },
    })
    .eq('id', signingRequest.document_id);

  if (documentUpdateError) {
    return NextResponse.json({ error: `Signed PDF was saved but document metadata could not be updated: ${documentUpdateError.message}` }, { status: 500 });
  }

  await logSigningAuditEvent({
    signingRequestId: signingRequest.id,
    documentId: signingRequest.document_id,
    eventType: 'signing_completed',
    actorType: 'external_signer',
    actorEmail: providedEmail,
    details: { ...chainEntry },
  });

  const { data: nextSigner } = await supabaseAdmin
    .from('signing_requests')
    .select('id,signer_name,signer_email,signing_order')
    .eq('document_id', signingRequest.document_id)
    .in('status', ['pending', 'viewed'])
    .gt('signing_order', signingRequest.signing_order)
    .order('signing_order', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (nextSigner) {
    const nextToken = generateSigningToken();
    const { error: tokenError } = await supabaseAdmin
      .from('signing_requests')
      .update({ token_hash: hashSigningToken(nextToken), status: 'pending', viewed_at: null })
      .eq('id', nextSigner.id);

    if (!tokenError) {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || new URL(request.url).origin;
      const invitation = await sendSigningInvitationEmail({
        to: nextSigner.signer_email,
        signerName: nextSigner.signer_name,
        documentName: 'Document',
        signingLink: `${baseUrl}/sign/${encodeURIComponent(nextToken)}`,
      });
      await logSigningAuditEvent({
        signingRequestId: nextSigner.id,
        documentId: signingRequest.document_id,
        eventType: 'invitation_sent',
        actorType: 'system',
        actorEmail: nextSigner.signer_email,
        details: {
          signer_email: nextSigner.signer_email,
          signing_order: nextSigner.signing_order,
          email_status: invitation.ok ? 'sent' : 'failed',
          email_message: invitation.reason ?? 'sent',
        },
      });
    }
  }

  const { data: signedUrl } = await supabaseAdmin.storage.from(bucket).createSignedUrl(signedPath, 5 * 60);
  return NextResponse.json({ success: true, signedUrl: signedUrl?.signedUrl || null });
}
