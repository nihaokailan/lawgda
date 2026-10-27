'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import UploadModal from '../components/UploadModal';
import Pagination from '../components/Pagination';
import SignNowButton from '../components/SignNowButton';
import StatusDialog from '../components/StatusDialog';
import styles from '../../styles/documents.module.css';
import dialog from '../../styles/dashboard.module.css';
import { matchesIndexQuery } from '../../lib/documentIndexing';
import { rememberDocumentOrigin } from '../../lib/documentOrigin';

const PAGE_SIZE = 8;

type DocumentRow = {
  id: string;
  title: string;
  status: string;
  createdAt: string | null;
  ownerLabel: string;
  ownerInitials: string;
  caseNumber: string | null;
  tags: string[];
  myAction?: 'sign' | 'waiting' | null;
  folderId?: string | null;
};

type FolderRow = {
  id: string;
  title: string;
  caseNumber: string | null;
  documentCount: number;
  createdAt: string | null;
};

type ListItem = { kind: 'folder'; folder: FolderRow } | { kind: 'document'; document: DocumentRow };

const FILTERS = [
  'All Documents',
  'Pending Signatures',
  'Filed',
  'Signed',
  'Drafts',
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
};

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" style={{ flex: 'none', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, color: 'var(--crimson)' }}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

export default function DocumentsWorkspaceClient({
  documents,
  folders = [],
  canCreateFolders = false,
}: {
  documents: DocumentRow[];
  folders?: FolderRow[];
  canCreateFolders?: boolean;
}) {
  const router = useRouter();
  useEffect(() => { rememberDocumentOrigin('/cases'); }, []);
  const [visibleDocuments, setVisibleDocuments] = useState(documents);
  const [filter, setFilter] = useState('All Documents');
  const [query, setQuery] = useState('');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isNewFolderOpen, setNewFolderOpen] = useState(false);
  const [folderForm, setFolderForm] = useState({ title: '', caseNumber: '' });
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderError, setFolderError] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => { setVisibleDocuments(documents); }, [documents]);

  const folderTitles = useMemo(() => new Map(folders.map((folder) => [folder.id, folder.title])), [folders]);

  const statusSummary = useMemo(() => {
    const counts: Record<string, number> = {
      'All Documents': visibleDocuments.length,
      'Pending Signatures': 0,
      Filed: 0,
      Signed: 0,
      Drafts: 0,
    };

    visibleDocuments.forEach((row) => {
      if (row.status !== 'Pending' && counts[row.status] !== undefined) {
        counts[row.status] += 1;
      }
      if (row.status === 'Pending') {
        counts['Pending Signatures'] += 1;
      }
    });

    return counts;
  }, [visibleDocuments]);

  // Like a drive: the top level shows folders, then documents not in a folder.
  // A status filter or a search looks inside folders too.
  const browsingTopLevel = filter === 'All Documents' && !query.trim();

  const items = useMemo<ListItem[]>(() => {
    const q = query.trim().toLowerCase();
    const matchingDocuments = visibleDocuments.filter((row) => {
      if (browsingTopLevel && row.folderId) return false;
      if (!matchesFilter(filter, row)) return false;
      if (!q) return true;
      // Indexing: staff-entered title, case number and tags are all searchable.
      return matchesIndexQuery(row, q)
        || row.status.toLowerCase().includes(q)
        || row.ownerLabel.toLowerCase().includes(q)
        || (row.folderId ? (folderTitles.get(row.folderId) ?? '').toLowerCase().includes(q) : false);
    });
    const matchingFolders = filter !== 'All Documents'
      ? []
      : folders.filter((folder) => !q || folder.title.toLowerCase().includes(q) || (folder.caseNumber ?? '').toLowerCase().includes(q));

    return [
      ...matchingFolders.map((folder) => ({ kind: 'folder' as const, folder })),
      ...matchingDocuments.map((document) => ({ kind: 'document' as const, document })),
    ];
  }, [visibleDocuments, folders, folderTitles, filter, query, browsingTopLevel]);

  useEffect(() => {
    setPage(1);
  }, [filter, query]);

  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedItems = items.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function handleUploaded(document: { id: string | null; title: string; status: string; createdAt: string | null; caseNumber?: string | null; tags?: string[] }) {
    if (!document.id) return;

    setVisibleDocuments((current) => [
      {
        id: document.id as string,
        title: document.title,
        status: 'Drafts',
        createdAt: document.createdAt,
        ownerLabel: 'You',
        ownerInitials: 'YO',
        caseNumber: document.caseNumber ?? null,
        tags: document.tags ?? [],
        folderId: null,
      },
      ...current.filter((row) => row.id !== document.id),
    ]);
    setIsUploadOpen(false);
  }

  async function createFolder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatingFolder(true);
    setFolderError('');
    try {
      const response = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(folderForm),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to create the folder.');
      router.push(`/cases/${payload.case.id}`);
    } catch (failure) {
      setFolderError(failure instanceof Error ? failure.message : 'Unable to create the folder.');
      setCreatingFolder(false);
    }
  }

  function openItem(item: ListItem) {
    router.push(item.kind === 'folder' ? `/cases/${item.folder.id}` : `/documents/${item.document.id}`);
  }

  const emptyMessage = visibleDocuments.length === 0 && folders.length === 0
    ? 'No documents yet. Upload a PDF to get started.'
    : query.trim()
      ? 'Nothing matches your search. Try a different search.'
      : filter === 'All Documents'
        ? 'Nothing here yet.'
        : `No documents with the ${filter.toLowerCase()} status.`;

  return (
    <section className={styles.docsShell}>
      <header className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Documents</h2>
        <div className={styles.topActions}>
          <Link href="/verify" className={styles.verifyButton}>Verify a document</Link>
          {canCreateFolders && (
            <button type="button" className={styles.verifyButton} onClick={() => setNewFolderOpen(true)}>
              New folder
            </button>
          )}
          <button type="button" className={styles.prepareButton} onClick={() => setIsUploadOpen(true)}>
            Upload a document
          </button>
        </div>
      </header>

      <div className={styles.summaryRow} role="group" aria-label="Filter documents by status">
        {FILTERS.map((item) => (
          <button
            key={`summary-${item}`}
            type="button"
            className={`${styles.summaryCard} ${filter === item ? styles.summaryCardActive : ''}`}
            aria-pressed={filter === item}
            onClick={() => setFilter(item)}
          >
            <span className={styles.summaryLabel}>{item}</span>
            <span className={styles.summaryValue}>{statusSummary[item] || 0}</span>
          </button>
        ))}
      </div>

      <div className={styles.searchRow}>
        <input
          className={styles.searchInput}
          placeholder="Search by title, folder, case number, tag, status, or owner"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search documents and folders by title, folder, case number, tag, status, or owner"
        />
      </div>

      <div className={styles.resultsWrap}>
        {items.length === 0 && <p className={styles.emptyState}>{emptyMessage}</p>}

        {items.length > 0 && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Owner</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {pagedItems.map((item) => (
                <tr
                  key={`${item.kind}-${item.kind === 'folder' ? item.folder.id : item.document.id}`}
                  tabIndex={0}
                  role="link"
                  style={{ cursor: 'pointer' }}
                  onClick={() => openItem(item)}
                  onKeyDown={(event) => { if (event.key === 'Enter') openItem(item); }}
                >
                  {item.kind === 'folder' ? (
                    <>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                          <FolderIcon />
                          <span>{item.folder.title}</span>
                        </div>
                        {item.folder.caseNumber && (
                          <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.2rem', paddingLeft: '1.6rem' }}>{item.folder.caseNumber}</div>
                        )}
                      </td>
                      <td style={{ color: 'var(--muted)' }}>
                        {item.folder.documentCount} {item.folder.documentCount === 1 ? 'document' : 'documents'}
                      </td>
                      <td>Folder</td>
                      <td>{formatDate(item.folder.createdAt)}</td>
                    </>
                  ) : (
                    <>
                      <td>
                        <div>{item.document.title}</div>
                        {(item.document.caseNumber || item.document.tags.length > 0 || (!browsingTopLevel && item.document.folderId)) && (
                          <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.2rem' }}>
                            {[
                              !browsingTopLevel && item.document.folderId ? `In ${folderTitles.get(item.document.folderId) ?? 'a folder'}` : '',
                              item.document.caseNumber ?? '',
                              item.document.tags.map((tag) => `#${tag}`).join(' '),
                            ].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </td>
                      <td>
                        {item.document.myAction === 'sign' ? (
                          <SignNowButton documentId={item.document.id} label="Pending your signature — Sign now" className={`${styles.statusPill} ${styles.statusPillPending}`} style={{ cursor: 'pointer', border: 0 }} />
                        ) : item.document.myAction === 'waiting' ? (
                          <span className={`${styles.statusPill} ${styles.statusPillDrafts}`}>Waiting for other signers</span>
                        ) : (
                          <span className={`${styles.statusPill} ${styles[STATUS_PILL_CLASS[item.document.status] || 'statusPillDrafts']}`}>{item.document.status}</span>
                        )}
                      </td>
                      <td>{item.document.ownerLabel}</td>
                      <td>{formatDate(item.document.createdAt)}</td>
                    </>
                  )}
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

      {isNewFolderOpen && (
        <div className={dialog.modalOverlay} role="dialog" aria-modal="true" aria-label="New folder">
          <div className={dialog.modalCard}>
            <div className={dialog.modalHeader}>
              <h3 className={dialog.sectionTitle}>New folder</h3>
              <button type="button" className={dialog.modalClose} onClick={() => { setNewFolderOpen(false); setFolderForm({ title: '', caseNumber: '' }); }} aria-label="Close" title="Close">
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>
              </button>
            </div>
            <form className={dialog.modalBody} onSubmit={createFolder}>
              <p className={dialog.infoText}>A folder holds one case&apos;s documents. Its case number is applied to every document you put in it.</p>
              <label className={dialog.modalLabel}>
                Folder name
                <input className={dialog.modalInput} value={folderForm.title} maxLength={200} required autoFocus placeholder="for ex. People v. Santos" onChange={(event) => setFolderForm({ ...folderForm, title: event.target.value })} />
              </label>
              <label className={dialog.modalLabel}>
                Case number (optional)
                <input className={dialog.modalInput} value={folderForm.caseNumber} maxLength={80} placeholder="for ex. Civil Case No. R-DVO-26-01234" onChange={(event) => setFolderForm({ ...folderForm, caseNumber: event.target.value })} />
              </label>
              <div className={dialog.modalActions}>
                <button type="submit" className={dialog.primaryActionButton} disabled={creatingFolder}>{creatingFolder ? 'Creating...' : 'Create folder'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <StatusDialog message={folderError} error onClose={() => setFolderError('')} />
    </section>
  );
}
