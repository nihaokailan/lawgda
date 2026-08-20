'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import styles from '../../styles/documents.module.css';

type DocumentRow = {
  id: string;
  title: string;
  status: string;
  createdAt: string | null;
  ownerLabel: string;
  ownerInitials: string;
  tags: string[];
};

const FILTERS = [
  'All Documents',
  'Pending Signatures',
  'Completed',
  'Pending',
  'Drafts',
  'Cancelled',
  'Denied',
  'Declined',
];

function formatDate(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  return date.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function matchesFilter(filter: string, row: DocumentRow) {
  if (filter === 'All Documents') return true;
  if (filter === 'Pending Signatures') return row.status === 'Pending';
  return row.status === filter;
}

export default function DocumentsWorkspaceClient({ documents }: { documents: DocumentRow[] }) {
  const [filter, setFilter] = useState('All Documents');
  const [query, setQuery] = useState('');

  const statusSummary = useMemo(() => {
    const counts: Record<string, number> = {
      'All Documents': documents.length,
      'Pending Signatures': 0,
      Completed: 0,
      Pending: 0,
      Drafts: 0,
      Cancelled: 0,
      Denied: 0,
      Declined: 0,
    };

    documents.forEach((row) => {
      if (counts[row.status] !== undefined) {
        counts[row.status] += 1;
      }
      if (row.status === 'Pending') {
        counts['Pending Signatures'] += 1;
      }
    });

    return counts;
  }, [documents]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return documents.filter((row) => {
      if (!matchesFilter(filter, row)) return false;
      if (!q) return true;
      return row.title.toLowerCase().includes(q) || row.status.toLowerCase().includes(q) || row.ownerLabel.toLowerCase().includes(q);
    });
  }, [documents, filter, query]);

  return (
    <section className={styles.docsShell}>
      <header className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Document Section</h2>
        <div className={styles.topActions}>
          <Link href="/verify" className={styles.verifyButton}>Verify Document</Link>
          <Link href="/dashboard" className={styles.prepareButton}>Upload Document</Link>
        </div>
      </header>

      <div className={styles.summaryRow}>
        {FILTERS.map((item) => (
          <article key={`summary-${item}`} className={styles.summaryCard}>
            <p className={styles.summaryLabel}>{item}</p>
            <p className={styles.summaryValue}>{statusSummary[item] || 0}</p>
          </article>
        ))}
      </div>

      <div className={styles.filterRow}>
        {FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            className={`${styles.filterButton} ${filter === item ? styles.filterButtonActive : ''}`}
            onClick={() => setFilter(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <div className={styles.searchRow}>
        <input
          className={styles.searchInput}
          placeholder="Search document title, status, or owner"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className={styles.resultsWrap}>
        {filtered.length === 0 && <p className={styles.emptyState}>No documents in this view.</p>}

        {filtered.length > 0 && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Document</th>
                <th>Status</th>
                <th>Owner</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id}>
                  <td>{row.title}</td>
                  <td><span className={styles.statusPill}>{row.status}</span></td>
                  <td>{row.ownerLabel}</td>
                  <td>{formatDate(row.createdAt)}</td>
                  <td>
                    <Link href={`/documents/${row.id}/edit`} className={styles.openLink}>Open</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
