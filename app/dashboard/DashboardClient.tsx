'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import StatusBadge from '../components/StatusBadge';
import UploadModal from '../components/UploadModal';
import VerifyModal from '../components/VerifyModal';
import ScanModal from '../components/ScanModal';
import Pagination from '../components/Pagination';
import SignNowButton from '../components/SignNowButton';
import styles from '../../styles/dashboard.module.css';
import { rememberDocumentOrigin } from '../../lib/documentOrigin';

const PAGE_SIZE = 8;

type DashboardDocument = {
  id: string | null;
  title: string;
  status: 'Drafting' | 'Pending' | 'Signed' | 'Filed';
  sha256Hash: string | null;
  createdAt: string | null;
  myAction?: 'sign' | 'waiting' | null;
};

type DashboardMetrics = {
  Drafting: number;
  Pending: number;
  Signed: number;
  Filed: number;
};

type DashboardActivity = {
  id: string;
  documentId: string;
  documentTitle: string;
  eventType: string;
  label: string;
  createdAt: string;
};

function formatDate(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatActivityDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function hashSnippet(value: string | null) {
  if (!value) return '-';
  const normalized = String(value).replace(/^0x/i, '').replace(/\s+/g, '');
  if (normalized.length < 8) return `0x${normalized}`;
  return `0x${normalized.slice(0, 4)}...${normalized.slice(-4)}`;
}

export default function DashboardClient({
  initialDocuments,
  initialMetrics,
  initialActivity,
  activityUnavailable,
  userName,
}: {
  initialDocuments: DashboardDocument[];
  initialMetrics: DashboardMetrics;
  initialActivity: DashboardActivity[];
  activityUnavailable: boolean;
  userName: string;
}) {
  const router = useRouter();
  useEffect(() => { rememberDocumentOrigin('/dashboard'); }, []);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isVerifyOpen, setIsVerifyOpen] = useState(false);
  const [isScanOpen, setIsScanOpen] = useState(false);
  const [documents, setDocuments] = useState<DashboardDocument[]>(initialDocuments);
  const [metrics, setMetrics] = useState<DashboardMetrics>(initialMetrics);
  const [activity] = useState<DashboardActivity[]>(initialActivity);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const signatureDocuments = documents.filter((document) => document.myAction === 'sign');
  const draftDocuments = documents.filter((document) => document.status === 'Drafting');
  const showAttention = signatureDocuments.length > 0 || draftDocuments.length > 0;
  const showActivity = activityUnavailable || activity.length > 0;

  const searchableDocuments = documents.filter((document) => {
    const searchValue = search.trim().toLowerCase();
    return !searchValue
      || document.title.toLowerCase().includes(searchValue)
      || (document.sha256Hash ?? '').toLowerCase().includes(searchValue);
  });
  const pageCount = Math.max(1, Math.ceil(searchableDocuments.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedDocuments = searchableDocuments.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function onDocumentCreated(newDocument: DashboardDocument) {
    const nextDocs = [newDocument, ...documents].slice(0, 20);
    setDocuments(nextDocs);
    setMetrics((prev) => ({
      ...prev,
      Drafting: prev.Drafting + 1,
    }));
    setPage(1);
  }

  return (
    <>
      <div className={styles.dashboardContent}>
        <section className={styles.welcomeSection}>
          <div>
            <h1 className={styles.welcomeTitle}>Welcome back, {userName}</h1>
            <p className={styles.welcomeSubtitle}>
              {signatureDocuments.length > 0
                ? `${signatureDocuments.length} ${signatureDocuments.length === 1 ? 'document is' : 'documents are'} waiting on your signature.`
                : 'Find a document, upload a new one, or see what needs your attention.'}
            </p>
          </div>
          <div className={styles.welcomeActions}>
            <button type="button" className={styles.primaryActionButton} onClick={() => setIsUploadOpen(true)}>
              Upload document
            </button>
            <button type="button" className={styles.secondaryActionButton} onClick={() => setIsVerifyOpen(true)}>
              Verify a document
            </button>
            <button type="button" className={styles.tertiaryActionButton} onClick={() => setIsScanOpen(true)}>
              Scan QR
            </button>
          </div>
        </section>

        <section className={styles.metricsGrid} aria-label="Document status summary">
          <article className={styles.metricCard}>
            <div className={styles.metricHeading}><span className={styles.metricDotGray} />Drafting</div>
            <h3 className={styles.metricValue}>{metrics.Drafting}</h3>
            <p className={styles.metricDescription}>Uploaded, not yet sent</p>
          </article>
          <article className={styles.metricCard}>
            <div className={styles.metricHeading}><span className={styles.metricDotAmber} />Pending signature</div>
            <h3 className={styles.metricValue}>{metrics.Pending}</h3>
            <p className={styles.metricDescription}>Waiting on signers</p>
          </article>
          <article className={styles.metricCard}>
            <div className={styles.metricHeading}><span className={styles.metricDotGreen} />Signed</div>
            <h3 className={styles.metricValue}>{metrics.Signed}</h3>
            <p className={styles.metricDescription}>Signature completed</p>
          </article>
          <article className={styles.metricCard}>
            <div className={styles.metricHeading}><span className={styles.metricDotBlue} />Filed</div>
            <h3 className={styles.metricValue}>{metrics.Filed}</h3>
            <p className={styles.metricDescription}>Filed for safekeeping</p>
          </article>
        </section>

        <div className={`${styles.dashboardColumns} ${!showAttention && !showActivity ? styles.dashboardColumnsFull : ''}`}>
          <section className={`${styles.workspaceCard} ${styles.recentDocumentsCard}`}>
            <div className={styles.cardHeader}>
              <h3 className={styles.sectionTitle}>Recent documents</h3>
              <div className={styles.recentDocumentTools}>
                <label className={styles.searchBox}>
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <circle cx="8.5" cy="8.5" r="5.5" />
                    <path d="m13 13 4 4" />
                  </svg>
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                    placeholder="Search documents"
                    aria-label="Search documents by name or verification code"
                  />
                </label>
                <Link href="/cases" className={styles.viewAllLink}>View all</Link>
              </div>
            </div>
            {searchableDocuments.length === 0 && (
              <p className={styles.emptyText}>
                {documents.length === 0 ? 'No documents yet. Upload a PDF to get started.' : 'No documents match your search.'}
              </p>
            )}
            {searchableDocuments.length > 0 && (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Document</th>
                      <th>Status</th>
                      <th>Verification code</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedDocuments.map((document) => (
                      <tr
                        key={document.id ?? `${document.title}-${document.createdAt}`}
                        className={document.myAction === 'sign' ? styles.rowNeedsAction : undefined}
                        style={{ cursor: document.id ? 'pointer' : undefined }}
                        tabIndex={document.id ? 0 : undefined}
                        role={document.id ? 'link' : undefined}
                        onClick={() => { if (document.id) router.push(`/documents/${document.id}`); }}
                        onKeyDown={(event) => { if (event.key === 'Enter' && document.id) router.push(`/documents/${document.id}`); }}
                      >
                        <td className={styles.documentNameCell}>
                          <span className={styles.documentGlyph} aria-hidden="true">▤</span>
                          <span className={styles.documentTitle}>{document.title}</span>
                        </td>
                        <td>
                          {document.id && document.myAction === 'sign' ? (
                            <SignNowButton documentId={document.id} label="Sign now" className={`${styles.statusBadge} ${styles.badgeAction}`} />
                          ) : document.myAction === 'waiting' ? (
                            <span className={`${styles.statusBadge} ${styles.badgeDrafting}`}>Awaiting others</span>
                          ) : (
                            <StatusBadge status={document.status} />
                          )}
                        </td>
                        <td className={styles.monoCell}>{hashSnippet(document.sha256Hash)}</td>
                        <td>{formatDate(document.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
              </div>
            )}
          </section>

          {(showAttention || showActivity) && (
            <aside className={styles.dashboardAside}>
              {showAttention && (
                <section className={`${styles.workspaceCard} ${styles.attentionCard}`}>
                  <h3 className={styles.sectionTitle}>Needs your attention</h3>
                  {signatureDocuments.length > 0 && (
                    <Link
                      href={signatureDocuments.length === 1 && signatureDocuments[0].id ? `/documents/${signatureDocuments[0].id}` : '/cases'}
                      className={`${styles.attentionItem} ${styles.attentionPending}`}
                    >
                      <span className={styles.attentionIcon} aria-hidden="true">◷</span>
                      <span><strong>{signatureDocuments.length} {signatureDocuments.length === 1 ? 'document awaits' : 'documents await'} your signature</strong><small>{signatureDocuments.length === 1 ? 'Open it to sign' : 'Open Documents to sign them'}</small></span>
                    </Link>
                  )}
                  {draftDocuments.length > 0 && (
                    <Link href="/cases" className={`${styles.attentionItem} ${styles.attentionDraft}`}>
                      <span className={styles.attentionIcon} aria-hidden="true">▤</span>
                      <span><strong>{draftDocuments.length} {draftDocuments.length === 1 ? 'draft' : 'drafts'} in progress</strong><small>Review your drafts</small></span>
                    </Link>
                  )}
                </section>
              )}

              {showActivity && (
                <section className={`${styles.workspaceCard} ${styles.activityCard}`}>
                  <h3 className={styles.sectionTitle}>Recent activity</h3>
                  {activityUnavailable && <p className={styles.emptyAsideText}>The audit trail is temporarily unavailable.</p>}
                  {!activityUnavailable && (
                    <ol className={styles.activityTimeline}>
                      {activity.map((entry) => (
                        <li className={styles.activityEntry} key={entry.id}>
                          <span className={`${styles.activityDot} ${entry.eventType.includes('sign') ? styles.activityDotSigned : entry.eventType.includes('file') ? styles.activityDotFiled : ''}`} />
                          <span className={styles.activityCopy}>
                            <Link href={`/documents/${entry.documentId}`} className={styles.activityLink}>{entry.documentTitle}</Link>
                            <span>{entry.label}</span>
                            <time dateTime={entry.createdAt}>{formatActivityDate(entry.createdAt)}</time>
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              )}
            </aside>
          )}
        </div>
      </div>

      <UploadModal open={isUploadOpen} onClose={() => setIsUploadOpen(false)} onUploaded={onDocumentCreated} />
      <VerifyModal open={isVerifyOpen} onClose={() => setIsVerifyOpen(false)} />
      <ScanModal open={isScanOpen} onClose={() => setIsScanOpen(false)} />
    </>
  );
}
