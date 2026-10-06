'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import StatusBadge from '../components/StatusBadge';
import DocumentRowActionsDropdown from '../components/DocumentRowActionsDropdown';
import UploadModal from '../components/UploadModal';
import VerifyModal from '../components/VerifyModal';
import ScanModal from '../components/ScanModal';
import Pagination from '../components/Pagination';
import SignNowButton from '../components/SignNowButton';
import styles from '../../styles/dashboard.module.css';

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

function formatDate(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
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
  userName,
}: {
  initialDocuments: DashboardDocument[];
  initialMetrics: DashboardMetrics;
  userName: string;
}) {
  const router = useRouter();
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isVerifyOpen, setIsVerifyOpen] = useState(false);
  const [isScanOpen, setIsScanOpen] = useState(false);
  const [documents, setDocuments] = useState<DashboardDocument[]>(initialDocuments);
  const [metrics, setMetrics] = useState<DashboardMetrics>(initialMetrics);
  const [page, setPage] = useState(1);

  const totalDocs = useMemo(
    () => metrics.Drafting + metrics.Pending + metrics.Signed + metrics.Filed,
    [metrics]
  );

  const pageCount = Math.max(1, Math.ceil(documents.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedDocuments = documents.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

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
        <section className={styles.banner}>
          <p className={styles.bannerLabel}>LAWDGA Workspace</p>
          <h2 className={styles.bannerTitle}>Welcome, {userName}!</h2>
          <p className={styles.bannerSubtitle}>Track drafting progress, verify integrity, and inspect audit history from one workspace.</p>
        </section>

        <section className={styles.metricsGrid}>
        <article className={styles.metricCard}>
          <div className={styles.metricIconGray} aria-hidden="true">D</div>
          <div>
            <p className={styles.metricLabel}>Drafting</p>
            <h3 className={styles.metricValue}>{metrics.Drafting}</h3>
          </div>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.metricIconAmber} aria-hidden="true">!</div>
          <div>
            <p className={styles.metricLabel}>Pending</p>
            <h3 className={styles.metricValue}>{metrics.Pending}</h3>
          </div>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.metricIconGreen} aria-hidden="true">S</div>
          <div>
            <p className={styles.metricLabel}>Signed</p>
            <h3 className={styles.metricValue}>{metrics.Signed}</h3>
          </div>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.metricIconBlue} aria-hidden="true">F</div>
          <div>
            <p className={styles.metricLabel}>Filed</p>
            <h3 className={styles.metricValue}>{metrics.Filed}</h3>
          </div>
        </article>
      </section>

      <section className={styles.quickActions}>
        <div className={styles.queueHeader}>
          <h3 className={styles.sectionTitle}>Quick Actions</h3>
          <span className={styles.queueCount}>{totalDocs}</span>
        </div>
        <div className={styles.quickActionRow}>
          <button type="button" className={styles.primaryActionButton} onClick={() => setIsUploadOpen(true)}>
            Upload Document
          </button>
          <button type="button" className={styles.secondaryActionButton} onClick={() => setIsVerifyOpen(true)}>
            Verify Document
          </button>
          <button type="button" className={styles.secondaryActionButton} onClick={() => setIsScanOpen(true)}>
            Scan QR
          </button>
        </div>
      </section>

      <section className={styles.workspaceCard}>
        <h3 className={styles.sectionTitle}>Recent Documents</h3>
        {documents.length === 0 && <p className={styles.emptyText}>No documents yet. Upload a PDF to begin.</p>}
        {documents.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Document Name</th>
                  <th>Status</th>
                  <th>SHA-256</th>
                  <th>Uploaded Date</th>
                  <th aria-label="actions">...</th>
                </tr>
              </thead>
              <tbody>
                {pagedDocuments.map((document) => (
                  <tr
                    key={document.id ?? `${document.title}-${document.createdAt}`}
                    style={{ cursor: document.id ? 'pointer' : undefined }}
                    onClick={() => { if (document.id) router.push(`/documents/${document.id}/prepare`); }}
                  >
                    <td>{document.title}</td>
                    <td>
                      {document.id && document.myAction === 'sign' ? (
                        <SignNowButton documentId={document.id} label="Pending your signature — Sign now" className={`${styles.statusBadge} ${styles.badgePending}`} style={{ cursor: 'pointer', border: 0 }} />
                      ) : document.myAction === 'waiting' ? (
                        <span className={`${styles.statusBadge} ${styles.badgeDrafting}`}>Waiting for other signers</span>
                      ) : (
                        <StatusBadge status={document.status} />
                      )}
                    </td>
                    <td className={styles.monoCell}>{hashSnippet(document.sha256Hash)}</td>
                    <td>{formatDate(document.createdAt)}</td>
                    <td onClick={(event) => event.stopPropagation()}>
                      <DocumentRowActionsDropdown document={document} openUp={pagedDocuments.length <= 3} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
          </div>
        )}
      </section>
      </div>

      <UploadModal open={isUploadOpen} onClose={() => setIsUploadOpen(false)} onUploaded={onDocumentCreated} />
      <VerifyModal open={isVerifyOpen} onClose={() => setIsVerifyOpen(false)} />
      <ScanModal open={isScanOpen} onClose={() => setIsScanOpen(false)} />
    </>
  );
}
