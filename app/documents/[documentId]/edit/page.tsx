import { notFound, redirect } from 'next/navigation';
import WorkspaceShell from '../../../components/WorkspaceShell';
import { requireAuthProfile } from '../../../../lib/authGuard';
import { createSupabaseServerClient } from '../../../../lib/supabase/server';
import DocumentEditClient from './DocumentEditClient';

type AuditEntry = {
  id: string;
  event_type: string;
  created_at: string;
  actor_user_id: string | null;
  details: Record<string, unknown> | null;
};

function buildTitle(record: Record<string, unknown>) {
  return String(record.title || record.name || record.filename || 'Untitled Document');
}

function normalizeStatus(value: unknown) {
  const status = String(value || '').toLowerCase();
  if (status.includes('pending')) return 'Pending';
  if (status.includes('sign')) return 'Signed';
  if (status.includes('file')) return 'Filed';
  return 'Drafting';
}

export default async function DocumentEditPage({ params }: { params: { documentId: string } }) {
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

  if (['signed', 'filed'].includes(String(document.status || '').toLowerCase())) {
    redirect(`/documents/${documentId}`);
  }

  const [signingRequestsResult, signingAuditResult, auditResult] = await Promise.all([
    supabase
      .from('signing_requests')
      .select('id,signer_name,signer_email,signing_order,status,created_at,signed_at,viewed_at')
      .eq('document_id', documentId)
      .order('signing_order', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('signing_audit_events')
      .select('id,event_type,created_at,actor_user_id,details')
      .eq('document_id', documentId)
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('audit_logs')
      .select('id,event_type,created_at,actor_user_id,details')
      .eq('document_id', documentId)
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  const auditTrail: AuditEntry[] = [
    ...((signingAuditResult.data || []) as AuditEntry[]),
    ...((auditResult.data || []) as AuditEntry[]),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const filePath = String(document.file_path || document.storage_path || document.path || '');
  const bucket = String(document.bucket || 'secure_docs');

  return (
    <WorkspaceShell
      profile={profile}
      title="Document Edit Workspace"
      subtitle="Configure signer flow and evidence outputs."
    >
      <DocumentEditClient
        document={{
          id: String(document.id),
          title: buildTitle(document),
          status: normalizeStatus(document.status),
          filePath,
          bucket,
          sha256Hash: document.sha256_hash ? String(document.sha256_hash) : null,
          isOwner: ownerId === user.id,
          metadata: document.metadata && typeof document.metadata === 'object' ? document.metadata : null,
        }}
        signingRequests={signingRequestsResult.data || []}
        auditTrail={auditTrail}
      />
    </WorkspaceShell>
  );
}
