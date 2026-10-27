'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '../../lib/supabase/client';
import { sha256OfFile, uploadDocument, validateUploadFile } from '../../lib/uploadDocumentClient';
import styles from '../../styles/dashboard.module.css';

type UploadToCaseModalProps = {
  open: boolean;
  caseId: string;
  caseNumber: string | null;
  onClose: () => void;
  onUploaded: () => void;
};

export default function UploadToCaseModal({ open, caseId, caseNumber, onClose, onUploaded }: UploadToCaseModalProps) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileHash, setFileHash] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);

  if (!open) {
    return null;
  }

  async function handleFileSelect(nextFile: File | null) {
    setFile(nextFile);
    setFileHash('');
    setMessage('');
    setError(false);

    if (!nextFile) {
      return;
    }

    const fileProblem = validateUploadFile(nextFile);
    if (fileProblem) {
      setError(true);
      setMessage(fileProblem);
      return;
    }

    // Compute SHA-256 immediately before any upload starts.
    setFileHash(await sha256OfFile(nextFile));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setError(false);

    if (!title.trim()) {
      setError(true);
      setMessage('Document title is required.');
      return;
    }

    if (!file) {
      setError(true);
      setMessage('Please choose a PDF file.');
      return;
    }

    if (!fileHash) {
      setError(true);
      setMessage('Hash is not ready yet. Re-select the file.');
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
      setMessage('You must be signed in.');
      return;
    }

    let uploadedDocument;
    try {
      ({ document: uploadedDocument } = await uploadDocument(supabase, { file, title: title.trim(), caseId, sha256Hash: fileHash, tags }));
    } catch (failure) {
      setBusy(false);
      setError(true);
      setMessage(`Upload failed: ${failure instanceof Error ? failure.message : 'Unable to upload document.'}`);
      return;
    }

    const documentId = uploadedDocument && typeof uploadedDocument.id === 'string' ? uploadedDocument.id : null;

    setBusy(false);
    setTitle('');
    setTags('');
    setFile(null);
    setFileHash('');
    onUploaded();
    setMessage('Document uploaded with verified SHA-256 hash.');

    if (documentId) {
      router.push(`/documents/${documentId}/prepare`);
      router.refresh();
    }
  }

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Upload PDF to case">
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <h3 className={styles.sectionTitle}>Upload to Case</h3>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close upload dialog" title="Close">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>
          </button>
        </div>

        <form className={styles.modalBody} onSubmit={handleSubmit}>
          <label className={styles.modalLabel}>
            Document Title
            <input
              className={styles.modalInput}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="for ex. Affidavit of Loss"
              required
            />
          </label>

          <p className={styles.infoText}>
            Case number: <strong>{caseNumber || 'none yet'}</strong> (taken from this case folder)
          </p>

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
            PDF File
            <input
              className={styles.modalInput}
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => handleFileSelect(event.target.files?.[0] || null)}
              required
            />
          </label>

          {fileHash && <pre className={styles.hashPanel}>{fileHash}</pre>}

          <div className={styles.modalActions}>
            <button type="submit" className={styles.primaryActionButton} disabled={busy}>
              {busy ? 'Uploading...' : 'Upload Document'}
            </button>
          </div>
        </form>

        {message && <p className={error ? styles.alertError : styles.alertSuccess}>{message}</p>}
      </div>
    </div>
  );
}
