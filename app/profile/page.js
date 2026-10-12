import { requireAuthProfile } from '../../lib/authGuard';
import WorkspaceShell from '../components/WorkspaceShell';
import ProfileClient from './ProfileClient';

export default async function ProfilePage() {
  const { user, profile } = await requireAuthProfile();

  return (
    <WorkspaceShell
      profile={profile}
      breadcrumb="Account"
      title="User Profile"
      subtitle="Update your basic profile information and check your current access role."
    >
      <ProfileClient initialProfile={profile} email={user.email ?? ''} />
    </WorkspaceShell>
  );
}
