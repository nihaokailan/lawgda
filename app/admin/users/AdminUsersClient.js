'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import shared from '../../../styles/shared.module.css';
import { ROLE_LABELS, ROLES } from '../../../lib/roles';
import { ROLE_SCOPE_DESCRIPTIONS } from '../../../lib/orgMembership';
import Pagination from '../../components/Pagination';
import StatusDialog from '../../components/StatusDialog';

const ROLE_OPTIONS = [ROLES.LAWYER, ROLES.STAFF];
const PAGE_SIZE = 10;

function ConfirmDialog({ dialog, busy, onCancel, onConfirm }) {
  if (!dialog) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}
    >
      <div className={shared.sectionCard} style={{ maxWidth: 480, width: '100%', margin: 0, background: '#fff' }}>
        <h3 id="confirm-title" style={{ marginTop: 0 }}>{dialog.title}</h3>
        <p className={shared.cardText} style={{ color: '#991b1b', fontWeight: 600 }}>{dialog.warning}</p>
        {dialog.detail && <p className={shared.cardText}>{dialog.detail}</p>}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', justifyContent: 'flex-end' }}>
          <button type="button" className={shared.linkButton} onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className={shared.button} onClick={onConfirm} disabled={busy}>
            {busy ? 'Saving...' : dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditEmployeeDialog({ edit, setEdit, busy, onCancel, onSave }) {
  if (!edit) return null;
  const { member, fullName, role, isActive, step } = edit;
  const nameChanged = fullName.trim() !== (member.full_name || '');
  const roleChanged = role !== member.role;
  const statusChanged = isActive !== (member.is_active !== false);
  const hasChanges = nameChanged || roleChanged || statusChanged;
  const label = member.full_name || member.email;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-title"
      style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}
    >
      <div className={shared.sectionCard} style={{ maxWidth: 520, width: '100%', margin: 0, background: '#fff' }}>
        {step === 'form' ? (
          <>
            <h3 id="edit-title" style={{ marginTop: 0 }}>Edit employee</h3>
            <p className={shared.cardText}>{member.email}</p>
            <div className={shared.formGrid}>
              <label className={shared.fieldLabel}>
                Full name
                <input
                  className={shared.input}
                  value={fullName}
                  onChange={(event) => setEdit({ ...edit, fullName: event.target.value })}
                />
              </label>
              <label className={shared.fieldLabel}>
                Role
                <select
                  className={shared.select}
                  value={role}
                  onChange={(event) => setEdit({ ...edit, role: event.target.value })}
                >
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option} value={option}>{ROLE_LABELS[option]}</option>
                  ))}
                </select>
              </label>
              <label className={shared.fieldLabel}>
                Account status
                <select
                  className={shared.select}
                  value={isActive ? 'active' : 'inactive'}
                  onChange={(event) => setEdit({ ...edit, isActive: event.target.value === 'active' })}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Deactivated</option>
                </select>
              </label>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', justifyContent: 'flex-end' }}>
              <button type="button" className={shared.linkButton} onClick={onCancel}>Cancel</button>
              <button
                type="button"
                className={shared.button}
                disabled={!hasChanges}
                onClick={() => setEdit({ ...edit, step: 'confirm' })}
              >
                Review changes
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 id="edit-title" style={{ marginTop: 0 }}>Confirm changes for {label}</h3>
            <ul style={{ paddingLeft: '1.2rem', lineHeight: 1.6 }}>
              {nameChanged && <li>Name: {member.full_name || 'No name set'} → {fullName.trim() || 'No name set'}</li>}
              {roleChanged && <li>Role: {ROLE_LABELS[member.role]} → {ROLE_LABELS[role]}</li>}
              {statusChanged && <li>Status: {member.is_active === false ? 'Deactivated' : 'Active'} → {isActive ? 'Active' : 'Deactivated'}</li>}
            </ul>
            {roleChanged && (
              <p className={shared.cardText} style={{ color: '#991b1b', fontWeight: 600 }}>
                Warning: {label} will be limited to {ROLE_SCOPE_DESCRIPTIONS[role]}
              </p>
            )}
            {statusChanged && !isActive && (
              <p className={shared.cardText} style={{ color: '#991b1b', fontWeight: 600 }}>
                Warning: {label} will be signed out and unable to access Lawgda until reactivated.
              </p>
            )}
            <p className={shared.cardText}>These changes take effect immediately.</p>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', justifyContent: 'flex-end' }}>
              <button type="button" className={shared.linkButton} onClick={() => setEdit({ ...edit, step: 'form' })} disabled={busy}>Back</button>
              <button type="button" className={shared.button} onClick={onSave} disabled={busy}>
                {busy ? 'Saving...' : 'Yes, save changes'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function AdminUsersClient({ currentUserId }) {
  const [profiles, setProfiles] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [lookupEmail, setLookupEmail] = useState('');
  const [account, setAccount] = useState(null);
  const [assignRole, setAssignRole] = useState(ROLES.STAFF);
  const [dialog, setDialog] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [edit, setEdit] = useState(null);
  const [page, setPage] = useState(1);

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    const response = await fetch('/api/admin/users');
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(true);
      setMessage(`Unable to load users: ${payload.error || 'Request failed.'}`);
      setLoading(false);
      return;
    }

    setProfiles(payload.users || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  function report(ok, text) {
    setError(!ok);
    setMessage(text);
  }

  async function handleLookup(event) {
    event.preventDefault();
    setBusy(true);
    setAccount(null);
    setMessage('');

    const response = await fetch('/api/admin/users/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: lookupEmail }),
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      report(false, payload.error || 'Unable to look up this account.');
      return;
    }

    setAccount(payload.account);
  }

  function requestAssign() {
    const roleLabel = ROLE_LABELS[assignRole];
    setDialog({
      title: `Assign ${roleLabel} role?`,
      warning: `${account.fullName || account.email} will become a ${roleLabel} in your organization and will be limited to: ${ROLE_SCOPE_DESCRIPTIONS[assignRole]}`,
      detail: `Account: ${account.email}`,
      confirmLabel: `Yes, assign ${roleLabel}`,
      run: async () => {
        const response = await fetch('/api/admin/users/assign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: account.email, role: assignRole, confirmed: true }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          report(false, payload.error || 'Unable to assign the role.');
          return;
        }
        setAccount(null);
        setLookupEmail('');
        report(true, `${account.email} is now a ${roleLabel} in your organization.`);
        loadProfiles();
      },
    });
  }

  const pageCount = Math.max(1, Math.ceil(profiles.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = useMemo(
    () => profiles.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [profiles, currentPage]
  );
  const selectedMember = profiles.find((member) => member.user_id === selectedId) ?? null;

  function openEdit() {
    if (!selectedMember) return;
    setEdit({
      member: selectedMember,
      fullName: selectedMember.full_name || '',
      role: selectedMember.role,
      isActive: selectedMember.is_active !== false,
      step: 'form',
    });
  }

  async function saveEdit() {
    const { member, fullName, role, isActive } = edit;
    const changes = {};
    if (fullName.trim() !== (member.full_name || '')) changes.fullName = fullName.trim();
    if (role !== member.role) changes.role = role;
    if (isActive !== (member.is_active !== false)) changes.isActive = isActive;

    setBusy(true);
    const response = await fetch(`/api/admin/users/${member.user_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...changes, confirmed: true }),
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      report(false, `Unable to update employee: ${payload.error || 'Request failed.'}`);
      setEdit(null);
      return;
    }

    setProfiles((prev) => prev.map((item) => (
      item.user_id === member.user_id
        ? {
          ...item,
          ...(changes.fullName !== undefined ? { full_name: changes.fullName || null } : {}),
          ...(changes.role ? { role: changes.role } : {}),
          ...(changes.isActive !== undefined ? { is_active: changes.isActive } : {}),
        }
        : item
    )));
    report(true, 'Employee updated successfully.');
    setEdit(null);
  }

  async function confirmDialog() {
    setBusy(true);
    await dialog.run();
    setBusy(false);
    setDialog(null);
  }

  if (loading) {
    return <p className={shared.helpText}>Loading organization members...</p>;
  }

  return (
    <>
      <StatusDialog message={message} error={Boolean(error)} onClose={() => setMessage('')} />

      <div className={shared.sectionCard} style={{ marginTop: 0 }}>
        <h3 className={shared.cardTitle}>Add a Lawyer or Staff member</h3>
        <p className={shared.cardText}>
          Roles can only be given to people who have already registered and confirmed their email.
          Find their account first, then choose a role.
        </p>
        <form onSubmit={handleLookup} className={shared.formGrid}>
          <label className={shared.fieldLabel}>
            Registered email
            <input
              className={shared.input}
              type="email"
              value={lookupEmail}
              onChange={(event) => { setLookupEmail(event.target.value); setAccount(null); }}
              required
            />
          </label>
          <button className={shared.button} type="submit" disabled={busy}>Find account</button>
        </form>

        {account && (
          <div className={shared.cardBlock} style={{ marginTop: '1rem' }}>
            <h3 className={shared.cardTitle}>{account.fullName || 'No name set'}</h3>
            <p className={shared.cardText}>{account.email}</p>
            <label className={shared.fieldLabel} style={{ marginTop: '1rem' }}>
              Role
              <select className={shared.select} value={assignRole} onChange={(event) => setAssignRole(event.target.value)}>
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                ))}
              </select>
            </label>
            <button className={shared.button} type="button" style={{ marginTop: '1rem' }} onClick={requestAssign}>
              Assign role
            </button>
          </div>
        )}
      </div>

      <div className={shared.sectionCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <h3 className={shared.cardTitle} style={{ margin: 0 }}>Organization Members ({profiles.length})</h3>
          <button type="button" className={shared.button} disabled={!selectedMember} onClick={openEdit}>
            Edit employee
          </button>
        </div>
        <p className={shared.helpText}>Select an employee, then choose &ldquo;Edit employee&rdquo; to change their name, role or status.</p>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th style={{ width: '2.5rem', padding: '0.5rem' }} aria-label="Select" />
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Name</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Email</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Role</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((member) => {
                const isAdmin = member.role === ROLES.ADMIN;
                const selected = member.user_id === selectedId;
                return (
                  <tr
                    key={member.user_id}
                    onClick={() => !isAdmin && setSelectedId(selected ? null : member.user_id)}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      cursor: isAdmin ? 'default' : 'pointer',
                      background: selected ? 'rgba(106, 15, 26, 0.08)' : undefined,
                    }}
                  >
                    <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={isAdmin}
                        onChange={() => setSelectedId(selected ? null : member.user_id)}
                        onClick={(event) => event.stopPropagation()}
                        aria-label={`Select ${member.full_name || member.email}`}
                      />
                    </td>
                    <td style={{ padding: '0.5rem' }}>{member.full_name || 'No name set'}{member.user_id === currentUserId ? ' (you)' : ''}</td>
                    <td style={{ padding: '0.5rem' }}>{member.email || '-'}</td>
                    <td style={{ padding: '0.5rem' }}>{ROLE_LABELS[member.role] ?? member.role}</td>
                    <td style={{ padding: '0.5rem' }}>{member.is_active === false ? 'Deactivated' : 'Active'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
      </div>

      <EditEmployeeDialog edit={edit} setEdit={setEdit} busy={busy} onCancel={() => setEdit(null)} onSave={saveEdit} />
      <ConfirmDialog dialog={dialog} busy={busy} onCancel={() => setDialog(null)} onConfirm={confirmDialog} />
    </>
  );
}
