import { requireRole } from '../../lib/authGuard';
import { ROLES } from '../../lib/roles';
import WorkspaceShell from '../components/WorkspaceShell';
import AdminDashboardClient from './AdminDashboardClient';
import { createSupabaseServerClient } from '../../lib/supabase/server';
import { loadOrgName } from '../../lib/orgRepository';

export default async function AdminDashboardPage() {
  const { user, profile } = await requireRole([ROLES.ADMIN]);

  // Fetch this organization's users only — RLS (is_admin_of_org) already
  // restricts this to profile.org_id, the explicit filter is defense in depth.
  const orgName = await loadOrgName(profile.org_id);
  const supabase = createSupabaseServerClient();
  const { data: allUsers } = await supabase
    .from('profiles')
    .select('user_id,email,full_name,role,org_id,created_at')
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <WorkspaceShell
      profile={profile}
      title="Admin Dashboard"
      subtitle={`${orgName} \u2014 manage your law firm's Lawyers and Staff.`}
    >
      <AdminDashboardClient
        allUsers={allUsers || []}
        currentUserId={user.id}
        currentOrgId={profile.org_id}
      />
    </WorkspaceShell>
  );
}
