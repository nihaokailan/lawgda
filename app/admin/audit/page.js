import { requireRole } from '../../../lib/authGuard';
import { ROLES } from '../../../lib/roles';
import WorkspaceShell from '../../components/WorkspaceShell';
import shared from '../../../styles/shared.module.css';
import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { loadOrgDocumentEvents, loadOrgName } from '../../../lib/orgRepository';

export default async function AdminAuditPage() {
  const { profile } = await requireRole([ROLES.ADMIN]);
  const admin = getSupabaseAdmin();

  const [orgName, { data: entries }, documentEvents] = await Promise.all([
    loadOrgName(profile.org_id),
    admin
      .from('granular_audit_log')
      .select('id,actor_user_id,actor_role,action,resource_table,field_name,created_at')
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: false })
      .limit(200),
    loadOrgDocumentEvents(profile.org_id, { limit: 200 }),
  ]);

  // Name and email of the firm's own members behind each entry. External
  // signers are not looked up: the admin does not see signer contact data.
  const actorIds = [...new Set([...(entries || []), ...documentEvents].map((row) => row.actor_user_id).filter(Boolean))];
  const { data: actorProfiles } = actorIds.length
    ? await admin.from('profiles').select('user_id,full_name,email').eq('org_id', profile.org_id).in('user_id', actorIds)
    : { data: [] };
  const actors = new Map((actorProfiles || []).map((row) => [row.user_id, row]));
  const describeActor = (userId) => {
    const actor = userId ? actors.get(userId) : null;
    if (!actor) return userId ? 'Lawgda user' : 'System or external signer';
    return actor.full_name && actor.email ? `${actor.full_name} (${actor.email})` : actor.full_name || actor.email;
  };

  return (
    <WorkspaceShell
      profile={profile}
      title="Audit Logs"
      subtitle={`${orgName} \u2014 activity within your law firm only.`}
    >
      <section className={shared.sectionCard}>
        <h3 style={{ marginTop: 0 }}>Account &amp; data changes <span style={{ color: 'var(--muted)', fontWeight: 500 }}>&middot; {orgName}</span></h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>When</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Who</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Actor role</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Action</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Resource</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Field</th>
            </tr>
          </thead>
          <tbody>
            {(entries || []).map((entry) => (
              <tr key={entry.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '0.5rem' }}>{new Date(entry.created_at).toLocaleString()}</td>
                <td style={{ padding: '0.5rem' }}>{describeActor(entry.actor_user_id)}</td>
                <td style={{ padding: '0.5rem' }}>{entry.actor_role}</td>
                <td style={{ padding: '0.5rem' }}>{entry.action}</td>
                <td style={{ padding: '0.5rem' }}>{entry.resource_table}</td>
                <td style={{ padding: '0.5rem' }}>{entry.field_name ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={shared.sectionCard} style={{ marginTop: '1.5rem' }}>
        <h3 style={{ marginTop: 0 }}>Document events <span style={{ color: 'var(--muted)', fontWeight: 500 }}>&middot; {orgName}</span></h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>When</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Who</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Event</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Document</th>
            </tr>
          </thead>
          <tbody>
            {documentEvents.map((event) => (
              <tr key={event.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '0.5rem' }}>{new Date(event.created_at).toLocaleString()}</td>
                <td style={{ padding: '0.5rem' }}>{describeActor(event.actor_user_id)}</td>
                <td style={{ padding: '0.5rem' }}>{event.event_type}</td>
                <td style={{ padding: '0.5rem' }}>{event.document_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </WorkspaceShell>
  );
}
