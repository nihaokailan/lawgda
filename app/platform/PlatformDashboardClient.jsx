'use client';

import { useCallback, useEffect, useState } from 'react';
import shared from '../../styles/shared.module.css';
import styles from '../../styles/dashboard.module.css';

/**
 * Default Admin's console: law firms and their Organization Admin accounts
 * only. Never fetches or renders a Lawyer/Staff name, email, or any
 * document/folder data — /api/platform/organizations enforces the same
 * restriction server-side.
 */
export default function PlatformDashboardClient({ currentUserId, pendingRequests, pendingRequestsError = '' }) {
  const [requests, setRequests] = useState(pendingRequests);
  const [organizations, setOrganizations] = useState([]);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminFullName, setAdminFullName] = useState('');

  const loadOrganizations = useCallback(async () => {
    setLoadingOrgs(true);
    const response = await fetch('/api/platform/organizations');
    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      setOrganizations(payload.organizations || []);
    }
    setLoadingOrgs(false);
  }, []);

  useEffect(() => {
    loadOrganizations();
  }, [loadOrganizations]);

  async function handleRequestAction(userId, email, action) {
    setLoading(true);
    setMessage('');
    setError(false);

    try {
      const response = await fetch(`/api/admin/admin-requests/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || 'Request failed.');
      }

      setRequests((prev) => prev.filter((r) => r.user_id !== userId));
      setMessage(`Request from ${email} ${action === 'approve' ? 'approved' : 'rejected'}.`);
      if (action === 'approve') {
        loadOrganizations();
      }
    } catch (err) {
      setError(true);
      setMessage(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateOrganization(event) {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    setError(false);

    try {
      const response = await fetch('/api/platform/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationName: orgName, adminEmail, adminFullName }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to create organization.');
      }

      setOrgName('');
      setAdminEmail('');
      setAdminFullName('');
      setMessage(`Organization created. Temporary admin password: ${payload.temporaryPassword}`);
      loadOrganizations();
    } catch (err) {
      setError(true);
      setMessage(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleOrgAdmin(orgId, action) {
    setLoading(true);
    setMessage('');
    setError(false);

    try {
      const response = await fetch(`/api/platform/organizations/${orgId}/admin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to update admin status.');
      }

      setMessage(`Admin account ${action === 'activate' ? 'activated' : 'deactivated'}.`);
      loadOrganizations();
    } catch (err) {
      setError(true);
      setMessage(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleOrgStatus(orgId, status) {
    setLoading(true);
    setMessage('');
    setError(false);

    try {
      const response = await fetch(`/api/platform/organizations/${orgId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to update organization status.');
      }

      setMessage(`Organization ${status === 'active' ? 'activated' : 'deactivated'}.`);
      loadOrganizations();
    } catch (err) {
      setError(true);
      setMessage(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <section className={styles.metricsGrid}>
        <article className={styles.metricCard}>
          <div className={styles.metricIconAmber} aria-hidden="true">!</div>
          <div>
            <p className={styles.metricLabel}>Pending Firm Requests</p>
            <h3 className={styles.metricValue}>{requests.length}</h3>
          </div>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.metricIconGreen} aria-hidden="true">F</div>
          <div>
            <p className={styles.metricLabel}>Law Firms</p>
            <h3 className={styles.metricValue}>{organizations.length}</h3>
          </div>
        </article>
      </section>

      {message && (
        <p className={`${shared.message} ${error ? shared.messageError : shared.messageSuccess}`}>{message}</p>
      )}

      {(pendingRequestsError || requests.length > 0) && (
        <section className={shared.sectionCard} style={{ marginTop: '1.5rem' }}>
          <h3 style={{ marginTop: 0 }}>Pending Firm Requests</h3>
          {pendingRequestsError ? (
            <p role="alert" style={{ color: 'var(--danger, #b42318)' }}>{pendingRequestsError}</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Requested by</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Email</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Organization</th>
                  <th style={{ textAlign: 'center', padding: '0.5rem' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => (
                  <tr key={req.user_id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.5rem' }}>{req.full_name || '-'}</td>
                    <td style={{ padding: '0.5rem' }}>{req.email}</td>
                    <td style={{ padding: '0.5rem' }}>{req.requested_org_name}</td>
                    <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                      <button
                        disabled={loading}
                        onClick={() => handleRequestAction(req.user_id, req.email, 'approve')}
                        style={{ background: '#047857', color: '#fff', border: 'none', padding: '0.4rem 0.7rem', borderRadius: '6px', marginRight: '0.5rem', cursor: 'pointer' }}
                      >
                        Approve
                      </button>
                      <button
                        disabled={loading}
                        onClick={() => handleRequestAction(req.user_id, req.email, 'reject')}
                        style={{ background: '#dc2626', color: '#fff', border: 'none', padding: '0.4rem 0.7rem', borderRadius: '6px', cursor: 'pointer' }}
                      >
                        Reject
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      <section className={shared.sectionCard} style={{ marginTop: '1.5rem' }}>
        <h3 style={{ marginTop: 0 }}>Create a Law Firm</h3>
        <form onSubmit={handleCreateOrganization} className={shared.formGrid}>
          <label className={shared.fieldLabel}>
            Organization name
            <input className={shared.input} value={orgName} onChange={(e) => setOrgName(e.target.value)} required />
          </label>
          <label className={shared.fieldLabel}>
            Admin email
            <input type="email" className={shared.input} value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required />
          </label>
          <label className={shared.fieldLabel}>
            Admin full name
            <input className={shared.input} value={adminFullName} onChange={(e) => setAdminFullName(e.target.value)} />
          </label>
          <button type="submit" disabled={loading} className={shared.button}>Create Firm + Admin</button>
        </form>
      </section>

      <section className={shared.sectionCard} style={{ marginTop: '1.5rem' }}>
        <h3 style={{ marginTop: 0 }}>Law Firms</h3>
        {loadingOrgs ? (
          <p>Loading…</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Firm</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Status</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Admin</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Admin status</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Users</th>
                <th style={{ textAlign: 'center', padding: '0.5rem' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {organizations.map((org) => {
                const admin = org.admins?.[0];
                return (
                  <tr key={org.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.5rem' }}>{org.name}</td>
                    <td style={{ padding: '0.5rem' }}>{org.status}</td>
                    <td style={{ padding: '0.5rem' }}>{admin ? `${admin.fullName || '-'} (${admin.email})` : 'No admin yet'}</td>
                    <td style={{ padding: '0.5rem' }}>{admin ? (admin.isActive ? 'Active' : 'Deactivated') : '-'}</td>
                    <td style={{ padding: '0.5rem' }}>{org.userCount}</td>
                    <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                      <button
                        disabled={loading}
                        onClick={() => handleToggleOrgStatus(org.id, org.status === 'active' ? 'inactive' : 'active')}
                        style={{ background: '#334155', color: '#fff', border: 'none', padding: '0.4rem 0.7rem', borderRadius: '6px', marginRight: '0.5rem', cursor: 'pointer' }}
                      >
                        {org.status === 'active' ? 'Deactivate firm' : 'Activate firm'}
                      </button>
                      {admin && (
                        <button
                          disabled={loading}
                          onClick={() => handleToggleOrgAdmin(org.id, admin.isActive ? 'deactivate' : 'activate')}
                          style={{ background: admin.isActive ? '#dc2626' : '#047857', color: '#fff', border: 'none', padding: '0.4rem 0.7rem', borderRadius: '6px', cursor: 'pointer' }}
                        >
                          {admin.isActive ? 'Deactivate admin' : 'Activate admin'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
