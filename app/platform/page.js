import { requireRole } from '../../lib/authGuard';
import { ROLES } from '../../lib/roles';
import WorkspaceShell from '../components/WorkspaceShell';
import PlatformDashboardClient from './PlatformDashboardClient';
import { getSupabaseAdmin } from '../../lib/supabaseAdmin';

export default async function PlatformDashboardPage() {
  const { user, profile } = await requireRole([ROLES.DEFAULT_ADMIN]);

  // Pending firm-creation requests, reviewed exclusively by Default Admin.
  // Only columns needed to review the request, and only role=normal rows
  // (people who are not members of any firm) — never lawyer/staff PII. Read
  // with the service role because RLS deliberately hides these rows from
  // Default Admin's own session.
  const { data: pendingRequests } = await getSupabaseAdmin()
    .from('profiles')
    .select('user_id,email,full_name,requested_org_name,admin_request_note,admin_requested_at')
    .eq('admin_request_status', 'pending')
    .eq('role', ROLES.NORMAL)
    .is('org_id', null)
    .order('admin_requested_at', { ascending: false });

  return (
    <WorkspaceShell
      profile={profile}
      title="Platform Administration"
      subtitle="Manage law firms and their Organization Admin accounts."
    >
      <PlatformDashboardClient currentUserId={user.id} pendingRequests={pendingRequests || []} />
    </WorkspaceShell>
  );
}
