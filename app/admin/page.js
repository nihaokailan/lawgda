import { requireRole } from '../../lib/authGuard';
import { ROLES } from '../../lib/roles';
import WorkspaceShell from '../components/WorkspaceShell';
import AdminDashboardClient from './AdminDashboardClient';
import { createSupabaseServerClient } from '../../lib/supabase/server';

export default async function AdminDashboardPage() {
  const { user, profile } = await requireRole([ROLES.ADMIN]);

  // Fetch admin requests
  const supabase = createSupabaseServerClient();
  const { data: adminRequests } = await supabase
    .from('profiles')
    .select('user_id,email,full_name,admin_request_status,admin_request_note,admin_requested_at')
    .eq('admin_request_status', 'pending')
    .order('admin_requested_at', { ascending: false });

  // Fetch all users
  const { data: allUsers } = await supabase
    .from('profiles')
    .select('user_id,email,full_name,role,org_id,admin_request_status')
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <WorkspaceShell
      profile={profile}
      title="Admin Dashboard"
      subtitle="Manage admin requests, users, and organization settings."
    >
      <AdminDashboardClient 
        adminRequests={adminRequests || []} 
        allUsers={allUsers || []}
        currentUserId={user.id}
        currentOrgId={profile.org_id}
      />
    </WorkspaceShell>
  );
}
