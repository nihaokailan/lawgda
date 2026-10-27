'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import UploadToCaseModal from '../../components/UploadToCaseModal';
import { useFolderLabel } from '../../components/CaseQrCard';
import StatusDialog from '../../components/StatusDialog';
import { rememberDocumentOrigin } from '../../../lib/documentOrigin';
import AuditTrailList, { type AuditTrailEntry } from '../../components/AuditTrailList';
import docs from '../../../styles/documents.module.css';
import styles from '../../../styles/dashboard.module.css';

type CaseDocument = {
  id: string;
  title: string;
  filePath: string;
  sha256Hash: string | null;
  status: 'Drafting' | 'Pending' | 'Signed' | 'Filed';
  createdAt: string;
  ownerId: string;
  canOpen: boolean;
};

type AddableDocument = {
  id: string;
  title: string;
  status: string;
  caseNumber: string | null;
};

const STATUS_PILL_CLASS: Record<string, string> = {
  Filed: 'statusPillCompleted',
  Signed: 'statusPillCompleted',
  Pending: 'statusPillPending',
  Drafting: 'statusPillDrafts',
};

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

function Dialog({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label={label}>
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <h3 className={styles.sectionTitle}>{label}</h3>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close" title="Close">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function CaseDetailClient({
  caseId,
  caseTitle,
  caseNumber,
  canManage,
  documents,
  addableDocuments,
  activity,
}: {
  caseId: string;
  caseTitle: string;
  caseNumber: string | null;
  canManage: boolean;
  documents: CaseDocument[];
  addableDocuments: AddableDocument[];
  activity: AuditTrailEntry[];
}) {
  const router = useRouter();
  const label = useFolderLabel({ caseId, caseTitle, caseNumber });
  useEffect(() => { rememberDocumentOrigin(`/cases/${caseId}`); }, [caseId]);
  const [isUploadOpen, setUploadOpen] = useState(false);
  const [isAddOpen, setAddOpen] = useState(false);
  const [isRenameOpen, setRenameOpen] = useState(false);
  const [selectedToAdd, setSelectedToAdd] = useState<string[]>([]);
  const [renameForm, setRenameForm] = useState({ title: caseTitle, caseNumber: caseNumber ?? '', note: '' });
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

  function closeRename() {
    setRenameOpen(false);
    setRenameForm({ title: caseTitle, caseNumber: caseNumber ?? '', note: '' });
  }

  async function saveRename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await sendJson(`/api/cases/${encodeURIComponent(caseId)}`, 'PATCH', renameForm);
      setRenameOpen(false);
      setRenameForm((current) => ({ ...current, note: '' }));
      report('Folder saved. Its documents (except Filed ones) now carry the new case number, and each change is logged.');
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
    report(failures.length ? `Some documents were not added. ${failures.join(' ')}` : 'Documents added. Their case number now matches this folder.', failures.length > 0);
    router.refresh();
  }

  async function removeDocument(document: CaseDocument) {
    if (!window.confirm(`Remove "${document.title}" from this folder? The document itself is kept in Documents.`)) return;
    setBusy(true);
    try {
      await sendJson(`/api/cases/${encodeURIComponent(caseId)}/documents`, 'DELETE', { documentId: document.id });
      report('Document moved out of this folder.');
      router.refresh();
    } catch (failure) {
      report(failure instanceof Error ? failure.message : 'Unable to remove the document.', true);
    } finally {
      setBusy(false);
    }
  }

  function printLabel() {
    if (!label.printLabel()) {
      report('Your browser blocked the print window. Allow pop-ups for this site, then try again.', true);
    }
  }

  function toggleSelected(documentId: string) {
    setSelectedToAdd((current) => (current.includes(documentId)
      ? current.filter((id) => id !== documentId)
      : [...current, documentId]));
  }

  return (
    <section className={docs.docsShell}>
      <nav aria-label="Breadcrumb" style={{ fontSize: '0.9rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>
        <Link href="/cases">Documents</Link> <span aria-hidden="true">/</span> <span>{caseTitle}</span>
      </nav>

      <header className={docs.sectionHeader}>
        <div>
          <h2 className={docs.sectionTitle} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, color: 'var(--crimson)' }}>
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
            {caseTitle}
          </h2>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--muted)' }}>
            Case number: {caseNumber || 'not set'} · {sortedDocuments.length} {sortedDocuments.length === 1 ? 'document' : 'documents'}
            {!canManage && ' · You see only the documents shared with you.'}
          </p>
        </div>
      </header>

      <div className={docs.topActions} style={{ flexWrap: 'wrap', margin: '1rem 0' }} role="toolbar" aria-label="Folder actions">
        {canManage && (
          <>
            <button type="button" className={docs.prepareButton} onClick={() => setUploadOpen(true)} disabled={busy}>Upload document</button>
            <button type="button" className={docs.verifyButton} onClick={() => setAddOpen(true)} disabled={busy}>Add existing documents</button>
            <button type="button" className={docs.verifyButton} onClick={() => setRenameOpen(true)} disabled={busy}>Rename</button>
          </>
        )}
        <button type="button" className={docs.verifyButton} onClick={printLabel} disabled={!label.qrDataUrl}>Print folder label</button>
        {label.qrDataUrl && (
          <a className={docs.verifyButton} href={label.qrDataUrl} download={label.downloadName}>Download QR</a>
        )}
      </div>

      <div className={docs.resultsWrap}>
        {sortedDocuments.length === 0 ? (
          <p className={docs.emptyState}>{canManage ? 'This folder is empty. Upload a document or add existing ones.' : 'No documents in this folder are shared with you.'}</p>
        ) : (
          <table className={docs.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Created</th>
                {canManage && <th aria-label="Actions" />}
              </tr>
            </thead>
            <tbody>
              {sortedDocuments.map((document) => (
                <tr
                  key={document.id}
                  tabIndex={document.canOpen ? 0 : undefined}
                  role={document.canOpen ? 'link' : undefined}
                  style={{ cursor: document.canOpen ? 'pointer' : 'default' }}
                  onClick={() => { if (document.canOpen) router.push(`/documents/${document.id}`); }}
                  onKeyDown={(event) => { if (document.canOpen && event.key === 'Enter' && event.target === event.currentTarget) router.push(`/documents/${document.id}`); }}
                >
                  <td>
                    <div>{document.title}</div>
                    {!document.canOpen && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.2rem' }}>Not shared with you; ask its owner for access.</div>
                    )}
                  </td>
                  <td>
                    <span className={`${docs.statusPill} ${docs[STATUS_PILL_CLASS[document.status] || 'statusPillDrafts']}`}>{document.status}</span>
                  </td>
                  <td>{new Date(document.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</td>
                  {canManage && (
                    <td onClick={(event) => event.stopPropagation()} style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {document.canOpen && document.status !== 'Filed' && (
                        <button type="button" className={docs.verifyButton} onClick={() => removeDocument(document)} disabled={busy}>
                          Remove from folder
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {activity.length > 0 && (
        <section className={styles.workspaceCard} style={{ marginTop: '1.5rem' }}>
          <h3 className={styles.sectionTitle}>Folder Chain of Custody</h3>
          <p className={styles.infoText}>Most recent recorded activity across this folder&apos;s documents.</p>
          <AuditTrailList entries={activity} maxHeight={360} />
        </section>
      )}

      <UploadToCaseModal
        open={isUploadOpen}
        caseId={caseId}
        caseNumber={caseNumber}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => window.location.reload()}
      />

      {isRenameOpen && (
        <Dialog label="Rename folder" onClose={closeRename}>
          <form onSubmit={saveRename} className={styles.modalBody}>
            <label className={styles.modalLabel}>
              Folder name
              <input className={styles.modalInput} value={renameForm.title} maxLength={200} required autoFocus onChange={(event) => setRenameForm({ ...renameForm, title: event.target.value })} />
            </label>
            <label className={styles.modalLabel}>
              Case number
              <input className={styles.modalInput} value={renameForm.caseNumber} maxLength={80} placeholder="for ex. Civil Case No. R-DVO-26-01234" onChange={(event) => setRenameForm({ ...renameForm, caseNumber: event.target.value })} />
            </label>
            <label className={styles.modalLabel}>
              Reason for change (optional)
              <input className={styles.modalInput} value={renameForm.note} maxLength={300} placeholder="for ex. Corrected the docket number" onChange={(event) => setRenameForm({ ...renameForm, note: event.target.value })} />
            </label>
            <p className={styles.infoText}>A new case number is applied to every document in this folder except Filed ones, which keep the number they were filed under.</p>
            <div className={styles.modalActions}>
              <button type="submit" className={styles.primaryActionButton} disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
            </div>
          </form>
        </Dialog>
      )}

      {isAddOpen && (
        <Dialog label="Add existing documents" onClose={() => { setAddOpen(false); setSelectedToAdd([]); }}>
          <div className={styles.modalBody}>
            <p className={styles.infoText}>
              Your documents that are not in a folder yet. A document can be in one folder only; Filed documents are locked and can&apos;t be moved.
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
                {busy ? 'Adding...' : `Add ${selectedToAdd.length || ''} to folder`}
              </button>
            </div>
          </div>
        </Dialog>
      )}

      <StatusDialog message={message} error={error} onClose={() => setMessage('')} />
    </section>
  );
}
