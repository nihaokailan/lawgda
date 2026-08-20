'use client';

import { useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '../../lib/supabase/client';
import styles from '../../styles/dashboard.module.css';

type VerifyModalProps = {
  open: boolean;
  onClose: () => void;
};

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

export default function VerifyModal({ open, onClose }: VerifyModalProps) {
  const [busy, setBusy] = useState(false);
  const [hash, setHash] = useState('');
  const [result, setResult] = useState<'ok' | 'bad' | null>(null);
  const [message, setMessage] = useState('');
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  if (!open) return null;

  async function onFileSelected(file: File | null) {
    setResult(null);
    setMessage('');
    setHash('');

    if (!file) return;

    if (file.type !== 'application/pdf') {
      setResult('bad');
      setMessage('Only PDF files are allowed.');
      return;
    }

    setBusy(true);

    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    const sha256 = toHex(digest);
    setHash(sha256);

    const primaryQuery = await supabase
      .from('documents')
      .select('id,sha256_hash')
      .eq('sha256_hash', sha256)
      .limit(1);

    let isMatch = Boolean(primaryQuery.data && primaryQuery.data.length > 0 && !primaryQuery.error);

    if (!isMatch) {
      const fallbackQuery = await supabase
        .from('documents')
        .select('id,metadata')
        .order('created_at', { ascending: false })
        .limit(200);

      if (!fallbackQuery.error && fallbackQuery.data) {
        isMatch = fallbackQuery.data.some((row) => {
          const metadataHash = row?.metadata && typeof row.metadata === 'object'
            ? (row.metadata as Record<string, unknown>).sha256_hash
            : null;
          return typeof metadataHash === 'string' && metadataHash === sha256;
        });
      }
    }

    setBusy(false);

    if (isMatch) {
      setResult('ok');
      setMessage('Integrity Verified');
      return;
    }

    setResult('bad');
    setMessage('Tampered / Not Found');
  }

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Verify document hash">
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <h3 className={styles.sectionTitle}>Verify Document</h3>
          <button type="button" className={styles.modalClose} onClick={onClose}>
            Close
          </button>
        </div>

        <div className={styles.modalBody}>
          <label className={styles.modalLabel}>
            Drop or choose PDF file
            <input
              className={styles.modalInput}
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => onFileSelected(event.target.files?.[0] || null)}
              disabled={busy}
            />
          </label>
        </div>

        {hash && <pre className={styles.hashPanel}>{hash}</pre>}
        {result === 'ok' && <p className={styles.alertSuccess}>{message}</p>}
        {result === 'bad' && <p className={styles.alertError}>{message}</p>}
      </div>
    </div>
  );
}
