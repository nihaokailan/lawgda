'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '../../lib/supabase/client';
import styles from '../../styles/dashboard.module.css';

type DashboardDocument = {
  id: string | null;
  title: string;
  status: 'Drafting' | 'Pending' | 'Signed' | 'Filed';
  sha256Hash: string | null;
  createdAt: string | null;
};

type UploadModalProps = {
  open: boolean;
  onClose: () => void;
  onUploaded: (document: DashboardDocument) => void;
  redirectOnUpload?: boolean;
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

export default function UploadModal({ open, onClose, onUploaded, redirectOnUpload = true }: UploadModalProps) {
  const router = useRouter();
  const [title, setTitle] = useState('');
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

    if (!file) {
      setError(true);
      setMessage('Please select a PDF file.');
      return;
    }

    if (file.type !== 'application/pdf') {
      setError(true);
      setMessage('Only PDF files are allowed.');
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

    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    const sha256 = toHex(digest);
    setHash(sha256);

    const formData = new FormData();
    formData.set('title', title.trim());
    formData.set('sha256Hash', sha256);
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

    setBusy(false);

    const uploadedDocument = payload.document || null;
    const uploadedId = uploadedDocument && typeof uploadedDocument.id === 'string' ? uploadedDocument.id : null;

    onUploaded({
      id: uploadedId,
      title: String(uploadedDocument?.title || uploadedDocument?.name || uploadedDocument?.filename || title),
      status: 'Drafting',
      sha256Hash: sha256,
      createdAt: typeof uploadedDocument?.created_at === 'string' ? uploadedDocument.created_at : new Date().toISOString(),
    });

    setMessage('Document uploaded and hashed successfully.');
    setTitle('');
    setFile(null);

    if (uploadedId && redirectOnUpload) {
      router.push(`/documents/${uploadedId}/prepare`);
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
