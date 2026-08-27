import { notFound, redirect } from 'next/navigation';
import WorkspaceShell from '../../../components/WorkspaceShell';
import { requireAuthProfile } from '../../../../lib/authGuard';
import { createSupabaseServerClient } from '../../../../lib/supabase/server';
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

function parseSignedPreview(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return { signedPath: '', signedBucket: '' };
  }

  const source = metadata as Record<string, unknown>;
  const signedPath = String(
    source.signed_file_path || source.signed_storage_path || source.signed_path || source.final_file_path || ''
  );
  const signedBucket = String(source.signed_bucket || source.final_bucket || '');

  return { signedPath, signedBucket };
}

export default async function DocumentPreparePage({ params }: { params: { documentId: string } }) {
  const { user, profile } = await requireAuthProfile('/signin');
  const supabase = createSupabaseServerClient();
  const documentId = params.documentId;

  const { data: document, error: docError } = await supabase
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single();

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

  const signingRequestsResult = await supabase
    .from('signing_requests')
    .select('id,signer_name,signer_email,signing_order,status,created_at,signed_at,viewed_at')
    .eq('document_id', documentId)
    .order('signing_order', { ascending: true })
    .order('created_at', { ascending: true });

  const signedPreview = parseSignedPreview(document.metadata);

  return (
    <WorkspaceShell
      profile={profile}
      title="Document Preparation"
      subtitle="Set participants and prepare this document for signing workflow."
    >
      <PrepareDocumentClient
        document={{
          id: String(document.id),
          title: buildTitle(document),
          bucket: String(document.bucket || 'secure_docs'),
          filePath: String(document.file_path || document.storage_path || document.path || ''),
          signedBucket: signedPreview.signedBucket,
          signedPath: signedPreview.signedPath,
        }}
        me={{
          userId: user.id,
          name: profile.full_name || user.email || 'Me',
          email: user.email || '',
        }}
        initialSigningRequests={signingRequestsResult.data as SigningRequest[] || []}
      />
    </WorkspaceShell>
  );
}