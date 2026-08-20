'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import shared from '../../../styles/shared.module.css';
import { createSupabaseBrowserClient } from '../../../lib/supabase/client';
import { ROLE_LABELS, ROLES } from '../../../lib/roles';

const ROLE_OPTIONS = [ROLES.LAWYER, ROLES.STAFF];

export default function AdminUsersClient({ currentUserId, orgId }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [profiles, setProfiles] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingRole, setSavingRole] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFullName, setInviteFullName] = useState('');
  const [inviteRole, setInviteRole] = useState(ROLES.STAFF);

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from('profiles')
      .select('user_id,email,full_name,role,org_id,created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: true });

    if (loadError) {
      setError(true);
      setMessage(`Unable to load users: ${loadError.message}`);
      setLoading(false);
      return;
    }

    setProfiles(data || []);
    setLoading(false);
  }, [orgId, supabase]);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  async function handleProvisionUser(event) {
    event.preventDefault();
    setProvisioning(true);
    setError(false);
    setMessage('');

    const response = await fetch('/api/admin/invite-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: inviteEmail,
        fullName: inviteFullName,
        role: inviteRole,
      }),
    });

    const payload = await response.json();
    setProvisioning(false);

    if (!response.ok) {
      setError(true);
      setMessage(payload.error || 'Unable to provision user.');
      return;
    }

    setInviteEmail('');
    setInviteFullName('');
    setInviteRole(ROLES.STAFF);
    setMessage(`Provisioned successfully. Temporary password: ${payload.temporaryPassword}`);
    loadProfiles();
  }

  async function handleRoleChange(userId, nextRole) {
    setSavingRole(true);
    setError(false);
    setMessage('');

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ role: nextRole })
      .eq('user_id', userId)
      .eq('org_id', orgId);

    setSavingRole(false);

    if (updateError) {
      setError(true);
      setMessage(`Unable to update role: ${updateError.message}`);
      return;
    }

    setProfiles((prev) => prev.map((item) => (item.user_id === userId ? { ...item, role: nextRole } : item)));
    setMessage('Role updated successfully.');
  }

  if (loading) {
    return <p className={shared.helpText}>Loading organization members...</p>;
  }

  return (
    <>
      {message && (
        <p className={`${shared.message} ${error ? shared.messageError : shared.messageSuccess}`}>{message}</p>
      )}

      <div className={shared.sectionCard} style={{ marginTop: 0 }}>
        <h3 className={shared.cardTitle}>Provision Lawyer or Staff</h3>
        <p className={shared.cardText}>New accounts are automatically assigned to your organization.</p>
        <form onSubmit={handleProvisionUser} className={shared.formGrid}>
          <label className={shared.fieldLabel}>
            Full name
            <input className={shared.input} value={inviteFullName} onChange={(event) => setInviteFullName(event.target.value)} />
          </label>
          <label className={shared.fieldLabel}>
            Email
            <input className={shared.input} type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} required />
          </label>
          <label className={shared.fieldLabel}>
            Role
            <select className={shared.select} value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}>
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>{ROLE_LABELS[role]}</option>
              ))}
            </select>
          </label>
          <button className={shared.button} type="submit" disabled={provisioning}>
            {provisioning ? 'Provisioning...' : 'Provision User'}
          </button>
        </form>
      </div>

      <div className={shared.sectionCard}>
        <h3 className={shared.cardTitle}>Organization Members</h3>
        <div className={shared.cardGrid}>
          {profiles.map((profile) => (
            <div key={profile.user_id} className={shared.cardBlock}>
              <h3 className={shared.cardTitle}>{profile.full_name || 'No name set'}</h3>
              <p className={shared.cardText}>{profile.email || 'No email available'}</p>
              <label className={shared.fieldLabel} style={{ marginTop: '1rem' }}>
                Role
                <select
                  className={shared.select}
                  value={profile.role}
                  onChange={(event) => handleRoleChange(profile.user_id, event.target.value)}
                  disabled={profile.user_id === currentUserId || savingRole}
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                  ))}
                </select>
              </label>
              {profile.user_id === currentUserId && (
                <p className={shared.helpText} style={{ marginTop: '0.75rem' }}>
                  Your own role is managed outside this panel.
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
