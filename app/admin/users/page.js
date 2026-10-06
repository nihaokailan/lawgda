import { requireRole } from '../../../lib/authGuard';
import { ROLES } from '../../../lib/roles';
import WorkspaceShell from '../../components/WorkspaceShell';
import AdminUsersClient from './AdminUsersClient';
import { loadOrgName } from '../../../lib/orgRepository';

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

  const orgName = await loadOrgName(profile.org_id);

  return (
    <WorkspaceShell
      profile={profile}
      title="Organization User Provisioning"
      subtitle={`${orgName} \u2014 assign roles to registered accounts and manage your law firm's Lawyers and Staff.`}
    >
      <AdminUsersClient currentUserId={user.id} />
    </WorkspaceShell>
  );
}
