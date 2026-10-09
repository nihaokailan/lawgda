'use client';

import { useRouter } from 'next/navigation';
import { saveVerificationSession } from '../../lib/verificationSession';
import { useEffect, useRef, useState } from 'react';
import { compareDocumentBytes, getVerificationTarget, recordIntegrityCheck } from '../../lib/documentVerification';
import VerificationFilePicker from './VerificationFilePicker';
import shared from '../../styles/shared.module.css';

type DocumentOption = {
  id: string;
  title: string | null;
  filename: string | null;
  status: string | null;
  created_at: string | null;
  sha256_hash: string | null;
  metadata: Record<string, unknown> | null;
};

export default function VerifyDocumentForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [documents, setDocuments] = useState<DocumentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [documentId, setDocumentId] = useState('');
  const [version, setVersion] = useState('original');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ computedHash: string; matches: boolean; expectedHash: string } | null>(null);
  const operation = useRef<AbortController | null>(null);
  const selectedDocument = documents.find(document => document.id === documentId);
  const hasSignedVersion = Boolean(selectedDocument?.metadata?.post_sign_hash);

  useEffect(() => {
    let active = true;
    async function loadDocuments() {
      setLoading(true);
      setLoadError('');
      try {
        const response = await fetch('/api/verification-documents', { cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Unable to load your documents.');
        if (active) setDocuments(payload.documents || []);
      } catch (failure) {
        if (active) setLoadError(failure instanceof Error ? failure.message : 'Unable to load your documents. Please try again.');
      } finally {
        if (active) setLoading(false);
      }
    }
    loadDocuments();
    return () => {
      active = false;
      operation.current?.abort();
    };
  }, [loadAttempt]);

  function resetResult() {
    operation.current?.abort();
    setBusy(false);
    setError('');
    setResult(null);
  }

  async function verify() {
    if (!selectedDocument || !file) return;
    resetResult();
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    try {
      const target = getVerificationTarget(selectedDocument, version);
      if (!target.hash) throw new Error('This document version does not have a recorded hash yet.');
      const bytes = await file.arrayBuffer();
      const comparison = await compareDocumentBytes(bytes, target.hash);
      // Every check, passed or failed, is written to the document's audit trail.
      await recordIntegrityCheck(selectedDocument.id, comparison.computedHash, version, 'verify_page');
      if (!controller.signal.aborted) {
        const sessionId = saveVerificationSession({
          documentId: selectedDocument.id,
          title: selectedDocument.title || selectedDocument.filename || 'Document',
          source: 'device', version,
          checkedFile: new Blob([bytes], { type: file.type }),
          checkedName: file.name,
          ...comparison, expectedHash: target.hash,
        });
        router.push(`/verify/results/${sessionId}`);
      }
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Unable to verify the document. Please try again.');
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <div>
      <label className={shared.fieldLabel}>
        Choose a file from your device
        <input className={shared.input} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={busy} onChange={event => {
          resetResult();
          setFile(event.target.files?.[0] || null);
        }} />
      </label>

      <VerificationFilePicker documents={documents} selectedId={documentId} loading={loading} disabled={busy || loading || Boolean(loadError)} onSelect={id => {
        resetResult();
        setDocumentId(id);
        const document = documents.find(item => item.id === id);
        setVersion(document?.metadata?.post_sign_hash ? 'signed' : 'original');
      }} />
      {loadError && <div>
        <p className={`${shared.message} ${shared.messageError}`} role="alert">{loadError}</p>
        <button type="button" className={shared.linkButton} onClick={() => setLoadAttempt(attempt => attempt + 1)}>Retry loading documents</button>
      </div>}

      {selectedDocument && <label className={shared.fieldLabel} style={{ marginTop: 16 }}>
        Document version
        <select className={shared.select} value={version} disabled={busy} onChange={event => {
          resetResult();
          setVersion(event.target.value);
        }}>
          <option value="original">Original uploaded document</option>
          {hasSignedVersion && <option value="signed">Latest signed document</option>}
        </select>
      </label>}

      <p className={shared.helpText}>Your file is checked locally against the selected document version’s recorded hash.</p>
      <button type="button" className={shared.button} onClick={verify} disabled={busy || loading || !selectedDocument || !file}>
        {busy ? 'Verifying…' : 'Verify Document'}
      </button>
      {error && <p className={`${shared.message} ${shared.messageError}`} role="alert">{error}</p>}
      {result && <div aria-live="polite" style={{ marginTop: 16 }}>
        <p className={`${shared.message} ${result.matches ? shared.messageSuccess : shared.messageError}`}>
          {result.matches ? 'Integrity verified — the file matches the recorded document version.' : 'Hash mismatch — this file does not match the selected document version.'}
        </p>
        <p className={shared.cardText}>Computed SHA-256</p>
        <pre className={shared.hashBlock}>{result.computedHash}</pre>
        <p className={shared.cardText}>Recorded SHA-256</p>
        <pre className={shared.hashBlock}>{result.expectedHash}</pre>
      </div>}
    </div>
  );
}
