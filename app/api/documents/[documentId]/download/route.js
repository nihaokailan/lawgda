import { createSupabaseServerClient } from '../../../../../lib/supabase/server';
import { getSupabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  const supabase = createSupabaseServerClient();
  const supabaseAdmin = getSupabaseAdmin();

  // Get current user
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const documentId = params.documentId;

  // Fetch document
  const { data: document, error: docError } = await supabase
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single();

  if (docError || !document) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  // Check permissions
  const ownerId = document.owner_id ?? document.user_id;
  const uploaderId = document.uploaded_by ?? null;
  let hasPermission = ownerId === session.user.id || uploaderId === session.user.id;

  if (!hasPermission) {
    const { data: permission } = await supabase
      .from('document_permissions')
      .select('id')
      .eq('document_id', documentId)
      .eq('user_id', session.user.id)
      .maybeSingle();
    hasPermission = Boolean(permission);
  }

  if (!hasPermission) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  // Get signed URL for download
  const filePath = String(document.file_path || document.storage_path || document.path || '');
  const bucket = String(document.bucket || 'secure_docs');

  const { data: signedUrl, error: urlError } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(filePath, 60 * 60); // 1 hour expiry

  if (urlError || !signedUrl) {
    return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 500 });
  }

  return NextResponse.json({
    downloadUrl: signedUrl.signedUrl,
    fileName: String(document.title || 'document').replace(/[^a-z0-9-]/gi, '_').toLowerCase() + '.pdf',
    sha256Hash: document.sha256_hash,
  });
}
