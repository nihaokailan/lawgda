import { loadAccessibleDocument } from '../../../../../lib/documentAccess';
import { getSupabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { NextResponse } from 'next/server';
import { getAuthContext, assertCanViewDocumentContent, rbacErrorResponse } from '../../../../../lib/rbacMiddleware';
import { logDocumentAuditEvent } from '../../../../../lib/auditLog';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const supabaseAdmin = getSupabaseAdmin();

  // STRICT DENY: neither admin tier ever receives document payload, and the
  // caller must belong to the document's organization and hold access to it.
  let document;
  let user;
  let profile;
  try {
    ({ user, profile } = await getAuthContext());
    assertCanViewDocumentContent(profile.role);
    document = await loadAccessibleDocument({ user, profile, documentId: params.documentId });
  } catch (error) {
    return rbacErrorResponse(error);
  }

  // Get signed URL for download
  const searchParams = new URL(request.url).searchParams;
  const version = searchParams.get('version');
  const metadata = document.metadata && typeof document.metadata === 'object' && !Array.isArray(document.metadata)
    ? document.metadata
    : {};
  const isSignedVersion = version === 'signed';
  const filePath = isSignedVersion
    ? String(metadata.signed_file_path || metadata.signed_storage_path || metadata.signed_path || '')
    : String(document.file_path || document.storage_path || document.path || '');
  const bucket = String(isSignedVersion ? metadata.signed_bucket || document.bucket : document.bucket || 'secure_docs');

  if (!filePath) {
    return NextResponse.json({ error: isSignedVersion ? 'A signed PDF is not available yet.' : 'The uploaded PDF file could not be located.' }, { status: 404 });
  }

  // Availability check only: no file or URL is released, so nothing is logged.
  if (searchParams.get('check') === '1') {
    return NextResponse.json({ available: true }, { headers: { 'Cache-Control': 'private, no-store' } });
  }

  // Objective 2: every access to the file's content is part of the chain of custody.
  const isInline = searchParams.get('inline') === '1';
  const requestedPurpose = searchParams.get('purpose');
  const purpose = isInline || requestedPurpose === 'preview' ? 'preview' : requestedPurpose === 'verification' ? 'verification' : 'download';
  try {
    await logDocumentAuditEvent({
      documentId: document.id,
      actorUserId: user.id,
      eventType: purpose === 'preview' ? 'document_viewed' : 'document_downloaded',
      details: { context: purpose === 'preview' ? 'pdf_preview' : purpose, version: isSignedVersion ? 'signed' : 'original', role: profile.role },
    });
  } catch (failure) {
    // Fail closed: content is not released if its access cannot be recorded.
    console.error('[audit] Unable to record file access:', failure);
    return NextResponse.json({ error: 'Unable to record this access in the audit trail. Please try again.' }, { status: 503 });
  }

  // A stable, authenticated preview URL reads storage afresh on every open.
  // It never exposes an expiring storage URL to the browser's PDF viewer.
  if (isInline) {
    const { data: file, error: fileError } = await supabaseAdmin.storage.from(bucket).download(filePath);
    if (fileError || !file) {
      return new NextResponse('Unable to open this document. Return to Lawgda and try again.', {
        status: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' },
      });
    }
    return new NextResponse(file, {
      headers: {
        'Content-Type': filePath.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream',
        'Content-Disposition': filePath.toLowerCase().endsWith('.pdf') ? 'inline' : 'attachment',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  const { data: signedUrl, error: urlError } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(filePath, 60 * 60); // 1 hour expiry

  if (urlError || !signedUrl) {
    return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 500 });
  }

  return NextResponse.json({
    downloadUrl: signedUrl.signedUrl,
    fileName: `${String(document.title || 'document').replace(/[^a-z0-9-]/gi, '_').toLowerCase()}${isSignedVersion ? '-signed' : ''}.pdf`,
    sha256Hash: document.sha256_hash,
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
