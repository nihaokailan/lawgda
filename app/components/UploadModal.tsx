'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '../../lib/supabase/client';
import { uploadDocument, validateUploadFile } from '../../lib/uploadDocumentClient';
import styles from '../../styles/dashboard.module.css';

type DashboardDocument = {
  id: string | null;
  title: string;
  status: 'Drafting' | 'Pending' | 'Signed' | 'Filed';
  sha256Hash: string | null;
  createdAt: string | null;
  caseNumber?: string | null;
  tags?: string[];
};

type UploadModalProps = {
  open: boolean;
  onClose: () => void;
  onUploaded: (document: DashboardDocument) => void;
  redirectOnUpload?: boolean;
};

export default function UploadModal({ open, onClose, onUploaded, redirectOnUpload = true }: UploadModalProps) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [caseNumber, setCaseNumber] = useState('');
  const [tags, setTags] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [hash, setHash] = useState('');
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  if (!open) return null;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setError(false);

    if (!title.trim()) {
      setError(true);
      setMessage('Please enter a document title.');
      return;
    }

    const fileProblem = validateUploadFile(file);
    if (!file || fileProblem) {
      setError(true);
      setMessage(fileProblem);
      return;
    }

    setBusy(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setBusy(false);
      setError(true);
      setMessage('You must be signed in to upload documents.');
      return;
    }

    let uploadedDocument;
    let sha256: string;
    try {
      ({ document: uploadedDocument, sha256Hash: sha256 } = await uploadDocument(supabase, { file, title: title.trim(), caseNumber, tags }));
    } catch (failure) {
      setBusy(false);
      setError(true);
      setMessage(`Upload failed: ${failure instanceof Error ? failure.message : 'Unable to upload document.'}`);
      return;
    }
    setHash(sha256);

    setBusy(false);

    const uploadedId = uploadedDocument && typeof uploadedDocument.id === 'string' ? uploadedDocument.id : null;

    onUploaded({
      id: uploadedId,
      title: String(uploadedDocument?.title || uploadedDocument?.name || uploadedDocument?.filename || title),
      status: 'Drafting',
      sha256Hash: sha256,
      createdAt: typeof uploadedDocument?.created_at === 'string' ? uploadedDocument.created_at : new Date().toISOString(),
      caseNumber: uploadedDocument?.case_number ?? null,
      tags: Array.isArray(uploadedDocument?.tags) ? uploadedDocument.tags : [],
    });

    setMessage('Document uploaded and hashed successfully.');
    setTitle('');
    setCaseNumber('');
    setTags('');
    setFile(null);

    // Open the new document straight away so the next step (assigning signers) starts immediately.
    if (uploadedId) {
      onClose();
      router.push(`/documents/${uploadedId}/prepare`);
    } else if (redirectOnUpload) {
      onClose();
      router.refresh();
    }
  }

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Upload document">
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <h3 className={styles.sectionTitle}>Upload Document</h3>
          <button type="button" className={styles.modalClose} onClick={onClose}>
            Close
          </button>
        </div>

        <form onSubmit={onSubmit} className={styles.modalBody}>
          <label className={styles.modalLabel}>
            Document title
            <input
              className={styles.modalInput}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="for ex. Deed of Sale - Santos Property"
              required
            />
          </label>

          <label className={styles.modalLabel}>
            Case number (optional)
            <input
              className={styles.modalInput}
              value={caseNumber}
              onChange={(event) => setCaseNumber(event.target.value)}
              maxLength={80}
              placeholder="for ex. Civil Case No. R-DVO-26-01234"
            />
          </label>

          <label className={styles.modalLabel}>
            Tags (optional, comma-separated)
            <input
              className={styles.modalInput}
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="for ex. deed of sale, land title"
            />
          </label>

          <label className={styles.modalLabel}>
            PDF file
            <input
              className={styles.modalInput}
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
              required
            />
          </label>

          <div className={styles.modalActions}>
            <button type="submit" className={styles.primaryActionButton} disabled={busy}>
              {busy ? 'Uploading...' : 'Upload + Hash'}
            </button>
          </div>
        </form>

        {hash && <pre className={styles.hashPanel}>{hash}</pre>}
        {message && (
          <p className={error ? styles.alertError : styles.alertSuccess}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
