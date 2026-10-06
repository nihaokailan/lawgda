import { loadAccessibleDocument } from '../../../../../lib/documentAccess';
import { getSupabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { NextResponse } from 'next/server';
import { getAuthContext, assertCanViewDocumentContent, rbacErrorResponse } from '../../../../../lib/rbacMiddleware';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const supabaseAdmin = getSupabaseAdmin();

  // STRICT DENY: neither admin tier ever receives document payload, and the
  // caller must belong to the document's organization and hold access to it.
  let document;
  try {
    const { user, profile } = await getAuthContext();
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

  // A stable, authenticated preview URL reads storage afresh on every open.
  // It never exposes an expiring storage URL to the browser's PDF viewer.
  if (searchParams.get('inline') === '1') {
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
