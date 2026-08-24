'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '../../lib/supabase/client';
import styles from '../../styles/dashboard.module.css';

type UploadToCaseModalProps = {
  open: boolean;
  caseId: string;
  onClose: () => void;
  onUploaded: () => void;
};

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

async function safeReadJson(response: Response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export default function UploadToCaseModal({ open, caseId, onClose, onUploaded }: UploadToCaseModalProps) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [title, setTitle] = useState('');
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

    if (nextFile.type !== 'application/pdf') {
      setError(true);
      setMessage('Only PDF files are allowed.');
      return;
    }

    // Compute SHA-256 immediately before any upload starts.
    const buffer = await nextFile.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    setFileHash(toHex(digest));
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

    const formData = new FormData();
    formData.set('title', title.trim());
    formData.set('sha256Hash', fileHash);
    formData.set('caseId', caseId);
    formData.set('file', file);

    const response = await fetch('/api/documents/upload', {
      method: 'POST',
      body: formData,
    });

    const payload = await safeReadJson(response);
    if (!response.ok) {
      setBusy(false);
      setError(true);
      setMessage(`Upload failed: ${payload.error || 'Unable to upload document.'}`);
      return;
    }

    const uploadedDocument = payload.document || null;
    const documentId = uploadedDocument && typeof uploadedDocument.id === 'string' ? uploadedDocument.id : null;

    setBusy(false);
    setTitle('');
    setFile(null);
    setFileHash('');
    onUploaded();
    setMessage('Document uploaded with verified SHA-256 hash.');

    if (documentId) {
      router.push(`/documents/${documentId}/edit`);
      router.refresh();
    }
  }

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Upload PDF to case">
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <h3 className={styles.sectionTitle}>Upload to Case</h3>
          <button type="button" className={styles.modalClose} onClick={onClose}>Close</button>
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
