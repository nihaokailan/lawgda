import { redirect } from 'next/navigation';
import WorkspaceShell from '../components/WorkspaceShell';
import RealtimeRefresh from '../components/RealtimeRefresh';
import { requireDocumentAccess } from '../../lib/authGuard';
import { getSupabaseAdmin } from '../../lib/supabaseAdmin';
import { CASE_MANAGER_ROLES } from '../../lib/caseFolders';
import CaseFoldersClient from './CaseFoldersClient';

export const revalidate = 0;

/** The firm's case folders (Lawyers and Staff). */
export default async function CaseFoldersPage() {
  const { profile } = await requireDocumentAccess('/admin/repository');
  if (!CASE_MANAGER_ROLES.includes(profile.role) || !profile.org_id) {
    redirect('/dashboard');
  }

  const { data } = await getSupabaseAdmin()
    .from('cases')
    .select('id,title,case_number,created_at,updated_at,documents(count)')
    .eq('org_id', profile.org_id)
    .order('updated_at', { ascending: false })
    .limit(500);

  const cases = (data ?? []).map((row) => ({
    id: row.id,
    title: row.title || 'Untitled case',
    caseNumber: row.case_number ?? null,
    documentCount: Array.isArray(row.documents) ? Number(row.documents[0]?.count ?? 0) : 0,
    createdAt: row.created_at,
  }));

  return (
    <WorkspaceShell profile={profile} title="Case Folders" subtitle="Group documents by case and print QR labels for physical folders.">
      <RealtimeRefresh />
      <CaseFoldersClient cases={cases} />
    </WorkspaceShell>
  );
}
