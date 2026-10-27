'use client';

import { useState } from 'react';
import shared from '../../styles/shared.module.css';
import HashComparison from './HashComparison';

type CheckResult = {
  outcome: 'authentic' | 'earlier_version' | 'breach';
  matchedVersion: string | null;
  expectedHash: string | null;
  computedHash: string;
};

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (value) => value.toString(16).padStart(2, '0')).join('');
}

function versionLabel(value: string | null) {
  if (!value) return '';
  if (value === 'original_upload') return 'the original uploaded document (before any signature)';
  return value.replaceAll('_', ' ');
}

/**
 * Lets anyone holding the QR link check a downloaded copy. The SHA-256 is
 * computed locally; only the hash is sent to Lawgda, never the file.
 */
export default function PublicFileCheck({ auditToken }: { auditToken: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CheckResult | null>(null);

  async function checkFile(file: File | null) {
    setResult(null);
    setError('');
    if (!file) return;
    setBusy(true);
    try {
      const sha256 = toHex(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
      const response = await fetch(`/api/verify/${encodeURIComponent(auditToken)}/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sha256 }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to check this file.');
      setResult(payload as CheckResult);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to check this file.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={shared.sectionCard} style={{ marginBottom: '1rem' }}>
      <h2 className={shared.cardTitle}>Check a copy of this document</h2>
      <p className={shared.helpText}>
        Choose the PDF you received. Its SHA-256 fingerprint is calculated on your device and compared with the hash Lawgda recorded.
        The file itself is never uploaded. The result is recorded in this document&apos;s audit trail.
      </p>
      <input type="file" accept="application/pdf,.pdf" disabled={busy} onChange={(event) => checkFile(event.target.files?.[0] || null)} />
      {busy && <p className={shared.helpText}>Calculating SHA-256…</p>}
      {error && <p role="alert" style={{ color: '#991b1b' }}>{error}</p>}
      {result && (
        <HashComparison
          verdict={result.outcome === 'authentic' ? 'match' : result.outcome === 'earlier_version' ? 'earlier' : 'mismatch'}
          message={result.outcome === 'authentic'
            ? 'Authentic — this file is identical to the final signed document.'
            : result.outcome === 'earlier_version'
              ? `Genuine but not final — this file matches ${versionLabel(result.matchedVersion)}.`
              : 'Integrity breach — this file does not match any version recorded by Lawgda. It may have been altered.'}
          checkedHash={result.computedHash}
          recordedHash={result.expectedHash}
          checkedLabel="Your file's SHA-256"
          recordedLabel="Recorded final SHA-256"
        />
      )}
    </section>
  );
}
