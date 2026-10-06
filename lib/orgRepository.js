import { getSupabaseAdmin } from './supabaseAdmin';

/**
 * Repository oversight for an Organization Admin: metadata only. The explicit
 * allow-list below is the guarantee that file paths, hashes, signatures,
 * certificates, keys and document content never leave the server.
 */
export async function loadOrgRepositoryMetadata(orgId, { limit = 200 } = {}) {
  const admin = getSupabaseAdmin();

  const [{ data: documents, error: docError }, { data: folders }, { data: members }] = await Promise.all([
    admin.from('documents').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).limit(limit),
    admin.from('folders').select('id,name,parent_id,created_at').eq('org_id', orgId).order('name', { ascending: true }),
    admin.from('profiles').select('user_id,full_name,email').eq('org_id', orgId),
  ]);

  if (docError) {
    throw new Error('Unable to load repository metadata.');
  }

  const memberNames = new Map((members || []).map((member) => [member.user_id, member.full_name || member.email || 'Member']));

  return {
    documents: (documents || []).map((doc) => ({
      id: doc.id,
      title: doc.title ?? doc.name ?? doc.filename ?? 'Untitled document',
      status: doc.status ?? null,
      folderId: doc.folder_id ?? null,
      ownerName: memberNames.get(doc.owner_id ?? doc.user_id) ?? null,
      createdAt: doc.created_at,
    })),
    folders: (folders || []).map((folder) => ({
      id: folder.id,
      name: folder.name,
      parentId: folder.parent_id ?? null,
      createdAt: folder.created_at,
    })),
  };
}

export async function loadOrgDocumentEvents(orgId, { limit = 200 } = {}) {
  const admin = getSupabaseAdmin();
  const { data: orgDocuments } = await admin.from('documents').select('id').eq('org_id', orgId).limit(5000);
  const documentIds = (orgDocuments || []).map((doc) => doc.id);
  if (documentIds.length === 0) {
    return [];
  }

  // `details` is intentionally not selected: it can embed signer contact data.
  const { data } = await admin
    .from('audit_logs')
    .select('id,document_id,actor_user_id,event_type,created_at')
    .in('document_id', documentIds)
    .order('created_at', { ascending: false })
    .limit(limit);

  return data || [];
}

export async function loadOrgName(orgId) {
  const { data } = await getSupabaseAdmin().from('organizations').select('name').eq('id', orgId).maybeSingle();
  return data?.name || 'Your law firm';
}
