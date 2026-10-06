import { requireRole } from '../../../lib/authGuard';
import { ROLES } from '../../../lib/roles';
import WorkspaceShell from '../../components/WorkspaceShell';
import shared from '../../../styles/shared.module.css';
import { loadOrgRepositoryMetadata, loadOrgName } from '../../../lib/orgRepository';

export default async function AdminRepositoryPage() {
  const { profile } = await requireRole([ROLES.ADMIN]);
  const [orgName, { documents, folders }] = await Promise.all([
    loadOrgName(profile.org_id),
    loadOrgRepositoryMetadata(profile.org_id),
  ]);

  return (
    <WorkspaceShell
      profile={profile}
      title="Repository Oversight"
      subtitle={`${orgName} \u2014 repository metadata only. Document contents, signatures and keys are never shown to Admins.`}
    >
      <section className={shared.sectionCard}>
        <h3 style={{ marginTop: 0 }}>Folders ({folders.length})</h3>
        <ul>
          {folders.map((folder) => <li key={folder.id}>{folder.name}</li>)}
        </ul>
      </section>

      <section className={shared.sectionCard} style={{ marginTop: '1.5rem' }}>
        <h3 style={{ marginTop: 0 }}>Documents ({documents.length})</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Title</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Status</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Owner</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Created</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr key={doc.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '0.5rem' }}>{doc.title}</td>
                <td style={{ padding: '0.5rem' }}>{doc.status ?? '-'}</td>
                <td style={{ padding: '0.5rem' }}>{doc.ownerName ?? '-'}</td>
                <td style={{ padding: '0.5rem' }}>{doc.createdAt ? new Date(doc.createdAt).toLocaleString() : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </WorkspaceShell>
  );
}
