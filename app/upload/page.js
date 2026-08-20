import UploadDocument from './UploadDocument';
import { requireRole } from '../../lib/authGuard';
import { ROLES } from '../../lib/roles';
import WorkspaceShell from '../components/WorkspaceShell';
import { ROLE_LABELS } from '../../lib/roles';

export default async function UploadPage() {
  const { profile } = await requireRole([ROLES.ADMINISTRATOR, ROLES.LAWYER]);
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
