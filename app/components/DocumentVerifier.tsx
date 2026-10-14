'use client';

import { useState } from 'react';
import shared from '../../styles/shared.module.css';
import { recordIntegrityCheck } from '../../lib/documentVerification';
import styles from '../../../styles/workspace.module.css';

type VerifyProps = {
  documentId: string;
  version: 'original' | 'signed';
  documentTitle: string;
  storedHash: string;
  hashLabel?: string;
};

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

export default function DocumentVerifier({ documentId, version, documentTitle, storedHash, hashLabel = 'Original SHA-256' }: VerifyProps) {
  const [recordError, setRecordError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [computedHash, setComputedHash] = useState('');
  const [verificationResult, setVerificationResult] = useState<'match' | 'mismatch' | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleFileSelect(selectedFile: File | null) {
    setFile(selectedFile);
    setComputedHash('');
    setVerificationResult(null);

    if (!selectedFile) return;

    setLoading(true);
    try {
      const buffer = await selectedFile.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', buffer);
      const hash = toHex(digest);
      setComputedHash(hash);

      // The server decides the result from the hash and records it in the audit trail.
      setRecordError('');
      try {
        const recorded = await recordIntegrityCheck(documentId, hash, version, 'document_page');
        setVerificationResult(recorded.matches ? 'match' : 'mismatch');
      } catch {
        setRecordError('The check could not be recorded in the audit trail, so no result is shown. Please try again.');
      }
    } catch (err) {
      console.error('Error computing hash:', err);
    } finally {
      setLoading(false);
    }
  }

  const isVerified = verificationResult === 'match';
  const isMismatch = verificationResult === 'mismatch';

  return (
    <div className={shared.sectionCard} style={{ marginTop: '2rem' }}>
      <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>Verify Document Integrity</h3>
      <p style={{ color: 'var(--muted)', marginBottom: '1.5rem' }}>
        Upload the downloaded file to verify it has not been modified. The SHA-256 hash must match exactly. Each check is recorded in the audit trail.
      </p>
      {recordError && <p role="alert" style={{ color: '#991b1b' }}>{recordError}</p>}

      <div style={{ marginBottom: '1.5rem' }}>
        <label className={shared.fieldLabel} style={{ marginBottom: '0.5rem' }}>
          Download & Upload File for Verification
          <input
            type="file"
            className={shared.input}
            onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
            accept=".pdf"
          />
        </label>
        {loading && <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Computing hash...</p>}
      </div>

      {storedHash && (
        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#f5f5f5', borderRadius: '8px', fontFamily: 'monospace', fontSize: '0.85rem', wordBreak: 'break-all' }}>
          <p style={{ margin: '0 0 0.75rem 0', fontWeight: 600, color: '#666' }}>{hashLabel}:</p>
          <p style={{ margin: 0, color: '#333' }}>{storedHash}</p>
        </div>
      )}

      {computedHash && (
        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: isVerified ? '#ecfdf5' : '#fef2f2', borderRadius: '8px', border: `1px solid ${isVerified ? '#d1fae5' : '#fee2e2'}` }}>
          <p style={{ margin: '0 0 0.75rem 0', fontWeight: 600, color: isVerified ? '#047857' : '#991b1b' }}>
            {isVerified ? '✓ Verified' : '✗ Mismatch'}
          </p>
          <p style={{ margin: '0 0 0.75rem 0', color: 'var(--muted)', fontSize: '0.9rem' }}>Computed SHA-256:</p>
          <p style={{ margin: 0, fontFamily: 'monospace', fontSize: '0.85rem', color: isVerified ? '#047857' : '#991b1b', wordBreak: 'break-all' }}>
            {computedHash}
          </p>
        </div>
      )}

      {isMismatch && (
        <div style={{ padding: '1rem', background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '8px', marginTop: '1rem' }}>
          <p style={{ margin: 0, color: '#991b1b', fontWeight: 600 }}>
            ⚠️ Hash Mismatch
          </p>
          <p style={{ margin: '0.5rem 0 0 0', color: '#7f1d1d', fontSize: '0.9rem' }}>
            This file doesn’t match the recorded version. It may have been altered, so don’t rely on it.
          </p>
        </div>
      )}
    </div>
  );
}
