import WorkspaceShell from '../components/WorkspaceShell';
import DocumentsWorkspaceClient from './DocumentsWorkspaceClient';
import RealtimeRefresh from '../components/RealtimeRefresh';
import { loadDocumentsSharedWithUser } from '../../lib/sharedDocuments';
import { loadMySigningTurns } from '../../lib/signingTurn';
import { requireDocumentAccess } from '../../lib/authGuard';
import { createSupabaseServerClient } from '../../lib/supabase/server';
import { getSupabaseAdmin } from '../../lib/supabaseAdmin';
import { CASE_MANAGER_ROLES } from '../../lib/caseFolders';

export const revalidate = 0; // Always fetch fresh data, no caching

function getTitle(record) {
  const metadataTitle = record.metadata && typeof record.metadata === 'object' ? record.metadata.title : null;
  const rawTitle = record.title || record.name || metadataTitle || record.filename || record.file_path || record.storage_path || record.path;
  return rawTitle || 'Untitled document';
}

function normalizeStatus(value) {
  const status = String(value || '').toLowerCase();
  if (status.includes('draft')) return 'Drafts';
  if (status.includes('pending')) return 'Pending';
  if (status.includes('file')) return 'Filed';
  if (status.includes('signed')) return 'Signed';
  return 'Drafts';
}

function buildOwnerLabel(record, meUserId) {
  const ownerId = record.owner_id ?? record.user_id ?? null;
  const uploaderId = record.uploaded_by ?? record.user_id ?? null;
  return ownerId === meUserId || uploaderId === meUserId ? 'You' : 'Shared';
}

async function loadDocumentsForCasesPage(supabase) {
  const selectVariants = [
    '*',
    'id,title,name,filename,file_path,path,storage_path,status,created_at,owner_id,user_id,uploaded_by,org_id,sha256_hash',
    'id,title,name,filename,file_path,path,storage_path,status,created_at,owner_id,user_id,uploaded_by,case_id,org_id,sha256_hash',
    'id,title,name,status,created_at,owner_id,user_id,uploaded_by,org_id,sha256_hash',
    'id,title,name,status,created_at,org_id,uploaded_by,sha256_hash',
    'id,title,name,mime_type,size_bytes,bucket,storage_path,created_at,org_id,uploaded_by,user_id,owner_id,case_id',
    'id,title,name,filename,status,created_at,user_id,case_id,sha256_hash,file_path,path,storage_path',
    'id,filename,name,path,storage_path,file_path,status,created_at,user_id,case_id',
    'id,filename,name,path,storage_path,file_path,status,created_at,user_id,owner_id,uploaded_by',
  ];

  for (const fields of selectVariants) {
    const result = await supabase
      .from('documents')
      .select(fields)
      .order('created_at', { ascending: false })
      .limit(200);

    if (!result.error) {
      return result.data || [];
    }

    if (!/Could not find the '([^']+)' column/i.test(result.error.message || '')) {
      return [];
    }
  }

  return [];
}

async function loadAdminDocumentFallback(userId) {
  const admin = getSupabaseAdmin();
  const { data } = await admin.from('documents').select('*').order('created_at', { ascending: false }).limit(500);
  return (data ?? []).filter((record) => (
    record.owner_id === userId || record.user_id === userId || record.uploaded_by === userId
  ));
}

// Staff support their firm's Lawyers, so they also see documents owned by a
// Lawyer of their firm (the same rule lib/documentAccess.js enforces).
async function loadFirmLawyerDocuments(orgId) {
  const admin = getSupabaseAdmin();
  const { data: lawyers } = await admin.from('profiles').select('user_id').eq('org_id', orgId).eq('role', 'lawyer');
  const lawyerIds = (lawyers ?? []).map((row) => row.user_id);
  if (lawyerIds.length === 0) return [];
  const { data } = await admin
    .from('documents')
    .select('*')
    .eq('org_id', orgId)
    .in('owner_id', lawyerIds)
    .order('created_at', { ascending: false })
    .limit(500);
  return data ?? [];
}

// Case folders of the user's firm, shown alongside documents like folders in a drive.
async function loadFirmFolders(orgId) {
  const { data } = await getSupabaseAdmin()
    .from('cases')
    .select('id,title,case_number,created_at,documents(count)')
    .eq('org_id', orgId)
    .order('title', { ascending: true })
    .limit(500);
  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title || 'Untitled folder',
    caseNumber: row.case_number ?? null,
    documentCount: Array.isArray(row.documents) ? Number(row.documents[0]?.count ?? 0) : 0,
    createdAt: row.created_at,
  }));
}

function getInitials(label) {
  const source = String(label || 'U').trim();
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  if (!parts.length) return 'U';
  return parts.slice(0, 2).map((part) => part[0].toUpperCase()).join('');
}

export default async function CasesPage() {
  const { user, profile } = await requireDocumentAccess('/admin/repository');
  const supabase = createSupabaseServerClient();

  // Independent loads, run concurrently. Stored files without a document row
  // are given one by the dashboard's backfill, so Storage isn't listed here.
  const canUseFolders = CASE_MANAGER_ROLES.includes(profile.role) && Boolean(profile.org_id);
  let [rawDocs, sharedDocs, folderRows, firmLawyerDocs] = await Promise.all([
    loadDocumentsForCasesPage(supabase),
    loadDocumentsSharedWithUser(getSupabaseAdmin(), user.id, profile.org_id),
    canUseFolders ? loadFirmFolders(profile.org_id) : [],
    profile.role === 'staff' && profile.org_id ? loadFirmLawyerDocuments(profile.org_id) : [],
  ]);
  if (!rawDocs.length) {
    rawDocs = await loadAdminDocumentFallback(user.id);
  }
  const allDocs = [...rawDocs, ...sharedDocs, ...firmLawyerDocs];

  const userOwnedDocs = allDocs.filter((record) => {
    const ownerId = record.owner_id ?? record.user_id ?? null;
    const uploaderId = record.uploaded_by ?? record.user_id ?? null;
    return ownerId === user.id || uploaderId === user.id;
  });

  let permissionDocIds = new Set();
  const docIds = allDocs.map((doc) => doc.id).filter(Boolean);
  if (docIds.length > 0) {
    const permissionResult = await supabase
      .from('document_permissions')
      .select('document_id,role')
      .eq('user_id', user.id)
      .in('document_id', docIds);

    if (!permissionResult.error) {
      permissionDocIds = new Set((permissionResult.data || []).map((row) => row.document_id));
    }
  }

  sharedDocs.forEach((record) => permissionDocIds.add(record.id));

  const folderIds = new Set(folderRows.map((folder) => folder.id));
  const turns = await loadMySigningTurns(getSupabaseAdmin(), user.email, allDocs.map((doc) => doc.id));

  const documents = [...userOwnedDocs, ...allDocs]
    .filter((record, index, array) => array.findIndex((item) => item.id === record.id) === index)
    .filter((record) => {
      const ownerId = record.owner_id ?? record.user_id ?? null;
      const uploaderId = record.uploaded_by ?? record.user_id ?? null;
      const isSameOrg = Boolean(profile.org_id) && Boolean(record.org_id) && profile.org_id === record.org_id;
      const isOwnLegacyRecord = ownerId === user.id || uploaderId === user.id;
      const isOrglessUser = !profile.org_id;

      if (isOrglessUser) {
        return isOwnLegacyRecord || permissionDocIds.has(record.id);
      }

      return isOwnLegacyRecord || isSameOrg || permissionDocIds.has(record.id);
    })
    .map((record) => {
      const ownerLabel = buildOwnerLabel(record, user.id);
      const title = getTitle(record);
      return {
        id: record.id,
        title,
        status: normalizeStatus(record.status),
        createdAt: record.created_at,
        ownerLabel,
        ownerInitials: getInitials(ownerLabel === 'You' ? profile.full_name || user.email || 'You' : ownerLabel),
        caseNumber: record.case_number ?? null,
        tags: Array.isArray(record.tags) ? record.tags : [],
        myAction: turns.get(record.id)?.state ?? null,
        // Only folders this user can open hide their documents from the top level.
        folderId: record.case_id && folderIds.has(record.case_id) ? record.case_id : null,
      };
    })
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());


  return (
    <WorkspaceShell
      profile={profile}
      title="Documents"
      subtitle="Search, open and track your documents."
    >
      <RealtimeRefresh />
      <DocumentsWorkspaceClient documents={documents} folders={folderRows} canCreateFolders={canUseFolders} />
    </WorkspaceShell>
  );
}
