'use client';

import { useMemo, useState } from 'react';
import UploadToCaseModal from '../../components/UploadToCaseModal';
import AddSignerModal from '../../components/AddSignerModal';
import styles from '../../../styles/dashboard.module.css';

type CaseDocument = {
  id: string;
  title: string;
  filePath: string;
  sha256Hash: string | null;
  status: 'Drafting' | 'Pending' | 'Signed' | 'Filed';
  createdAt: string;
  ownerId: string;
};

function hashSnippet(value: string | null) {
  if (!value) return '-';
  return value.length > 14 ? `${value.slice(0, 10)}...` : value;
}

export default function CaseDetailClient({
  caseId,
  caseTitle,
  isOwner,
  documents,
}: {
  caseId: string;
  caseTitle: string;
  isOwner: boolean;
  documents: CaseDocument[];
}) {
  const [isUploadOpen, setUploadOpen] = useState(false);
  const [signerDocumentId, setSignerDocumentId] = useState<string | null>(null);

  const sortedDocuments = useMemo(
    () => [...documents].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [documents]
  );

  return (
    <>
      <section className={styles.banner}>
        <p className={styles.bannerLabel}>Case Workspace</p>
        <h2 className={styles.bannerTitle}>{caseTitle}</h2>
        <p className={styles.bannerSubtitle}>{isOwner ? 'Owner access' : 'Signer access'}: document visibility is permission-scoped.</p>
      </section>

      <section className={styles.quickActions}>
        <div className={styles.queueHeader}>
          <h3 className={styles.sectionTitle}>Quick Actions</h3>
          <span className={styles.queueCount}>{sortedDocuments.length}</span>
        </div>
        <div className={styles.quickActionRow}>
          {isOwner && (
            <button type="button" className={styles.primaryActionButton} onClick={() => setUploadOpen(true)}>
              Upload to Case
            </button>
          )}
        </div>
      </section>

      <section className={styles.workspaceCard}>
        <h3 className={styles.sectionTitle}>Case Documents</h3>
        {sortedDocuments.length === 0 && <p className={styles.emptyText}>No visible documents for this case.</p>}

        {sortedDocuments.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>SHA-256</th>
                  <th>Created</th>
                  <th>File Path</th>
                  {isOwner && <th>Permission</th>}
                </tr>
              </thead>
              <tbody>
                {sortedDocuments.map((document) => (
                  <tr key={document.id}>
                    <td>{document.title}</td>
                    <td>{document.status}</td>
                    <td className={styles.monoCell}>{hashSnippet(document.sha256Hash)}</td>
                    <td>{new Date(document.createdAt).toLocaleString()}</td>
                    <td className={styles.monoCell}>{document.filePath}</td>
                    {isOwner && (
                      <td>
                        <button
                          type="button"
                          className={styles.secondaryActionButton}
                          onClick={() => setSignerDocumentId(document.id)}
                        >
                          Add Signer
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <UploadToCaseModal
        open={isUploadOpen}
        caseId={caseId}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => window.location.reload()}
      />

      {signerDocumentId && (
        <AddSignerModal
          open={Boolean(signerDocumentId)}
          documentId={signerDocumentId}
          onClose={() => setSignerDocumentId(null)}
          onChanged={() => window.location.reload()}
        />
      )}
    </>
  );
}
