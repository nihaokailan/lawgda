import WorkspaceShell from '../components/WorkspaceShell';
import { requireDocumentAccess } from '../../lib/authGuard';
import { createSupabaseServerClient } from '../../lib/supabase/server';
import { getSupabaseAdmin } from '../../lib/supabaseAdmin';
import DashboardClient from './DashboardClient';
import RealtimeRefresh from '../components/RealtimeRefresh';
import { listUserStorageFiles } from '../../lib/listUserStorageFiles';
import { loadDocumentsSharedWithUser } from '../../lib/sharedDocuments';
import { loadMySigningTurns } from '../../lib/signingTurn';
import { auditEventLabel } from '../../lib/auditEventLabel';

type DocStatus = 'Drafting' | 'Pending' | 'Signed' | 'Filed';

type DashboardDocument = {
  id: string | null;
  title: string;
  status: DocStatus;
  sha256Hash: string | null;
  createdAt: string | null;
  myAction?: 'sign' | 'waiting' | null;
};

type DashboardActivity = {
  id: string;
  documentId: string;
  documentTitle: string;
  eventType: string;
  label: string;
  createdAt: string;
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

// Uploads always create their document row, so the backfill only catches rare
// orphaned files. Run it at most every 10 minutes per user (per server
// instance) instead of on every load and every realtime refresh.
const BACKFILL_INTERVAL_MS = 10 * 60 * 1000;
const lastBackfillAt = new Map<string, number>();

async function ensureStorageBackfillForUser(supabase: ReturnType<typeof createSupabaseServerClient>, userId: string) {
  const now = Date.now();
  if (now - (lastBackfillAt.get(userId) ?? 0) < BACKFILL_INTERVAL_MS) return;
  lastBackfillAt.set(userId, now);

  const metadataClient = getSupabaseAdmin();
  const storageBuckets = ['secure_docs', 'evidence', 'org-documents'];

  await Promise.all(storageBuckets.map(async (bucket) => {
    const storageItems = (await listUserStorageFiles(supabase, bucket, userId))
      .filter((item) => item.name && !item.name.endsWith('/'));
    if (!storageItems.length) return;

    // Look paths up in batches instead of one query per file. Batches keep the
    // request URL short; `.in()` quotes each value, so unusual file names
    // cannot alter the filter.
    const paths = storageItems.map((item) => item.path as string);
    const batches: string[][] = [];
    for (let i = 0; i < paths.length; i += 40) batches.push(paths.slice(i, i + 40));
    const lookups = await Promise.all(batches.flatMap((batch) => [
      metadataClient.from('documents').select('path').in('path', batch),
      metadataClient.from('documents').select('file_path').in('file_path', batch),
    ]));
    if (lookups.some((lookup) => lookup.error)) return;

    const knownPaths = new Set<string>(
      lookups.flatMap((lookup) => (lookup.data ?? []).map((row: Record<string, unknown>) => String(row.path ?? row.file_path)))
    );

    await Promise.all(storageItems.filter((item) => !knownPaths.has(item.path)).map((item) => {
      const path = item.path as string;
      const ownerHint = path.split('/')[0];
      const ownerId = /^\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b$/i.test(ownerHint)
        ? ownerHint
        : userId;

      return metadataClient.from('documents').insert([{
        owner_id: ownerId,
        user_id: ownerId,
        uploaded_by: ownerId,
        bucket,
        path,
        file_path: path,
        title: path.split('/').pop() || path,
        status: 'Drafting',
        created_at: item.updated_at ?? item.created_at ?? new Date().toISOString(),
      }]);
    }));
  }));
}

async function loadDashboardData(userId: string, orgId: string | null, email: string | null) {
  const supabase = createSupabaseServerClient();
  const supabaseAdmin = getSupabaseAdmin();
  // Shared documents don't depend on the backfill, so load them alongside it.
  const sharedDocumentsPromise = loadDocumentsSharedWithUser(supabaseAdmin, userId, orgId);
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

  const sharedDocuments = await sharedDocumentsPromise;
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

  const documentTitles = new Map(
    recentDocuments.filter((document) => document.id).map((document) => [document.id as string, document.title])
  );
  const documentIds = [...documentTitles.keys()];
  let activity: DashboardActivity[] = [];
  let activityUnavailable = false;

  if (documentIds.length > 0) {
    const [documentEvents, signingEvents] = await Promise.all([
      supabaseAdmin
        .from('audit_logs')
        .select('id,document_id,event_type,created_at,details')
        .in('document_id', documentIds)
        .order('created_at', { ascending: false })
        .limit(6),
      supabaseAdmin
        .from('signing_audit_events')
        .select('id,document_id,event_type,created_at,details')
        .in('document_id', documentIds)
        .order('created_at', { ascending: false })
        .limit(6),
    ]);

    if (documentEvents.error || signingEvents.error) {
      console.error('Unable to load dashboard audit activity.');
      activityUnavailable = true;
    } else {
      activity = [...(documentEvents.data ?? []), ...(signingEvents.data ?? [])]
        .sort((first, second) => new Date(second.created_at).getTime() - new Date(first.created_at).getTime())
        .slice(0, 5)
        .map((event) => ({
          id: String(event.id),
          documentId: String(event.document_id),
          documentTitle: documentTitles.get(String(event.document_id)) ?? 'Document',
          eventType: String(event.event_type),
          label: auditEventLabel(event),
          createdAt: String(event.created_at),
        }));
    }
  }

  return { metrics, recentDocuments, activity, activityUnavailable };
}

export default async function DashboardPage() {
  const { user, profile } = await requireDocumentAccess();
  const { metrics, recentDocuments, activity, activityUnavailable } = await loadDashboardData(
    user.id,
    profile.org_id ?? null,
    user.email ?? null
  );
  const userName = getFirstName(profile.full_name, user.email);

  return (
    <WorkspaceShell
      profile={profile}
      title="Dashboard"
      subtitle={`Welcome back, ${userName}.`}
      dashboard
      accountName={profile.full_name || userName}
      accountEmail={user.email ?? ''}
    >
      <RealtimeRefresh />
      <DashboardClient
        initialDocuments={recentDocuments}
        initialMetrics={metrics}
        initialActivity={activity}
        activityUnavailable={activityUnavailable}
        userName={userName}
      />
    </WorkspaceShell>
  );
}
