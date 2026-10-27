'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import StatusDialog from '../components/StatusDialog';
import styles from '../../styles/dashboard.module.css';

type CaseRow = {
  id: string;
  title: string;
  caseNumber: string | null;
  documentCount: number;
  createdAt: string;
};

export default function CaseFoldersClient({ cases }: { cases: CaseRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', caseNumber: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cases;
    return cases.filter((row) => row.title.toLowerCase().includes(q) || (row.caseNumber ?? '').toLowerCase().includes(q));
  }, [cases, query]);

  async function createCase(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to create the case.');
      router.push(`/cases/${payload.case.id}`);
    } catch (failure) {
      setMessage(failure instanceof Error ? failure.message : 'Unable to create the case.');
      setBusy(false);
    }
  }

  return (
    <>
      <section className={styles.quickActions}>
        <div className={styles.queueHeader}>
          <h3 className={styles.sectionTitle}>Case Folders</h3>
          <span className={styles.queueCount}>{cases.length}</span>
        </div>
        <p className={styles.infoText}>
          A case folder groups a case&apos;s documents. Open one to add documents and print the QR label for the physical folder.
        </p>
        <div className={styles.quickActionRow}>
          <button type="button" className={styles.primaryActionButton} onClick={() => setCreating(true)} disabled={creating}>
            New case
          </button>
        </div>

        {creating && (
          <form onSubmit={createCase} className={styles.modalBody} style={{ marginTop: '1rem' }}>
            <label className={styles.modalLabel}>
              Case title
              <input className={styles.modalInput} value={form.title} maxLength={200} required placeholder="for ex. People v. Santos" onChange={(event) => setForm({ ...form, title: event.target.value })} />
            </label>
            <label className={styles.modalLabel}>
              Case number (optional)
              <input className={styles.modalInput} value={form.caseNumber} maxLength={80} placeholder="for ex. Civil Case No. R-DVO-26-01234" onChange={(event) => setForm({ ...form, caseNumber: event.target.value })} />
            </label>
            <div className={styles.modalActions}>
              <button type="submit" className={styles.primaryActionButton} disabled={busy}>{busy ? 'Creating...' : 'Create case'}</button>
              <button type="button" className={styles.secondaryActionButton} disabled={busy} onClick={() => { setCreating(false); setForm({ title: '', caseNumber: '' }); }}>Cancel</button>
            </div>
          </form>
        )}
      </section>

      <section className={styles.workspaceCard}>
        <input
          className={styles.modalInput}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by case title or case number"
          aria-label="Search case folders"
          style={{ marginBottom: '1rem' }}
        />
        {filtered.length === 0 ? (
          <p className={styles.emptyText}>{cases.length === 0 ? 'No case folders yet. Create one to get started.' : 'No case folders match your search.'}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Case</th>
                  <th>Case number</th>
                  <th>Documents</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <td><Link href={`/cases/${row.id}`}>{row.title}</Link></td>
                    <td>{row.caseNumber || '—'}</td>
                    <td>{row.documentCount}</td>
                    <td>{new Date(row.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <StatusDialog message={message} error onClose={() => setMessage('')} />
    </>
  );
}
