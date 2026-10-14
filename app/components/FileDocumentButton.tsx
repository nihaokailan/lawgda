'use client';

import { useState } from 'react';
import StatusDialog from './StatusDialog';
import { useRouter } from 'next/navigation';

/** Lawyer action that moves a fully signed document to "Filed" (see /api/documents/[id]/file). */
export default function FileDocumentButton({
  documentId,
  className,
  style,
}: {
  documentId: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function fileDocument() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/file`, { method: 'POST' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to file this document.');
      }
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to file this document.');
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <span>
      {confirming ? (
        <>
          <button type="button" className={className} style={style} onClick={fileDocument} disabled={busy}>
            {busy ? 'Filing…' : 'Confirm: mark as Filed'}
          </button>{' '}
          <button type="button" className={className} style={{ ...style, opacity: 0.75 }} onClick={() => setConfirming(false)} disabled={busy}>
            Cancel
          </button>
        </>
      ) : (
        <button type="button" className={className} style={style} onClick={() => setConfirming(true)}>
          Mark as Filed
        </button>
      )}
      <StatusDialog message={error} error onClose={() => setError('')} />
    </span>
  );
}
