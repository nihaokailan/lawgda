import WorkspaceShell from '../../components/WorkspaceShell';
import { requireAuthProfile } from '../../../lib/authGuard';
import { ROLE_LABELS } from '../../../lib/roles';
import { createSupabaseServerClient } from '../../../lib/supabase/server';
import CaseDetailClient from './CaseDetailClient';

type RawDocument = {
  id: string;
  case_id: string;
  owner_id: string | null;
  user_id: string | null;
  uploaded_by: string | null;
  title: string | null;
  name: string | null;
  filename: string | null;
  file_path: string | null;
  path: string | null;
  sha256_hash: string | null;
  status: string | null;
  created_at: string | null;
};

function normalizeStatus(status: string | null): 'Drafting' | 'Pending' | 'Signed' | 'Filed' {
  if (!status) return 'Drafting';
  const value = status.toLowerCase();
  if (value.includes('pending')) return 'Pending';
  if (value.includes('sign')) return 'Signed';
  if (value.includes('file')) return 'Filed';
  return 'Drafting';
}

async function insertViewLogs(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  userId: string,
  caseId: string,
  documentIds: string[]
) {
  if (documentIds.length === 0) return;

  const payload = documentIds.map((documentId) => ({
    document_id: documentId,
    actor_user_id: userId,
    event_type: 'document_viewed',
    details: {
      action: 'Document Opened/Viewed',
      context: 'case_detail_page',
      case_id: caseId,
    },
  }));

  await supabase.from('audit_logs').insert(payload);
}

export default async function CaseDetailPage({ params }: { params: { caseId: string } }) {
  const { user, profile } = await requireAuthProfile('/signin');
  const supabase = createSupabaseServerClient();
  const caseId = params.caseId;

  const [{ data: caseRow }, { data: docsData }] = await Promise.all([
    supabase.from('cases').select('id,title,owner_id,user_id,created_at').eq('id', caseId).maybeSingle(),
    supabase
      .from('documents')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false }),
  ]);

  const documents = (docsData ?? []) as RawDocument[];

  const ownerId = (caseRow?.owner_id ?? caseRow?.user_id ?? null) as string | null;
  const isOwner = ownerId === user.id;

  const docIds = documents.map((document) => document.id);
  let signerPermissions = new Set<string>();

  if (!isOwner && docIds.length > 0) {
    const { data: perms } = await supabase
      .from('document_permissions')
      .select('document_id')
      .eq('user_id', user.id)
      .in('document_id', docIds);

    signerPermissions = new Set((perms ?? []).map((row) => row.document_id));
  }

  const visibleDocuments = documents
    .filter((document) => {
      const documentOwner = document.owner_id ?? document.user_id;
      const uploaderId = document.uploaded_by ?? null;
      if (documentOwner === user.id) {
        return true;
      }
      if (uploaderId === user.id) {
        return true;
      }
      if (isOwner) {
        return true;
      }
      return signerPermissions.has(document.id);
    })
    .map((document) => ({
      id: document.id,
      title: document.title || document.name || document.filename || 'Untitled Document',
      filePath: document.file_path || document.path || '-',
      sha256Hash: document.sha256_hash,
      status: normalizeStatus(document.status),
      createdAt: document.created_at || new Date().toISOString(),
      ownerId: (document.owner_id || document.user_id || '') as string,
    }));

  if (!isOwner) {
    const viewedDocIds = visibleDocuments
      .map((document) => document.id)
      .filter((id) => id);
    await insertViewLogs(supabase, user.id, caseId, viewedDocIds);
  }

  const caseTitle = (caseRow?.title as string | undefined) || 'Shared Case';

  return (
    <WorkspaceShell
      profile={profile}
      title="Case Detail"
      subtitle={`Role: ${ROLE_LABELS[profile.role] ?? profile.role}.`}
    >
      <CaseDetailClient
        caseId={caseId}
        caseTitle={caseTitle}
        isOwner={isOwner}
        documents={visibleDocuments}
      />
    </WorkspaceShell>
  );
}
