import { notFound, redirect } from 'next/navigation';
import WorkspaceShell from '../../../components/WorkspaceShell';
import { requireDocumentAccess } from '../../../../lib/authGuard';
import { createSupabaseServerClient } from '../../../../lib/supabase/server';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import PrepareDocumentClient from './PrepareDocumentClient';

type SigningRequest = {
  id: string;
  signer_name: string;
  signer_email: string;
  signing_order: number;
  status: string;
  created_at: string;
  signed_at: string | null;
  viewed_at: string | null;
};

function buildTitle(record: Record<string, unknown>) {
  return String(record.title || record.name || record.filename || 'Untitled Document');
}

export default async function DocumentPreparePage({ params }: { params: { documentId: string } }) {
  const { user, profile } = await requireDocumentAccess();
  const supabase = createSupabaseServerClient();
  const documentId = params.documentId;

  let { data: document, error: docError } = await supabase
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single();

  if (docError || !document) {
    const admin = getSupabaseAdmin();
    const adminResult = await admin.from('documents').select('*').eq('id', documentId).maybeSingle();
    document = adminResult.data;
    docError = adminResult.error;
  }

  if (docError || !document) {
    notFound();
  }

  const ownerId = document.owner_id ?? document.user_id;
  const uploaderId = document.uploaded_by ?? null;
  let hasPermission = ownerId === user.id || uploaderId === user.id;

  if (!hasPermission) {
    const { data: permission } = await supabase
      .from('document_permissions')
      .select('id')
      .eq('document_id', documentId)
      .eq('user_id', user.id)
      .maybeSingle();
    hasPermission = Boolean(permission);
  }

  if (!hasPermission) {
    redirect('/dashboard');
  }

  if (['pending', 'signed', 'filed'].includes(String(document.status || '').toLowerCase())) {
    redirect(`/documents/${documentId}`);
  }

  const signingRequestsResult = await supabase
    .from('signing_requests')
    .select('id,signer_name,signer_email,signing_order,status,created_at,signed_at,viewed_at')
    .eq('document_id', documentId)
    .order('signing_order', { ascending: true })
    .order('created_at', { ascending: true });

  return (
    <WorkspaceShell
      profile={profile}
      title="Sign Document"
      subtitle="Review the document and set the signing workflow."
    >
      <PrepareDocumentClient
        document={{
          id: String(document.id),
          title: buildTitle(document),
          bucket: String(document.bucket || 'secure_docs'),
          filePath: String(document.file_path || document.storage_path || document.path || ''),
        }}
        me={{
          userId: user.id,
          name: profile.full_name || user.email || 'Me',
          email: user.email || '',
          role: profile.role,
        }}
        initialSigningRequests={signingRequestsResult.data as SigningRequest[] || []}
      />
    </WorkspaceShell>
  );
}