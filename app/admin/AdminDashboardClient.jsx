'use client';

import { useState } from 'react';
import shared from '../../styles/shared.module.css';
import styles from '../../styles/dashboard.module.css';
import { createSupabaseBrowserClient } from '../../lib/supabase/client';

export default function AdminDashboardClient({ adminRequests, allUsers, currentUserId, currentOrgId }) {
  const [requests, setRequests] = useState(adminRequests);
  const [users, setUsers] = useState(allUsers);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [activeTab, setActiveTab] = useState('requests');
  const supabase = createSupabaseBrowserClient();

  async function handleApproveRequest(userId, userEmail) {
    setLoading(true);
    setMessage('');
    setError(false);

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ 
          admin_request_status: 'approved',
          role: 'administrator'
        })
        .eq('user_id', userId);

      if (updateError) throw new Error(updateError.message);

      setRequests(prev => prev.filter(r => r.user_id !== userId));
      setUsers(prev => 
        prev.map(u => 
          u.user_id === userId 
            ? { ...u, admin_request_status: 'approved', role: 'administrator' }
            : u
        )
      );
      setMessage(`Admin request from ${userEmail} approved.`);
    } catch (err) {
      setError(true);
      setMessage(`Error approving request: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleRejectRequest(userId, userEmail) {
    setLoading(true);
    setMessage('');
    setError(false);

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ admin_request_status: 'rejected' })
        .eq('user_id', userId);

      if (updateError) throw new Error(updateError.message);

      setRequests(prev => prev.filter(r => r.user_id !== userId));
      setUsers(prev => 
        prev.map(u => 
          u.user_id === userId 
            ? { ...u, admin_request_status: 'rejected' }
            : u
        )
      );
      setMessage(`Admin request from ${userEmail} rejected.`);
    } catch (err) {
      setError(true);
      setMessage(`Error rejecting request: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateString) {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString();
  }

  const pendingCount = requests.length;
  const adminCount = users.filter(u => u.role === 'administrator').length;
  const staffCount = users.filter(u => u.role === 'staff').length;
  const lawyerCount = users.filter(u => u.role === 'lawyer').length;

  return (
    <>
      {/* Metrics Section */}
      <section className={styles.metricsGrid}>
        <article className={styles.metricCard}>
          <div className={styles.metricIconAmber} aria-hidden="true">!</div>
          <div>
            <p className={styles.metricLabel}>Pending Admin Requests</p>
            <h3 className={styles.metricValue}>{pendingCount}</h3>
          </div>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.metricIconGreen} aria-hidden="true">A</div>
          <div>
            <p className={styles.metricLabel}>Admins</p>
            <h3 className={styles.metricValue}>{adminCount}</h3>
          </div>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.metricIconBlue} aria-hidden="true">L</div>
          <div>
            <p className={styles.metricLabel}>Lawyers</p>
            <h3 className={styles.metricValue}>{lawyerCount}</h3>
          </div>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.metricIconGray} aria-hidden="true">S</div>
          <div>
            <p className={styles.metricLabel}>Staff</p>
            <h3 className={styles.metricValue}>{staffCount}</h3>
          </div>
        </article>
      </section>

      {/* Tab Navigation */}
      <div style={{ marginTop: '2rem', marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
        <button
          onClick={() => setActiveTab('requests')}
          className={`${shared.linkButton} ${activeTab === 'requests' ? shared.button : ''}`}
          style={{
            background: activeTab === 'requests' ? 'var(--crimson)' : 'transparent',
            color: activeTab === 'requests' ? '#fff' : 'var(--crimson)',
            fontWeight: 600
          }}
        >
          Admin Requests ({pendingCount})
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`${shared.linkButton} ${activeTab === 'users' ? shared.button : ''}`}
          style={{
            background: activeTab === 'users' ? 'var(--crimson)' : 'transparent',
            color: activeTab === 'users' ? '#fff' : 'var(--crimson)',
            fontWeight: 600
          }}
        >
          All Users ({users.length})
        </button>
      </div>

      {message && (
        <p className={`${shared.message} ${error ? shared.messageError : shared.messageSuccess}`}>
          {message}
        </p>
      )}

      {/* Admin Requests Tab */}
      {activeTab === 'requests' && (
        <section className={shared.sectionCard} style={{ marginTop: '1.5rem' }}>
          <h3 style={{ marginTop: 0, marginBottom: '1.5rem' }}>Pending Admin Access Requests</h3>
          {requests.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>No pending admin requests.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.95rem'
              }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', fontWeight: 600 }}>Name</th>
                    <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', fontWeight: 600 }}>Email</th>
                    <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', fontWeight: 600 }}>Note</th>
                    <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', fontWeight: 600 }}>Requested</th>
                    <th style={{ textAlign: 'center', padding: '0.75rem 0.5rem', fontWeight: 600 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((req) => (
                    <tr key={req.user_id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.75rem 0.5rem' }}>{req.full_name || '-'}</td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>{req.email}</td>
                      <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.9rem', color: 'var(--muted)' }}>
                        {req.admin_request_note || '-'}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.9rem', color: 'var(--muted)' }}>
                        {formatDate(req.admin_requested_at)}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                        <button
                          onClick={() => handleApproveRequest(req.user_id, req.email)}
                          disabled={loading}
                          style={{
                            background: '#047857',
                            color: '#fff',
                            border: 'none',
                            padding: '0.5rem 0.75rem',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            marginRight: '0.5rem',
                            fontSize: '0.85rem',
                            fontWeight: 600
                          }}
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleRejectRequest(req.user_id, req.email)}
                          disabled={loading}
                          style={{
                            background: '#dc2626',
                            color: '#fff',
                            border: 'none',
                            padding: '0.5rem 0.75rem',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: 600
                          }}
                        >
                          Reject
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* All Users Tab */}
      {activeTab === 'users' && (
        <section className={shared.sectionCard} style={{ marginTop: '1.5rem' }}>
          <h3 style={{ marginTop: 0, marginBottom: '1.5rem' }}>All Users</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.95rem'
            }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', fontWeight: 600 }}>Name</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', fontWeight: 600 }}>Email</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', fontWeight: 600 }}>Role</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', fontWeight: 600 }}>Admin Status</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', fontWeight: 600 }}>Org ID</th>
                </tr>
              </thead>
              <tbody>
                {users.map((usr) => (
                  <tr key={usr.user_id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.75rem 0.5rem' }}>{usr.full_name || '-'}</td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>{usr.email}</td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '0.25rem 0.75rem',
                        borderRadius: '12px',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        background: usr.role === 'administrator' ? '#dbeafe' :
                                    usr.role === 'lawyer' ? '#fef3c7' :
                                    '#e5e7eb',
                        color: usr.role === 'administrator' ? '#0369a1' :
                               usr.role === 'lawyer' ? '#92400e' :
                               '#4b5563'
                      }}>
                        {usr.role}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.9rem', color: 'var(--muted)' }}>
                      {usr.admin_request_status || 'none'}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.9rem', color: 'var(--muted)' }}>
                      {usr.org_id || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
