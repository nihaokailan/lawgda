import { requireRole } from '../../../lib/authGuard';
import { ROLES } from '../../../lib/roles';
import WorkspaceShell from '../../components/WorkspaceShell';
import AdminUsersClient from './AdminUsersClient';

export default async function AdminUsersPage() {
  const { user, profile } = await requireRole([ROLES.ADMIN]);

  if (!profile.org_id) {
    return (
      <WorkspaceShell
        profile={profile}
        title="Organization User Provisioning"
        subtitle="Your admin account is not attached to an organization yet."
      >
        <p>Please assign an organization ID to this admin account before provisioning team members.</p>
      </WorkspaceShell>
    );
  }

  return (
    <WorkspaceShell
      profile={profile}
      title="Organization User Provisioning"
      subtitle="Create and manage lawyer/staff accounts under your organization ID."
    >
      <AdminUsersClient currentUserId={user.id} orgId={profile.org_id} />
    </WorkspaceShell>
  );
}
