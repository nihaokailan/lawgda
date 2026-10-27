import WorkspaceShell from '../../components/WorkspaceShell';
import { requireDocumentAccess } from '../../../lib/authGuard';
import CaseDetailClient from './CaseDetailClient';
import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { enrichAuditEntries } from '../../../lib/auditPresentation';
import RealtimeRefresh from '../../components/RealtimeRefresh';
import { notFound } from 'next/navigation';
import { canManageCase } from '../../../lib/caseFolders';
import { isFirmLawyerDocumentForStaff } from '../../../lib/documentAccess';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RawDocument = {
  id: string;
  case_id: string;
  org_id: string | null;
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

  // Written with the service role: browser sessions cannot write audit rows (migration 021).
  await getSupabaseAdmin().from('audit_logs').insert(payload);
}

export default async function CaseDetailPage({ params }: { params: { caseId: string } }) {
  const { user, profile } = await requireDocumentAccess();
  const admin = getSupabaseAdmin();
  const caseId = params.caseId;
  if (!UUID.test(caseId)) {
    notFound();
  }

  // Read with the service role and checked here (browser-session reads of
  // documents hit a recursive RLS policy): firm Lawyers/Staff manage the
  // folder; anyone else needs access to at least one document in it.
  const { data: caseRow } = await admin
    .from('cases')
    .select('id,title,case_number,org_id,owner_id,created_at')
    .eq('id', caseId)
    .maybeSingle();
  if (!caseRow || (caseRow.org_id && caseRow.org_id !== profile.org_id)) {
    notFound();
  }

  const canManage = canManageCase(profile, caseRow);
  const { data: docsData } = await admin
    .from('documents')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: false });

  const documents = (docsData ?? []) as RawDocument[];
  const isOwner = caseRow.owner_id === user.id || canManage;

  const docIds = documents.map((document) => document.id);
  let signerPermissions = new Set<string>();

  if (docIds.length > 0) {
    const { data: perms } = await admin
      .from('document_permissions')
      .select('document_id')
      .eq('user_id', user.id)
      .in('document_id', docIds);

    signerPermissions = new Set((perms ?? []).map((row) => row.document_id));
  }

  // Staff may open documents owned by a Lawyer of their firm.
  const firmLawyerIds = new Set<string>();
  if (profile.role === 'staff' && profile.org_id) {
    const { data: lawyers } = await admin.from('profiles').select('user_id').eq('org_id', profile.org_id).eq('role', 'lawyer');
    (lawyers ?? []).forEach((row) => firmLawyerIds.add(row.user_id));
  }
  const ownedByFirmLawyer = (document: { owner_id?: string | null; user_id?: string | null; org_id?: string | null }) => {
    const ownerId = document.owner_id ?? document.user_id ?? null;
    return Boolean(ownerId && firmLawyerIds.has(ownerId))
      && isFirmLawyerDocumentForStaff(profile, document, { role: 'lawyer', org_id: profile.org_id });
  };

  // Same rule as the document page (lib/documentAccess.js): owner, uploader,
  // Staff of the owning Lawyer's firm, or an explicit grant.
  const canOpen = (document: RawDocument) => (document.owner_id ?? document.user_id) === user.id
    || document.uploaded_by === user.id
    || ownedByFirmLawyer(document)
    || signerPermissions.has(document.id);

  if (!isOwner && !documents.some(canOpen)) {
    notFound();
  }

  // Folder managers see every document in the folder (like the firm's
  // Documents list); others see only the ones they can open.
  const visibleDocuments = documents
    .filter((document) => canManage || canOpen(document))
    .map((document) => ({
      id: document.id,
      title: document.title || document.name || document.filename || 'Untitled Document',
      filePath: document.file_path || document.path || '-',
      sha256Hash: document.sha256_hash,
      status: normalizeStatus(document.status),
      createdAt: document.created_at || new Date().toISOString(),
      ownerId: (document.owner_id || document.user_id || '') as string,
      canOpen: canOpen(document),
    }));

  // Access to each document was checked above, so the case-wide activity feed
  // is read with the service role and limited to those visible documents.
  const titleById = new Map(visibleDocuments.map((document) => [document.id, document.title]));
  let activity: Awaited<ReturnType<typeof enrichAuditEntries>> = [];
  if (titleById.size > 0) {
    const { data: auditRows } = await admin
      .from('audit_logs')
      .select('id,document_id,actor_user_id,event_type,details,created_at')
      .in('document_id', [...titleById.keys()])
      .order('created_at', { ascending: false })
      .limit(30);
    activity = (await enrichAuditEntries(admin, auditRows ?? [])).map((entry, index) => ({
      ...entry,
      lines: [`Document: ${titleById.get(String(auditRows?.[index]?.document_id)) ?? 'Unknown'}`, ...entry.lines],
    }));
  }

  if (!isOwner) {
    const viewedDocIds = visibleDocuments
      .map((document) => document.id)
      .filter((id) => id);
    await insertViewLogs(user.id, caseId, viewedDocIds);
  }

  const caseTitle = (caseRow.title as string | undefined) || 'Untitled case';

  // Documents this user could add: same firm, not in any case, not Filed, and
  // ones they own, uploaded or were granted (the same rule the add route checks).
  let addableDocuments: Array<{ id: string; title: string; status: string; caseNumber: string | null }> = [];
  if (canManage) {
    const { data: candidates } = await admin
      .from('documents')
      .select('id,title,name,filename,status,case_number,owner_id,user_id,uploaded_by,created_at')
      .eq('org_id', profile.org_id)
      .is('case_id', null)
      .or('status.is.null,status.neq.Filed')
      .order('created_at', { ascending: false })
      .limit(200);
    const rows = candidates ?? [];
    const { data: grants } = rows.length
      ? await admin.from('document_permissions').select('document_id').eq('user_id', user.id).in('document_id', rows.map((row) => row.id))
      : { data: [] };
    const granted = new Set((grants ?? []).map((grant) => grant.document_id));
    addableDocuments = rows
      .filter((row) => (row.owner_id ?? row.user_id) === user.id || row.uploaded_by === user.id || ownedByFirmLawyer({ ...row, org_id: profile.org_id }) || granted.has(row.id))
      .map((row) => ({
        id: row.id,
        title: row.title || row.name || row.filename || 'Untitled Document',
        status: normalizeStatus(row.status),
        caseNumber: row.case_number ?? null,
      }));
  }

  return (
    <WorkspaceShell
      profile={profile}
      title="Documents"
      subtitle="Case folder"
      backHref="/cases"
      backLabel="Back to Documents"
    >
      <RealtimeRefresh filter={`case_id=eq.${caseId}`} />
      <CaseDetailClient
        caseId={caseId}
        caseTitle={caseTitle}
        caseNumber={(caseRow.case_number as string | null) ?? null}
        canManage={canManage}
        addableDocuments={addableDocuments}
        documents={visibleDocuments}
        activity={activity}
      />
    </WorkspaceShell>
  );
}
