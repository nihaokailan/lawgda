'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

/**
 * Physical-to-digital bridge: a QR label for the physical case folder. The
 * code only carries the folder's URL; opening it still requires a signed-in,
 * authorized Lawgda account, so the label itself reveals nothing.
 */
export function useFolderLabel({ caseId, caseTitle, caseNumber = null }: { caseId: string; caseTitle: string; caseNumber?: string | null }) {
  const [qrDataUrl, setQrDataUrl] = useState('');

  useEffect(() => {
    const url = `${window.location.origin}/cases/${encodeURIComponent(caseId)}`;
    QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 320 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [caseId]);

  function printLabel() {
    const label = window.open('', '_blank', 'width=420,height=560');
    if (!label) return false;
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
    return true;
  }

  return { qrDataUrl, printLabel, downloadName: `case-${caseId}-qr.png` };
}
