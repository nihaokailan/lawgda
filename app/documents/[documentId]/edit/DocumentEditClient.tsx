'use client';

import AuditTrailList, { type AuditTrailEntry } from '../../../components/AuditTrailList';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '../../../../lib/supabase/client';
import styles from '../../../../styles/dashboard.module.css';

type SigningRequest = {
  id: string;
  signer_name: string;
  signer_email: string;
  signing_order: number;
  status: string;
  created_at: string;
  signed_at: string | null;
  viewed_at: string | null;
};

type AuditEntry = {
  id: string;
  event_type: string;
  created_at: string;
  actor_user_id: string | null;
  details: Record<string, unknown> | null;
};

export default function DocumentEditClient({
  document,
  signingRequests: initialSigningRequests,
  auditTrail: initialAuditTrail,
}: {
  document: {
    id: string;
    title: string;
    status: string;
    filePath: string;
    bucket: string;
    sha256Hash: string | null;
    isOwner: boolean;
    metadata: Record<string, unknown> | null;
  };
  signingRequests: SigningRequest[];
  auditTrail: AuditTrailEntry[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [previewUrl, setPreviewUrl] = useState('');
  const [signingRequests, setSigningRequests] = useState<SigningRequest[]>(initialSigningRequests);
  const [auditTrail, setAuditTrail] = useState<AuditTrailEntry[]>(initialAuditTrail);
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [signingOrder, setSigningOrder] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadSignedUrl() {
      if (!document.filePath) {
        setError(true);
        setMessage('Document has no file path.');
        return;
      }

      const { data, error: signedUrlError } = await supabase.storage
        .from(document.bucket)
        .createSignedUrl(document.filePath, 120);

      if (!active) return;

      if (signedUrlError) {
        setError(true);
        setMessage(`Unable to load preview: ${signedUrlError.message}`);
        return;
      }

      setPreviewUrl(data?.signedUrl || '');
    }

    loadSignedUrl();

    return () => {
      active = false;
    };
  }, [document.bucket, document.filePath, supabase]);

  async function refreshPanelData() {
    const [reqResponse, auditResponse] = await Promise.all([
      fetch(`/api/signing-requests?documentId=${encodeURIComponent(document.id)}`),
      fetch(`/api/documents/${encodeURIComponent(document.id)}/audit`),
    ]);

    if (reqResponse.ok) {
      const reqPayload = await reqResponse.json();
      setSigningRequests(reqPayload.signingRequests || []);
    }

    if (auditResponse.ok) {
      const auditPayload = await auditResponse.json();
      setAuditTrail(auditPayload.auditTrail || []);
    }
  }

  async function addSigner(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(false);
    setMessage('');

    const response = await fetch('/api/signing-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentId: document.id,
        signerType: 'external',
        signerName: signerName.trim(),
        signerEmail: signerEmail.trim().toLowerCase(),
        signingOrder,
        enforceSequential: true,
      }),
    });

    const payload = await response.json();
    setBusy(false);

    if (!response.ok) {
      setError(true);
      setMessage(payload.error || 'Unable to assign signer.');
      return;
    }

    setSignerName('');
    setSignerEmail('');
    setSigningOrder(signingOrder + 1);
    setMessage('Signer assigned successfully.');
    await refreshPanelData();
    router.refresh();
  }

  return (
    <section className={styles.editorSplitLayout}>
      <article className={styles.editorLeftPane}>
        <header className={styles.editorPaneHeader}>
          <h3 className={styles.sectionTitle}>{document.title}</h3>
          <p className={styles.bannerSubtitle}>Status: {document.status}</p>
        </header>
        {previewUrl ? (
          <iframe title={document.title} src={previewUrl} className={styles.editorPreviewFrame} />
        ) : (
          <p className={styles.emptyText}>Loading document preview...</p>
        )}
      </article>

      <article className={styles.editorRightPane}>
        <div className={styles.editorPaper}>
          <h3 className={styles.sectionTitle}>Signer Assignment and Order</h3>
          {document.isOwner ? (
            <form onSubmit={addSigner} className={styles.modalBody}>
              <label className={styles.modalLabel}>
                Signer Name
                <input className={styles.modalInput} value={signerName} onChange={(e) => setSignerName(e.target.value)} required />
              </label>
              <label className={styles.modalLabel}>
                Signer Email
                <input className={styles.modalInput} type="email" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} required />
              </label>
              <label className={styles.modalLabel}>
                Signing Order
                <input className={styles.modalInput} type="number" min={1} value={signingOrder} onChange={(e) => setSigningOrder(Number(e.target.value) || 1)} required />
              </label>
              <button type="submit" className={styles.primaryActionButton} disabled={busy}>Assign Signer</button>
            </form>
          ) : (
            <p className={styles.infoText}>Only the document owner can edit signer order.</p>
          )}

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Signer</th>
                  <th>Order</th>
                  <th>Status</th>
                  <th>Signature Time</th>
                </tr>
              </thead>
              <tbody>
                {signingRequests.length === 0 && (
                  <tr>
                    <td colSpan={4}>No signers assigned yet.</td>
                  </tr>
                )}
                {signingRequests.map((item) => (
                  <tr key={item.id}>
                    <td>{item.signer_name} ({item.signer_email})</td>
                    <td>{item.signing_order}</td>
                    <td>{item.status}</td>
                    <td>{item.signed_at ? new Date(item.signed_at).toLocaleString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className={styles.editorPaper}>
          <h3 className={styles.sectionTitle}>Audit Trail and Signatures</h3>
          <AuditTrailList entries={auditTrail} maxHeight={360} />
        </div>

        {message && <p className={error ? styles.alertError : styles.alertSuccess}>{message}</p>}
      </article>
    </section>
  );
}
