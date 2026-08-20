import WorkspaceShell from '../../components/WorkspaceShell';
import AdminRequestClient from './AdminRequestClient';
import { requireAuthProfile } from '../../../lib/authGuard';

export default async function AdminRequestPage() {
  const { profile } = await requireAuthProfile();

  return (
    <WorkspaceShell
      profile={profile}
      title="Request Admin Status"
      subtitle="Submit your organization details to request admin access."
    >
      <AdminRequestClient profile={profile} />
    </WorkspaceShell>
  );
}
