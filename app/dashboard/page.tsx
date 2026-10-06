import WorkspaceShell from '../components/WorkspaceShell';
import { requireDocumentAccess } from '../../lib/authGuard';
import { createSupabaseServerClient } from '../../lib/supabase/server';
import { getSupabaseAdmin } from '../../lib/supabaseAdmin';
import DashboardClient from './DashboardClient';
import { listUserStorageFiles } from '../../lib/listUserStorageFiles';
import { loadDocumentsSharedWithUser } from '../../lib/sharedDocuments';
import { loadMySigningTurns } from '../../lib/signingTurn';

type DocStatus = 'Drafting' | 'Pending' | 'Signed' | 'Filed';

type DashboardDocument = {
  id: string | null;
  title: string;
  status: DocStatus;
  sha256Hash: string | null;
  createdAt: string | null;
};

function normalizeStatus(status: unknown): DocStatus {
  if (!status) return 'Drafting';
  const value = String(status).trim().toLowerCase();
  if (value.includes('draft')) return 'Drafting';
  if (value.includes('pending')) return 'Pending';
  if (value.includes('sign')) return 'Signed';
  if (value.includes('file')) return 'Filed';
  return 'Drafting';
}

function extractTitle(record: Record<string, unknown>) {
  const candidates = [record.title, record.name, record.filename];
  const resolved = candidates.find((item) => typeof item === 'string' && item.trim().length > 0);
  return (resolved as string | undefined) ?? 'Untitled document';
}

function getFirstName(fullName: string | null | undefined, email: string | null | undefined) {
  const firstName = fullName?.trim().split(/\s+/)[0];
  if (firstName) return firstName;
  return email?.split('@')[0] ?? 'there';
}

async function ensureStorageBackfillForUser(supabase: ReturnType<typeof createSupabaseServerClient>, userId: string) {
  const metadataClient = getSupabaseAdmin();
  const storageBuckets = ['secure_docs', 'evidence', 'org-documents'];

  for (const bucket of storageBuckets) {
    const storageItems = await listUserStorageFiles(supabase, bucket, userId);
    for (const item of storageItems ?? []) {
      if (!item.name || item.name.endsWith('/')) continue;

      const path = item.path;
      const title = path.split('/').pop() || path;
      const ownerHint = path.split('/')[0];
      const ownerId = /^\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b$/i.test(ownerHint)
        ? ownerHint
        : userId;

      const { data: existingRows, error: checkError } = await metadataClient
        .from('documents')
        .select('id')
        .or(`path.eq.${path},file_path.eq.${path}`)
        .limit(1);

      if (!checkError && (existingRows ?? []).length > 0) continue;

      const candidates = [
        {
          owner_id: ownerId,
          user_id: ownerId,
          uploaded_by: ownerId,
          bucket,
          path,
          file_path: path,
          title,
          status: 'Drafting',
          created_at: item.updated_at ?? item.created_at ?? new Date().toISOString(),
        },
        {
          owner_id: ownerId,
          user_id: ownerId,
          uploaded_by: ownerId,
          bucket,
          path,
          file_path: path,
          title,
          status: 'Drafting',
          created_at: item.updated_at ?? item.created_at ?? new Date().toISOString(),
        },
      ];

      for (const candidate of candidates) {
        const { error } = await metadataClient.from('documents').insert([candidate]);
        if (!error) break;
      }
    }
  }
}

async function loadDashboardData(userId: string, orgId: string | null, email: string | null) {
  const supabase = createSupabaseServerClient();
  const supabaseAdmin = getSupabaseAdmin();
  await ensureStorageBackfillForUser(supabase, userId);
  let docsResult = await supabase
    .from('documents')
    .select('*')
    .or(`owner_id.eq.${userId},uploaded_by.eq.${userId},user_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(100);

  if (docsResult.error || !(docsResult.data ?? []).length) {
    docsResult = await supabaseAdmin
      .from('documents')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    docsResult.data = (docsResult.data ?? []).filter((record) => (
      record.owner_id === userId || record.uploaded_by === userId || record.user_id === userId
    ));
  }

  const sharedDocuments = await loadDocumentsSharedWithUser(supabaseAdmin, userId, orgId);
  const rows = [...(docsResult.data ?? []), ...sharedDocuments].sort(
    (a, b) => new Date(String(b.created_at ?? 0)).getTime() - new Date(String(a.created_at ?? 0)).getTime()
  ) as Array<Record<string, unknown>>;
  const seen = new Set<string>();
  const dedupedRows = rows.filter((row) => {
    const key = String(
      row.id ?? `${row.bucket ?? 'storage'}:${row.path ?? row.storage_path ?? row.name ?? row.filename ?? row.title ?? ''}`
    );
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  const metrics = {
    Drafting: 0,
    Pending: 0,
    Signed: 0,
    Filed: 0,
  };

  const turns = await loadMySigningTurns(supabaseAdmin, email, dedupedRows.map((row) => String(row.id ?? '')));

  const recentDocuments: DashboardDocument[] = dedupedRows.slice(0, 20).map((record) => {
    const status = normalizeStatus(record.status);
    metrics[status] += 1;
    return {
      id: typeof record.id === 'string' ? record.id : null,
      title: extractTitle(record),
      status,
      sha256Hash: typeof record.sha256_hash === 'string' ? record.sha256_hash : null,
      createdAt: typeof record.created_at === 'string' ? record.created_at : null,
      myAction: turns.get(String(record.id ?? ''))?.state ?? null,
    };
  });

  dedupedRows.slice(20).forEach((record) => {
    metrics[normalizeStatus(record.status)] += 1;
  });

  return { metrics, recentDocuments };
}

export default async function DashboardPage() {
  const { user, profile } = await requireDocumentAccess();
  const { metrics, recentDocuments } = await loadDashboardData(user.id, profile.org_id ?? null, user.email ?? null);

  return (
    <WorkspaceShell
      profile={profile}
      title="LAWDGA Dashboard"
      subtitle={`Welcome back, ${getFirstName(profile.full_name, user.email)}.`}
    >
      <DashboardClient
        initialDocuments={recentDocuments}
        initialMetrics={metrics}
        userName={getFirstName(profile.full_name, user.email)}
      />
    </WorkspaceShell>
  );
}
