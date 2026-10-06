'use client';

import VerifyDocumentForm from './VerifyDocumentForm';
import styles from '../../styles/dashboard.module.css';

type VerifyModalProps = {
  open: boolean;
  onClose: () => void;
};

export default function VerifyModal({ open, onClose }: VerifyModalProps) {
  if (!open) return null;

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Verify document hash">
      <div className={styles.modalCardLarge} style={{ maxHeight: 'calc(100dvh - 2rem)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className={styles.modalHeader} style={{ flexShrink: 0 }}>
          <h3 className={styles.sectionTitle}>Verify Document</h3>
          <button type="button" className={styles.modalClose} onClick={onClose}>Close</button>
        </div>
        <div className={styles.modalBody} style={{ overflowY: 'auto', minHeight: 0, padding: '2px 4px 4px' }}>
          <VerifyDocumentForm />
        </div>
      </div>
    </div>
  );
}
