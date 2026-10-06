'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import UploadModal from '../components/UploadModal';
import Pagination from '../components/Pagination';
import SignNowButton from '../components/SignNowButton';
import styles from '../../styles/documents.module.css';

const PAGE_SIZE = 8;

type DocumentRow = {
  id: string;
  title: string;
  status: string;
  createdAt: string | null;
  ownerLabel: string;
  ownerInitials: string;
  tags: string[];
  myAction?: 'sign' | 'waiting' | null;
};

const FILTERS = [
  'All Documents',
  'Pending Signatures',
  'Filed',
  'Signed',
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

const STATUS_PILL_CLASS: Record<string, string> = {
  Filed: 'statusPillCompleted',
  Signed: 'statusPillCompleted',
  Pending: 'statusPillPending',
  Drafts: 'statusPillDrafts',
  Cancelled: 'statusPillDenied',
  Denied: 'statusPillDenied',
  Declined: 'statusPillDenied',
};

export default function DocumentsWorkspaceClient({ documents }: { documents: DocumentRow[] }) {
  const router = useRouter();
  const [visibleDocuments, setVisibleDocuments] = useState(documents);
  const [filter, setFilter] = useState('All Documents');
  const [query, setQuery] = useState('');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [page, setPage] = useState(1);

  const statusSummary = useMemo(() => {
    const counts: Record<string, number> = {
      'All Documents': visibleDocuments.length,
      'Pending Signatures': 0,
      Filed: 0,
      Signed: 0,
      Pending: 0,
      Drafts: 0,
      Cancelled: 0,
      Denied: 0,
      Declined: 0,
    };

    visibleDocuments.forEach((row) => {
      if (counts[row.status] !== undefined) {
        counts[row.status] += 1;
      }
      if (row.status === 'Pending') {
        counts['Pending Signatures'] += 1;
      }
    });

    return counts;
  }, [visibleDocuments]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return visibleDocuments.filter((row) => {
      if (!matchesFilter(filter, row)) return false;
      if (!q) return true;
      return row.title.toLowerCase().includes(q) || row.status.toLowerCase().includes(q) || row.ownerLabel.toLowerCase().includes(q);
    });
  }, [visibleDocuments, filter, query]);

  useEffect(() => {
    setPage(1);
  }, [filter, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedDocuments = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function handleUploaded(document: { id: string | null; title: string; status: string; createdAt: string | null }) {
    if (!document.id) return;

    setVisibleDocuments((current) => [
      {
        id: document.id as string,
        title: document.title,
        status: 'Drafts',
        createdAt: document.createdAt,
        ownerLabel: 'You',
        ownerInitials: 'YO',
        tags: ['Legal'],
      },
      ...current.filter((row) => row.id !== document.id),
    ]);
    setIsUploadOpen(false);
  }

  return (
    <section className={styles.docsShell}>
      <header className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Document Section</h2>
        <div className={styles.topActions}>
          <Link href="/verify" className={styles.verifyButton}>Verify Document</Link>
          <button type="button" className={styles.prepareButton} onClick={() => setIsUploadOpen(true)}>
            Upload Document
          </button>
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
              </tr>
            </thead>
            <tbody>
              {pagedDocuments.map((row) => (
                <tr
                  key={row.id}
                  tabIndex={0}
                  role="link"
                  style={{ cursor: 'pointer' }}
                  onClick={() => router.push(`/documents/${row.id}/prepare`)}
                  onKeyDown={(event) => { if (event.key === 'Enter') router.push(`/documents/${row.id}/prepare`); }}
                >
                  <td>{row.title}</td>
                  <td>
                    {row.myAction === 'sign' ? (
                      <SignNowButton documentId={row.id} label="Pending your signature — Sign now" className={`${styles.statusPill} ${styles.statusPillPending}`} style={{ cursor: 'pointer', border: 0 }} />
                    ) : row.myAction === 'waiting' ? (
                      <span className={`${styles.statusPill} ${styles.statusPillDrafts}`}>Waiting for other signers</span>
                    ) : (
                      <span className={`${styles.statusPill} ${styles[STATUS_PILL_CLASS[row.status] || 'statusPillDrafts']}`}>{row.status}</span>
                    )}
                  </td>
                  <td>{row.ownerLabel}</td>
                  <td>{formatDate(row.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
      </div>

      <UploadModal
        open={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploaded={handleUploaded}
        redirectOnUpload
      />
    </section>
  );
}
