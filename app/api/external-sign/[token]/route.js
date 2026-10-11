import { NextResponse } from 'next/server';
import { resolveSigningRequestByToken } from '../../../../lib/signingValidation';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import { logSigningAuditEvent } from '../../../../lib/signingAudit';
import { addElectronicSignature } from '../../../../lib/signedPdf';
import { sha256Hex } from '../../../../lib/documentHash';
import { generateSigningToken, hashSigningToken } from '../../../../lib/signingTokens';
import { transitionDocumentStatus } from '../../../../lib/documentLifecycle';
import { ensureUserSigningKey } from '../../../../lib/userSigningKeys';
import { ensureExternalSignerKey } from '../../../../lib/externalSignerKeys';
import { signWithWrappedKey, signRsaDigestWithWrappedKey, wrapPrivateKey, RSA_SIGNATURE_SCHEME } from '../../../../lib/keyWrapping';
import { VaultError } from '../../../../lib/vault';
import { extractKeyAndCertFromP12 } from '../../../../lib/pkcs12';
import { sendSigningInvitationEmail } from '../../../../lib/email';
import { getPublicSiteUrl } from '../../../../lib/siteUrl';
import { randomBytes } from 'node:crypto';
import QRCode from 'qrcode';

function buildError(reason) {
  const messages = {
    invalid_token: 'This signing link is invalid.',
    expired: 'This signing link has expired.',
    revoked: 'This signing request was revoked.',
    already_completed: 'This signing request has already been completed.',
    staff_not_allowed: 'Staff members are not allowed to sign documents. Ask the sender to assign a different signer.',
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
    const reviewPath = String(metadata.signed_file_path || metadata.signed_storage_path || metadata.signed_path || document.file_path || document.storage_path || document.path || '');
    if (!reviewPath) {
      return NextResponse.json({ error: 'The document file could not be located.' }, { status: 404 });
    }

    // Served through Lawgda (never a raw Storage URL) so the delivery is audited.
    reviewUrl = `/api/external-sign/${encodeURIComponent(token)}/file?version=review&email=${encodeURIComponent(providedEmail)}`;

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
  let signatureName = String(body?.signatureName ?? '').trim();
  const signatureDataUrl = String(body?.signatureDataUrl ?? '').trim();
  const signingMethod = body?.signingMethod === 'dict' ? 'dict' : 'standard';
  const clientDocumentHash = String(body?.documentHash ?? '').trim().toLowerCase();
  const p12Base64 = String(body?.p12Base64 ?? '').trim();
  const p12Passphrase = String(body?.p12Passphrase ?? '');

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

  if (signingMethod !== 'dict' && !signatureName) {
    return NextResponse.json({ error: 'Type your full name to sign the document.' }, { status: 400 });
  }

  if (signingMethod === 'dict') {
    if (!p12Base64 || !p12Passphrase) {
      return NextResponse.json({ error: 'Upload your signing certificate (.p12 or .pfx) and enter its passphrase.' }, { status: 400 });
    }
  } else if (!/^data:image\/png;base64,/.test(signatureDataUrl)) {
    return NextResponse.json({ error: 'Draw or upload your signature before signing the document.' }, { status: 400 });
  }

  if (body?.action === 'preview_certificate') {
    if (signingMethod !== 'dict') {
      return NextResponse.json({ error: 'Choose certificate signing to preview a certificate.' }, { status: 400 });
    }
    let extracted;
    try {
      extracted = extractKeyAndCertFromP12(p12Base64, p12Passphrase);
      return NextResponse.json({ certificate: extracted.details }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      return NextResponse.json({ error: error.message || 'Unable to read certificate.' }, { status: 400 });
    } finally {
      extracted?.privateKeyDer.fill(0);
    }
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

  // Objective 3: the hash must be computed in the signer's browser and must
  // match the stored file before anything is signed.
  if (!/^[0-9a-f]{64}$/.test(clientDocumentHash)) {
    return NextResponse.json({ error: 'The document must be hashed in your browser before signing. Please refresh and try again.' }, { status: 400 });
  }
  if (clientDocumentHash !== preSignHash) {
    console.error('[signing] Browser hash mismatch', { signingRequestId: signingRequest.id, sourcePath, clientDocumentHash, preSignHash, bytes: sourceBytes.byteLength });
    return NextResponse.json({ error: 'The document hash computed in your browser does not match the document on file. Please refresh and try again.' }, { status: 409 });
  }

  let certificateSubjectCn = '';
  let certificateDetails = null;
  let certificateSignature = null;
  let certificatePem = null;
  if (signingMethod === 'dict') {
    let extracted;
    try {
      extracted = extractKeyAndCertFromP12(p12Base64, p12Passphrase);
    } catch (p12Error) {
      return NextResponse.json({ error: p12Error instanceof Error ? p12Error.message : 'Unable to read the uploaded certificate.' }, { status: 400 });
    }
    certificateDetails = extracted.details;
    signatureName = certificateDetails.holderName;
    certificateSubjectCn = signatureName;

    // The certificate's private key goes into the Key Management Server first:
    // Vault wraps it, only the ciphertext is stored, and the signature is made
    // by unwrapping it through Vault — the same custody as standard keys.
    let wrappedCertificateKey;
    try {
      wrappedCertificateKey = await wrapPrivateKey(extracted.privateKeyDer);
    } catch (keyError) {
      console.error('[signing] Unable to wrap certificate key:', keyError);
      return NextResponse.json({ error: 'The signing service is temporarily unavailable. Nothing was signed — please try again shortly.' }, { status: 503 });
    } finally {
      extracted.privateKeyDer.fill(0);
    }

    const { error: certificateStoreError } = await supabaseAdmin
      .from('signing_request_certificates')
      .upsert({
        signing_request_id: signingRequest.id,
        wrapped_private_key: wrappedCertificateKey,
        certificate_pem: extracted.certificatePem,
        subject_cn: certificateSubjectCn,
      }, { onConflict: 'signing_request_id' });
    if (certificateStoreError) {
      return NextResponse.json({ error: `Unable to store the certificate key: ${certificateStoreError.message}` }, { status: 500 });
    }

    try {
      certificateSignature = await signRsaDigestWithWrappedKey(wrappedCertificateKey, Buffer.from(preSignHash, 'hex'));
      certificatePem = extracted.certificatePem;
    } catch (error) {
      console.error('[signing] Unable to sign with certificate key:', error);
      return NextResponse.json(
        error instanceof VaultError
          ? { error: 'The signing service is temporarily unavailable. Nothing was signed — please try again shortly.' }
          : { error: 'Unable to sign with the private key in this certificate.' },
        { status: error instanceof VaultError ? 503 : 400 }
      );
    }
  }

  const { data: otherSigningRequests, error: otherSigningRequestsError } = await supabaseAdmin
    .from('signing_requests')
    .select('status')
    .eq('document_id', signingRequest.document_id)
    .neq('id', signingRequest.id);
  if (otherSigningRequestsError || !otherSigningRequests) {
    return NextResponse.json({ error: 'Unable to verify the remaining signers. Please try again.' }, { status: 500 });
  }
  const allSignersCompleted = otherSigningRequests.every((signingRequestRow) => signingRequestRow.status === 'signed');
  const auditToken = allSignersCompleted
    ? String(metadata.audit_token || `av_${randomBytes(32).toString('base64url')}`)
    : '';
  // Resolved before anything is saved: the QR code and the next signer's
  // invitation must point at the deployed site, never localhost.
  let baseUrl;
  try {
    baseUrl = getPublicSiteUrl(request);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
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
      signatureDataUrl: signingMethod === 'dict' ? '' : signatureDataUrl,
      certificateSubjectCn: signingMethod === 'dict' ? certificateSubjectCn : '',
      certificateDetails,
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
  let cryptographicSignature = null;
  let signingPublicKey = null;
  let signatureCertificatePem = null;
  let signatureCovers = null;
  if (signingMethod === 'dict') {
    cryptographicSignature = certificateSignature;
    signatureCertificatePem = certificatePem;
    signatureCovers = 'pre_sign_hash';
  } else {
    try {
      const userKey = signingRequest.internal_signer_id
        ? await ensureUserSigningKey(supabaseAdmin, signingRequest.internal_signer_id)
        : await ensureExternalSignerKey(supabaseAdmin, providedEmail);
      cryptographicSignature = await signWithWrappedKey(userKey.wrappedPrivateKey, Buffer.from(postSignHash, 'hex'));
      signingPublicKey = userKey.publicKeyPem;
      signatureCovers = 'post_sign_hash';
    } catch (keyError) {
      // Fail closed: a signature without its cryptographic proof must never be
      // recorded. Nothing has been saved yet, so the signer can simply retry.
      console.error('[signing] Unable to apply cryptographic signature:', keyError);
      return NextResponse.json({ error: 'The signing service is temporarily unavailable. Nothing was signed — please try again shortly.' }, { status: 503 });
    }
  }
  // A new object per attempt: overwriting an earlier attempt's file could leave
  // a stale cached copy that no longer matches the recorded post_sign_hash.
  const signedPath = `signed/${document.id}/${signingRequest.signing_order}-${signingRequest.id}-${Date.now()}-signed.pdf`;
  const { error: uploadError } = await supabaseAdmin.storage.from(bucket).upload(
    signedPath,
    new Blob([signedPdf], { type: 'application/pdf' }),
    { contentType: 'application/pdf', upsert: false }
  );

  if (uploadError) {
    return NextResponse.json({ error: `Unable to save signed PDF: ${uploadError.message}` }, { status: 500 });
  }

  let { data: signedRows, error: signError } = await supabaseAdmin
    .from('signing_requests')
    .update({
      status: 'signed',
      signed_at: now,
      pre_sign_hash: preSignHash,
      post_sign_hash: postSignHash,
      signed_file_path: signedPath,
      signing_method: signingMethod,
    })
    .eq('id', signingRequest.id)
    .in('status', ['pending', 'viewed'])
    .select('id');

  // Another submission (email link or in-app) completed this request first.
  if (!signError && (!signedRows || signedRows.length === 0)) {
    return NextResponse.json({ error: buildError('already_completed'), reason: 'already_completed' }, { status: 409 });
  }

  if (signError?.message?.includes("'post_sign_hash' column") || signError?.message?.includes("'signing_method' column")) {
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
    browser_computed_hash: clientDocumentHash,
    post_sign_hash: postSignHash,
    signed_file_path: signedPath,
    signed_at: now,
    signing_method: signingMethod,
    cryptographic_signature: cryptographicSignature,
    signature_covers: signatureCovers,
    signature_scheme: signingMethod === 'dict' ? RSA_SIGNATURE_SCHEME : 'ed25519',
    signing_public_key: signingPublicKey,
    certificate_pem: signatureCertificatePem,
    certificate_details: certificateDetails,
  };
  hashChain.push(chainEntry);
  const { error: documentUpdateError } = await supabaseAdmin
    .from('documents')
    .update({
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

  const statusTransition = await transitionDocumentStatus({
    documentId: signingRequest.document_id,
    // Completing every signature makes the document Signed; filing it is a separate Lawyer action.
    toStatus: allSignersCompleted ? 'Signed' : 'Pending',
    reason: allSignersCompleted ? 'final_signature_completed' : 'signature_recorded',
    extraDetails: { signing_request_id: signingRequest.id, signer_email: providedEmail },
  });

  await logSigningAuditEvent({
    signingRequestId: signingRequest.id,
    documentId: signingRequest.document_id,
    eventType: 'signing_completed',
    actorType: 'external_signer',
    actorEmail: providedEmail,
    details: { ...chainEntry },
  });

  if (allSignersCompleted && !statusTransition.transitioned && !['Signed', 'Filed'].includes(statusTransition.fromStatus)) {
    console.error('[signing] Unable to mark completed document as Signed:', statusTransition.error);
    return NextResponse.json({ error: 'Your signature and signed PDF were saved, but the document could not be marked Signed. Please contact the document owner.' }, { status: 500 });
  }

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

  // The signer's copy is delivered through Lawgda so the delivery is audited.
  return NextResponse.json({ success: true, signedUrl: `/api/external-sign/${encodeURIComponent(token)}/file?version=signed` });
}
