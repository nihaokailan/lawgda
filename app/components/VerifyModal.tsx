'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import VerifyDocumentForm from './VerifyDocumentForm';
import styles from '../../styles/dashboard.module.css';

type VerifyModalProps = {
  open: boolean;
  onClose: () => void;
};

export default function VerifyModal({ open, onClose }: VerifyModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!open || !mounted) return null;

  return createPortal(
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Verify document hash">
      <div className={styles.modalCardLarge}>
        <div className={styles.modalHeader}>
          <h3 className={styles.sectionTitle}>Verify Document</h3>
          <button
            type="button"
            className={styles.modalClose}
            onClick={onClose}
            aria-label="Close verification dialog"
            title="Close"
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="m5 5 10 10M15 5 5 15" />
            </svg>
          </button>
        </div>
        <div className={styles.modalBody} style={{ overflowY: 'auto', minHeight: 0, padding: '2px 4px 4px' }}>
          <VerifyDocumentForm />
        </div>
      </div>
    </div>,
    document.body
  );
}
