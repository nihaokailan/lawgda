import WorkspaceShell from '../components/WorkspaceShell';
import { requireAuthProfile } from '../../lib/authGuard';
import { createSupabaseServerClient } from '../../lib/supabase/server';
import DashboardClient from './DashboardClient';

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

async function loadDashboardData() {
  const supabase = createSupabaseServerClient();
  const docsResult = await supabase.from('documents').select('*').order('created_at', { ascending: false }).limit(100);
  const rows = (docsResult.data ?? []) as Array<Record<string, unknown>>;

  const metrics = {
    Drafting: 0,
    Pending: 0,
    Signed: 0,
    Filed: 0,
  };

  const recentDocuments: DashboardDocument[] = rows.slice(0, 20).map((record) => {
    const status = normalizeStatus(record.status);
    metrics[status] += 1;
    return {
      id: typeof record.id === 'string' ? record.id : null,
      title: extractTitle(record),
      status,
      sha256Hash: typeof record.sha256_hash === 'string' ? record.sha256_hash : null,
      createdAt: typeof record.created_at === 'string' ? record.created_at : null,
    };
  });

  rows.slice(20).forEach((record) => {
    metrics[normalizeStatus(record.status)] += 1;
  });

  return { metrics, recentDocuments };
}

export default async function DashboardPage() {
  const { user, profile } = await requireAuthProfile();
  const { metrics, recentDocuments } = await loadDashboardData();

  return (
    <WorkspaceShell
      profile={profile}
      title="LAWDGA Dashboard"
      subtitle={`Welcome back, ${getFirstName(profile.full_name, user.email)}.`}
    >
      <DashboardClient initialDocuments={recentDocuments} initialMetrics={metrics} />
    </WorkspaceShell>
  );
}
