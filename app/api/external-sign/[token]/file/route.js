import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { hashSigningToken } from '../../../../../lib/signingTokens';
import { resolveSigningRequestByToken } from '../../../../../lib/signingValidation';
import { logDocumentAuditEventOnce } from '../../../../../lib/auditLog';
import { hasVerifiedSignerSession } from '../../../../../lib/signerVerification';

export const dynamic = 'force-dynamic';

// The signed copy stays retrievable through the signing link for a day after
// signing; afterwards the signer asks the document owner for a fresh copy.
const SIGNED_COPY_WINDOW_MS = 24 * 60 * 60 * 1000;

function metadataOf(document) {
  return document?.metadata && typeof document.metadata === 'object' && !Array.isArray(document.metadata) ? document.metadata : {};
}

/**
 * The only way a signer (internal or external) receives a document file.
 * Raw Storage URLs are never handed out, so every delivery to a signer's
 * device is recorded in the document's hash-chained audit trail:
 *   ?version=review          the current document, before signing (verified signers only)
 *   ?version=signed          the signer's own signed copy, after signing
 */
export async function GET(request, { params }) {
  const supabaseAdmin = getSupabaseAdmin();
  const token = String(params?.token || '');
  const url = new URL(request.url);
  const version = url.searchParams.get('version') === 'signed' ? 'signed' : 'review';

  let signingRequest;
  let bucket;
  let filePath;
  let context;

  if (version === 'review') {
    const { request: pending, reason } = await resolveSigningRequestByToken(token);
    if (!pending || reason || !(await hasVerifiedSignerSession(supabaseAdmin, request, pending.id))) {
      return NextResponse.json({ error: 'This document is not available.' }, { status: 403 });
    }
    signingRequest = pending;
    const { data: document } = await supabaseAdmin
      .from('documents').select('bucket,path,file_path,storage_path,metadata').eq('id', pending.document_id).single();
    const metadata = metadataOf(document);
    bucket = String(metadata.signed_bucket || document?.bucket || 'secure_docs');
    filePath = String(metadata.signed_file_path || metadata.signed_storage_path || metadata.signed_path || document?.file_path || document?.storage_path || document?.path || '');
    context = 'signer_review';
  } else {
    const { data: signed } = await supabaseAdmin
      .from('signing_requests')
      .select('id,document_id,internal_signer_id,signer_name,signer_email,status,signed_at,signed_file_path')
      .eq('token_hash', hashSigningToken(token))
      .maybeSingle();
    const signedRecently = signed?.signed_at && Date.now() - new Date(signed.signed_at).getTime() < SIGNED_COPY_WINDOW_MS;
    if (!signed || signed.status !== 'signed' || !signedRecently || !signed.signed_file_path) {
      return NextResponse.json({ error: 'This signed copy is no longer available from the signing link. Ask the document owner for a copy.' }, { status: 403 });
    }
    signingRequest = signed;
    const { data: document } = await supabaseAdmin.from('documents').select('bucket,metadata').eq('id', signed.document_id).single();
    bucket = String(metadataOf(document).signed_bucket || document?.bucket || 'secure_docs');
    filePath = signed.signed_file_path;
    context = 'signer_copy';
  }

  if (!filePath) {
    return NextResponse.json({ error: 'The document file could not be located.' }, { status: 404 });
  }

  try {
    await logDocumentAuditEventOnce({
      documentId: signingRequest.document_id,
      actorUserId: signingRequest.internal_signer_id ?? null,
      eventType: version === 'signed' ? 'document_downloaded' : 'document_viewed',
      details: {
        context,
        version: version === 'signed' ? 'signed' : 'current',
        signer_name: signingRequest.signer_name,
        signer_email: signingRequest.signer_email,
        signing_request_id: signingRequest.id,
      },
      match: { context, signing_request_id: signingRequest.id },
    });
  } catch (failure) {
    // Same rule as the main download route: no audit record, no file.
    console.error('[audit] Unable to record signer file delivery:', failure);
    return NextResponse.json({ error: 'Unable to record this access in the audit trail. Please try again.' }, { status: 503 });
  }

  const { data: file, error } = await supabaseAdmin.storage.from(bucket).download(filePath);
  if (error || !file) {
    return NextResponse.json({ error: 'Unable to read the document file.' }, { status: 502 });
  }

  return new NextResponse(file, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
