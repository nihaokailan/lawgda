import WorkspaceShell from '../../components/WorkspaceShell';
import AdminRequestClient from './AdminRequestClient';
import { requireRole } from '../../../lib/authGuard';
import { ROLES } from '../../../lib/roles';

export default async function AdminRequestPage() {
  const { profile } = await requireRole([ROLES.NORMAL]);

  return (
    <WorkspaceShell
      profile={profile}
      breadcrumb="Account"
      title="Request Admin Status"
      subtitle="Submit your organization details to request admin access."
    >
      <AdminRequestClient profile={profile} />
    </WorkspaceShell>
  );
}
