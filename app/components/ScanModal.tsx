'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '../../lib/supabase/client';
import styles from '../../styles/dashboard.module.css';

type ScanModalProps = {
  open: boolean;
  onClose: () => void;
};

type AuditRow = {
  id: string;
  event_type: string;
  actor_type: string;
  created_at: string;
  details: Record<string, unknown> | null;
};

const SCANNER_ID = 'lawgda-qr-scanner';

// Case folder labels carry .../cases/<uuid>; navigation stays on this site.
function extractCaseId(input: string) {
  const match = input.match(/\/cases\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i);
  return match ? match[1] : null;
}

function extractUuid(input: string) {
  const match = input.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  return match ? match[0] : null;
}

// Signed documents carry a QR code with a public verification link
// (.../verify/av_<token>). Only the token is used, and navigation always stays
// on this site, so a scanned code can never send the user to another origin.
function extractAuditToken(input: string) {
  const match = input.match(/\bav_[A-Za-z0-9_-]{20,}/);
  return match ? match[0] : null;
}

export default function ScanModal({ open, onClose }: ScanModalProps) {
  const router = useRouter();
  // Kept in a ref so a new onClose function from the parent never restarts the camera.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [busy, setBusy] = useState(false);
  const [scanText, setScanText] = useState('');
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [message, setMessage] = useState('');
  const scannerRef = useRef<any>(null);

  const loadAudit = useCallback(async (uuid: string) => {
    setBusy(true);
    setMessage('');

    const byDocument = await supabase
      .from('signing_audit_events')
      .select('id,event_type,actor_type,created_at,details')
      .eq('document_id', uuid)
      .order('created_at', { ascending: false })
      .limit(30);

    let rows = (byDocument.data ?? []) as AuditRow[];

    if (rows.length === 0) {
      const byRequest = await supabase
        .from('signing_audit_events')
        .select('id,event_type,actor_type,created_at,details')
        .eq('signing_request_id', uuid)
        .order('created_at', { ascending: false })
        .limit(30);
      rows = (byRequest.data ?? []) as AuditRow[];
    }

    setBusy(false);
    setAuditRows(rows);
    setMessage(rows.length > 0 ? 'Audit trail loaded.' : 'No audit trail found for this UUID.');
  }, [supabase]);

  useEffect(() => {
    let mounted = true;

    async function startScanner() {
      if (!open || typeof window === 'undefined') return;

      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode(SCANNER_ID);
      scannerRef.current = scanner;

      try {
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 8, qrbox: 220 },
          async (decodedText: string) => {
            if (!mounted) return;
            setScanText(decodedText);
            const auditToken = extractAuditToken(decodedText);
            if (auditToken) {
              onCloseRef.current();
              router.push(`/verify/${encodeURIComponent(auditToken)}`);
              return;
            }
            const caseId = extractCaseId(decodedText);
            if (caseId) {
              onCloseRef.current();
              router.push(`/cases/${caseId}`);
              return;
            }
            const uuid = extractUuid(decodedText);
            if (!uuid) {
              setMessage('QR decoded, but it is not a Lawgda verification link, case folder label or document ID.');
              return;
            }
            await loadAudit(uuid);
          },
          () => {
            // Suppress scan noise
          }
        );
      } catch {
        setMessage('Unable to access camera. Paste a QR value manually below.');
      }
    }

    startScanner();

    return () => {
      mounted = false;
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner) {
        // stop()/clear() may throw or return nothing depending on scanner state.
        Promise.resolve()
          .then(() => scanner.stop())
          .catch(() => {})
          .finally(() => {
            try {
              Promise.resolve(scanner.clear()).catch(() => {});
            } catch {
              // Already cleared.
            }
          });
      }
    };
  }, [loadAudit, open, router]);

  if (!open) return null;

  async function onManualLookup() {
    const auditToken = extractAuditToken(scanText);
    if (auditToken) {
      onClose();
      router.push(`/verify/${encodeURIComponent(auditToken)}`);
      return;
    }
    const caseId = extractCaseId(scanText);
    if (caseId) {
      onClose();
      router.push(`/cases/${caseId}`);
      return;
    }
    const uuid = extractUuid(scanText);
    if (!uuid) {
      setMessage('Enter a Lawgda verification link or a valid document ID.');
      return;
    }
    await loadAudit(uuid);
  }

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Scan QR code">
      <div className={styles.modalCardLarge}>
        <div className={styles.modalHeader}>
          <h3 className={styles.sectionTitle}>Scan QR Code</h3>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close QR scanner dialog" title="Close">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>
          </button>
        </div>

        <div className={styles.modalBody}>
          <div id={SCANNER_ID} className={styles.qrViewport} />

          <label className={styles.modalLabel}>
            QR payload, verification link or UUID
            <input
              className={styles.modalInput}
              value={scanText}
              onChange={(event) => setScanText(event.target.value)}
              placeholder="Paste scanned value"
            />
          </label>

          <div className={styles.modalActions}>
            <button type="button" className={styles.secondaryActionButton} onClick={onManualLookup} disabled={busy}>
              {busy ? 'Loading...' : 'Fetch Audit Trail'}
            </button>
          </div>
        </div>

        {message && <p className={styles.infoText}>{message}</p>}

        {auditRows.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Actor</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {auditRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.event_type}</td>
                    <td>{row.actor_type}</td>
                    <td>{new Date(row.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
