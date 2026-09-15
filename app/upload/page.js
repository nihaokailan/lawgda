import UploadDocument from './UploadDocument';
import { requireAuthProfile } from '../../lib/authGuard';
import WorkspaceShell from '../components/WorkspaceShell';
import { ROLE_LABELS } from '../../lib/roles';

export default async function UploadPage() {
  const { profile } = await requireAuthProfile('/signin');
  return (
    <WorkspaceShell
      profile={profile}
      title="Upload Workspace"
      subtitle={`Role: ${ROLE_LABELS[profile.role] ?? profile.role}.`}
    >
      <UploadDocument />
    </WorkspaceShell>
  );
}
