'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import styles from '../../styles/dashboard.module.css';

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

/**
 * Physical-to-digital bridge: a QR label for the physical case folder. The
 * code only carries the case URL; opening it still requires a signed-in,
 * authorized Lawgda account, so the label itself reveals nothing.
 */
export default function CaseQrCard({ caseId, caseTitle, caseNumber = null }: { caseId: string; caseTitle: string; caseNumber?: string | null }) {
  const [caseUrl, setCaseUrl] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');

  useEffect(() => {
    const url = `${window.location.origin}/cases/${encodeURIComponent(caseId)}`;
    setCaseUrl(url);
    QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 320 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [caseId]);

  function printLabel() {
    const label = window.open('', '_blank', 'width=420,height=560');
    if (!label) return;
    label.document.write(`<!doctype html><title>Case folder label</title>
      <body style="font-family:system-ui,sans-serif;text-align:center;padding:24px">
        <div style="display:inline-block;border:2px solid #6a0f1a;border-radius:12px;padding:18px 22px">
          <div style="color:#6a0f1a;font-weight:800;letter-spacing:.08em">LAWGDA · CASE FOLDER</div>
          <h2 style="margin:.4rem 0 ${caseNumber ? '.2rem' : '.8rem'};font-size:1.1rem">${escapeHtml(caseTitle)}</h2>
          ${caseNumber ? `<p style="margin:0 0 .8rem;font-size:.85rem;color:#333">${escapeHtml(caseNumber)}</p>` : ''}
          <img src="${qrDataUrl}" width="240" height="240" alt="Case QR code" />
          <p style="font-size:.75rem;color:#444;margin:.6rem 0 0">Scan to open this case's tracking history and chain of custody.</p>
          <p style="font-size:.65rem;color:#777;margin:.3rem 0 0;word-break:break-all">Case ID: ${escapeHtml(caseId)}</p>
        </div>
        <script>window.onload = () => { window.print(); };</script>
      </body>`);
    label.document.close();
  }

  return (
    <section className={styles.workspaceCard}>
      <h3 className={styles.sectionTitle}>Case Folder QR</h3>
      <p className={styles.infoText}>Print this label and attach it to the physical case folder. Scanning it opens this case&apos;s documents, statuses and audit trail for authorized users.</p>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        {qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrDataUrl} alt={`QR code for case ${caseTitle}`} width={140} height={140} style={{ border: '1px solid var(--border)', borderRadius: 8 }} />
        ) : (
          <div style={{ width: 140, height: 140 }} aria-hidden="true" />
        )}
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          <button type="button" className={styles.primaryActionButton} onClick={printLabel} disabled={!qrDataUrl}>Print folder label</button>
          {qrDataUrl && (
            <a className={styles.secondaryActionButton} href={qrDataUrl} download={`case-${caseId}-qr.png`} style={{ textAlign: 'center' }}>Download QR (PNG)</a>
          )}
          <small style={{ color: 'var(--muted)', wordBreak: 'break-all', maxWidth: 320 }}>{caseUrl}</small>
        </div>
      </div>
    </section>
  );
}
