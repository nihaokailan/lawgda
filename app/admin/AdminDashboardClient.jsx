'use client';

import styles from '../../styles/dashboard.module.css';

/**
 * Organization Admin dashboard: this firm's own users only. Admin requests
 * (creating a new firm + its Admin) are a Default Admin action handled at
 * /platform, not here — Organization Admin can manage Lawyers/Staff but
 * never provisions other Admins.
 */
export default function AdminDashboardClient({ allUsers, currentUserId, currentOrgId }) {
  const users = allUsers;
  const adminCount = users.filter(u => u.role === 'admin').length;
  const staffCount = users.filter(u => u.role === 'staff').length;
  const lawyerCount = users.filter(u => u.role === 'lawyer').length;

  return (
    <>
      {/* Metrics Section */}
      <section className={styles.metricsGrid}>
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

      <section style={{ marginTop: '1.5rem' }}>
        <h3 style={{ marginTop: 0, marginBottom: '1.5rem' }}>Your Organization&apos;s Users</h3>
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
                      background: usr.role === 'admin' ? '#dbeafe' :
                                  usr.role === 'lawyer' ? '#fef3c7' :
                                  '#e5e7eb',
                      color: usr.role === 'admin' ? '#0369a1' :
                             usr.role === 'lawyer' ? '#92400e' :
                             '#4b5563'
                    }}>
                      {usr.role}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
