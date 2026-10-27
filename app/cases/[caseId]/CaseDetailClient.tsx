'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import UploadToCaseModal from '../../components/UploadToCaseModal';
import AddSignerModal from '../../components/AddSignerModal';
import CaseQrCard from '../../components/CaseQrCard';
import StatusDialog from '../../components/StatusDialog';
import AuditTrailList, { type AuditTrailEntry } from '../../components/AuditTrailList';
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

type AddableDocument = {
  id: string;
  title: string;
  status: string;
  caseNumber: string | null;
};

function hashSnippet(value: string | null) {
  if (!value) return '-';
  return value.length > 14 ? `${value.slice(0, 10)}...` : value;
}

async function sendJson(url: string, method: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Unable to save the changes.');
  return payload;
}

export default function CaseDetailClient({
  caseId,
  caseTitle,
  caseNumber,
  canManage,
  isOwner,
  documents,
  addableDocuments,
  activity,
}: {
  caseId: string;
  caseTitle: string;
  caseNumber: string | null;
  canManage: boolean;
  isOwner: boolean;
  documents: CaseDocument[];
  addableDocuments: AddableDocument[];
  activity: AuditTrailEntry[];
}) {
  const router = useRouter();
  const [isUploadOpen, setUploadOpen] = useState(false);
  const [isAddOpen, setAddOpen] = useState(false);
  const [selectedToAdd, setSelectedToAdd] = useState<string[]>([]);
  const [renaming, setRenaming] = useState(false);
  const [renameForm, setRenameForm] = useState({ title: caseTitle, caseNumber: caseNumber ?? '', note: '' });
  const [signerDocumentId, setSignerDocumentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);

  const sortedDocuments = useMemo(
    () => [...documents].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [documents]
  );

  function report(text: string, isError = false) {
    setError(isError);
    setMessage(text);
  }

  async function saveRename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await sendJson(`/api/cases/${encodeURIComponent(caseId)}`, 'PATCH', renameForm);
      setRenaming(false);
      setRenameForm((current) => ({ ...current, note: '' }));
      report('Case saved. Documents in this case (except Filed ones) now carry the new case number, and each change is logged.');
      router.refresh();
    } catch (failure) {
      report(failure instanceof Error ? failure.message : 'Unable to save the changes.', true);
    } finally {
      setBusy(false);
    }
  }

  async function addSelected() {
    setBusy(true);
    const failures: string[] = [];
    // One request per document, so one locked document cannot block the rest.
    for (const documentId of selectedToAdd) {
      try {
        await sendJson(`/api/cases/${encodeURIComponent(caseId)}/documents`, 'POST', { documentId });
      } catch (failure) {
        const title = addableDocuments.find((document) => document.id === documentId)?.title ?? 'A document';
        failures.push(`${title}: ${failure instanceof Error ? failure.message : 'not added'}`);
      }
    }
    setBusy(false);
    setAddOpen(false);
    setSelectedToAdd([]);
    report(failures.length ? `Some documents were not added. ${failures.join(' ')}` : 'Documents added. Their case number now matches this case.', failures.length > 0);
    router.refresh();
  }

  async function removeDocument(document: CaseDocument) {
    if (!window.confirm(`Remove "${document.title}" from this case? The document itself is kept.`)) return;
    setBusy(true);
    try {
      await sendJson(`/api/cases/${encodeURIComponent(caseId)}/documents`, 'DELETE', { documentId: document.id });
      report('Document removed from this case.');
      router.refresh();
    } catch (failure) {
      report(failure instanceof Error ? failure.message : 'Unable to remove the document.', true);
    } finally {
      setBusy(false);
    }
  }

  function toggleSelected(documentId: string) {
    setSelectedToAdd((current) => (current.includes(documentId)
      ? current.filter((id) => id !== documentId)
      : [...current, documentId]));
  }

  return (
    <>
      <section className={styles.banner}>
        <p className={styles.bannerLabel}>Case Folder</p>
        <h2 className={styles.bannerTitle}>{caseTitle}</h2>
        <p className={styles.bannerSubtitle}>
          Case number: {caseNumber || 'not set'} · {canManage ? 'You can manage this case.' : 'You see only the documents shared with you.'}
        </p>
      </section>

      {canManage && (
        <section className={styles.quickActions}>
          <div className={styles.queueHeader}>
            <h3 className={styles.sectionTitle}>Manage Case</h3>
            <span className={styles.queueCount}>{sortedDocuments.length}</span>
          </div>
          <div className={styles.quickActionRow}>
            <button type="button" className={styles.primaryActionButton} onClick={() => setUploadOpen(true)} disabled={busy}>
              Upload to Case
            </button>
            <button type="button" className={styles.secondaryActionButton} onClick={() => setAddOpen(true)} disabled={busy}>
              Add existing documents
            </button>
            <button type="button" className={styles.secondaryActionButton} onClick={() => setRenaming(true)} disabled={busy || renaming}>
              Rename case
            </button>
          </div>

          {renaming && (
            <form onSubmit={saveRename} className={styles.modalBody} style={{ marginTop: '1rem' }}>
              <label className={styles.modalLabel}>
                Case title
                <input className={styles.modalInput} value={renameForm.title} maxLength={200} required onChange={(event) => setRenameForm({ ...renameForm, title: event.target.value })} />
              </label>
              <label className={styles.modalLabel}>
                Case number
                <input className={styles.modalInput} value={renameForm.caseNumber} maxLength={80} placeholder="for ex. Civil Case No. R-DVO-26-01234" onChange={(event) => setRenameForm({ ...renameForm, caseNumber: event.target.value })} />
              </label>
              <label className={styles.modalLabel}>
                Reason for change (optional)
                <input className={styles.modalInput} value={renameForm.note} maxLength={300} placeholder="for ex. Corrected the docket number" onChange={(event) => setRenameForm({ ...renameForm, note: event.target.value })} />
              </label>
              <p className={styles.infoText}>A new case number is applied to every document in this case except Filed ones, which keep the number they were filed under.</p>
              <div className={styles.modalActions}>
                <button type="submit" className={styles.primaryActionButton} disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
                <button type="button" className={styles.secondaryActionButton} disabled={busy} onClick={() => { setRenaming(false); setRenameForm({ title: caseTitle, caseNumber: caseNumber ?? '', note: '' }); }}>Cancel</button>
              </div>
            </form>
          )}
        </section>
      )}

      <section className={styles.workspaceCard}>
        <h3 className={styles.sectionTitle}>Case Documents</h3>
        {sortedDocuments.length === 0 && <p className={styles.emptyText}>No documents in this case yet.</p>}

        {sortedDocuments.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>SHA-256</th>
                  <th>Created</th>
                  {(isOwner || canManage) && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {sortedDocuments.map((document) => (
                  <tr key={document.id}>
                    <td><Link href={`/documents/${document.id}`}>{document.title}</Link></td>
                    <td>{document.status}</td>
                    <td className={styles.monoCell}>{hashSnippet(document.sha256Hash)}</td>
                    <td>{new Date(document.createdAt).toLocaleString()}</td>
                    {(isOwner || canManage) && (
                      <td style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {isOwner && (
                          <button type="button" className={styles.secondaryActionButton} onClick={() => setSignerDocumentId(document.id)}>
                            Add Signer
                          </button>
                        )}
                        {canManage && document.status !== 'Filed' && (
                          <button type="button" className={styles.secondaryActionButton} onClick={() => removeDocument(document)} disabled={busy}>
                            Remove from case
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {activity.length > 0 && (
        <section className={styles.workspaceCard}>
          <h3 className={styles.sectionTitle}>Case Chain of Custody</h3>
          <p className={styles.infoText}>Most recent recorded activity across this case&apos;s documents.</p>
          <AuditTrailList entries={activity} maxHeight={360} />
        </section>
      )}

      <CaseQrCard caseId={caseId} caseTitle={caseTitle} caseNumber={caseNumber} />

      <UploadToCaseModal
        open={isUploadOpen}
        caseId={caseId}
        caseNumber={caseNumber}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => window.location.reload()}
      />

      {isAddOpen && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Add existing documents to case">
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <h3 className={styles.sectionTitle}>Add existing documents</h3>
              <button type="button" className={styles.modalClose} onClick={() => { setAddOpen(false); setSelectedToAdd([]); }} aria-label="Close" title="Close">
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>
              </button>
            </div>
            <div className={styles.modalBody}>
              <p className={styles.infoText}>
                Showing your documents that are not in a case yet. A document can belong to one case only; Filed documents are locked and can&apos;t be added.
              </p>
              {addableDocuments.length === 0 && <p className={styles.emptyText}>No documents available to add.</p>}
              <div style={{ display: 'grid', gap: '0.4rem', maxHeight: 320, overflowY: 'auto' }}>
                {addableDocuments.map((document) => (
                  <label key={document.id} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', cursor: 'pointer' }}>
                    <input type="checkbox" checked={selectedToAdd.includes(document.id)} onChange={() => toggleSelected(document.id)} />
                    <span>
                      <strong>{document.title}</strong>
                      <small style={{ display: 'block', color: 'var(--muted)' }}>
                        {document.status}{document.caseNumber ? ` · current case number: ${document.caseNumber}` : ''}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
              {selectedToAdd.length > 0 && (
                <p className={styles.infoText}>Their case number will be changed to: <strong>{caseNumber || 'none'}</strong>.</p>
              )}
              <div className={styles.modalActions}>
                <button type="button" className={styles.primaryActionButton} onClick={addSelected} disabled={busy || selectedToAdd.length === 0}>
                  {busy ? 'Adding...' : `Add ${selectedToAdd.length || ''} to case`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {signerDocumentId && (
        <AddSignerModal
          open={Boolean(signerDocumentId)}
          documentId={signerDocumentId}
          onClose={() => setSignerDocumentId(null)}
          onChanged={() => window.location.reload()}
        />
      )}

      <StatusDialog message={message} error={error} onClose={() => setMessage('')} />
    </>
  );
}
