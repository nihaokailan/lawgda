'use client';

import { useState } from 'react';
import StatusDialog from './StatusDialog';

/** Starts the in-app signing flow for the current Lawyer (see /api/signing-requests/sign-now). */
export default function SignNowButton({
  documentId,
  label,
  className,
  style,
}: {
  documentId: string;
  label: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function start(event: React.MouseEvent) {
    event.stopPropagation();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/signing-requests/sign-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.url) {
        throw new Error(payload.error || 'Unable to start signing.');
      }
      window.location.assign(payload.url);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to start signing.');
      setBusy(false);
    }
  }

  return (
    <span>
      <button type="button" className={className} style={style} onClick={start} disabled={busy}>
        {busy ? 'Opening…' : label}
      </button>
      {/* Kept from reaching the clickable table row this button sits in. */}
      <span onClick={(event) => event.stopPropagation()}>
        <StatusDialog message={error} error onClose={() => setError('')} />
      </span>
    </span>
  );
}
