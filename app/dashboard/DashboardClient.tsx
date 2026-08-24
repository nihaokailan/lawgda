'use client';

import { useMemo, useState } from 'react';
import StatusBadge from '../components/StatusBadge';
import DocumentRowActionsDropdown from '../components/DocumentRowActionsDropdown';
import UploadModal from '../components/UploadModal';
import VerifyModal from '../components/VerifyModal';
import ScanModal from '../components/ScanModal';
import styles from '../../styles/dashboard.module.css';

type DashboardDocument = {
  id: string | null;
  title: string;
  status: 'Drafting' | 'Pending' | 'Signed' | 'Filed';
  sha256Hash: string | null;
  createdAt: string | null;
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
}: {
  initialDocuments: DashboardDocument[];
  initialMetrics: DashboardMetrics;
}) {
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isVerifyOpen, setIsVerifyOpen] = useState(false);
  const [isScanOpen, setIsScanOpen] = useState(false);
  const [documents, setDocuments] = useState<DashboardDocument[]>(initialDocuments);
  const [metrics, setMetrics] = useState<DashboardMetrics>(initialMetrics);

  const totalDocs = useMemo(
    () => metrics.Drafting + metrics.Pending + metrics.Signed + metrics.Filed,
    [metrics]
  );

  function onDocumentCreated(newDocument: DashboardDocument) {
    const nextDocs = [newDocument, ...documents].slice(0, 20);
    setDocuments(nextDocs);
    setMetrics((prev) => ({
      ...prev,
      Drafting: prev.Drafting + 1,
    }));
  }

  return (
    <>
      <section className={styles.banner}>
        <p className={styles.bannerLabel}>LAWDGA Workspace</p>
        <h2 className={styles.bannerTitle}>Legal Document Operations Dashboard</h2>
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
                {documents.map((document) => (
                  <tr key={document.id ?? `${document.title}-${document.createdAt}`}>
                    <td>{document.title}</td>
                    <td>
                      <StatusBadge status={document.status} />
                    </td>
                    <td className={styles.monoCell}>{hashSnippet(document.sha256Hash)}</td>
                    <td>{formatDate(document.createdAt)}</td>
                    <td>
                      <DocumentRowActionsDropdown document={document} openUp={documents.length <= 3} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <UploadModal open={isUploadOpen} onClose={() => setIsUploadOpen(false)} onUploaded={onDocumentCreated} />
      <VerifyModal open={isVerifyOpen} onClose={() => setIsVerifyOpen(false)} />
      <ScanModal open={isScanOpen} onClose={() => setIsScanOpen(false)} />
    </>
  );
}
