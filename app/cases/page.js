import WorkspaceShell from '../components/WorkspaceShell';
import DocumentsWorkspaceClient from './DocumentsWorkspaceClient';
import { requireAuthProfile } from '../../lib/authGuard';
import { createSupabaseServerClient } from '../../lib/supabase/server';
import { ROLE_LABELS } from '../../lib/roles';

function getTitle(record) {
  return record.title || record.name || record.filename || 'Untitled document';
}

function normalizeStatus(value) {
  const status = String(value || '').toLowerCase();
  if (status.includes('draft')) return 'Drafts';
  if (status.includes('pending')) return 'Pending';
  if (status.includes('signed') || status.includes('file')) return 'Completed';
  if (status.includes('cancel')) return 'Cancelled';
  if (status.includes('deny')) return 'Denied';
  if (status.includes('decline')) return 'Declined';
  return 'Drafts';
}

function buildOwnerLabel(record, meUserId) {
  const ownerId = record.owner_id || record.user_id || null;
  const uploaderId = record.uploaded_by || null;
  return ownerId === meUserId || uploaderId === meUserId ? 'You' : 'Shared';
}

async function loadDocumentsForCasesPage(supabase) {
  const selectVariants = [
    'id,title,name,filename,status,created_at,owner_id,user_id,uploaded_by,org_id,sha256_hash',
    'id,title,name,status,created_at,owner_id,user_id,uploaded_by,org_id,sha256_hash',
    'id,title,name,status,created_at,org_id,uploaded_by,sha256_hash',
    'id,title,name,mime_type,size_bytes,bucket,storage_path,created_at,org_id,uploaded_by',
    'id,title,name,filename,status,created_at,user_id,sha256_hash',
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

function getInitials(label) {
  const source = String(label || 'U').trim();
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  if (!parts.length) return 'U';
  return parts.slice(0, 2).map((part) => part[0].toUpperCase()).join('');
}

export default async function CasesPage() {
  const { user, profile } = await requireAuthProfile('/signin');
  const supabase = createSupabaseServerClient();

  const rawDocs = await loadDocumentsForCasesPage(supabase);

  let permissionDocIds = new Set();
  const docIds = rawDocs.map((doc) => doc.id).filter(Boolean);
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

  const documents = rawDocs
    .filter((record) => {
      const ownerId = record.owner_id || record.user_id || null;
      const uploaderId = record.uploaded_by || null;
      const isSameOrg = Boolean(profile.org_id) && Boolean(record.org_id) && profile.org_id === record.org_id;
      return ownerId === user.id || uploaderId === user.id || isSameOrg || permissionDocIds.has(record.id);
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
        tags: ['Legal'],
      };
    });

  const firstName = profile.full_name?.trim().split(/\s+/)[0] || user.email?.split('@')[0] || 'there';

  return (
    <WorkspaceShell
      profile={profile}
      title="Documents"
      subtitle={`Welcome back, ${firstName}. Role: ${ROLE_LABELS[profile.role] ?? profile.role}.`}
    >
      <DocumentsWorkspaceClient documents={documents} />
    </WorkspaceShell>
  );
}
