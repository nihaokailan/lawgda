'use client';

import { useEffect, useRef } from 'react';
import shared from '../../styles/shared.module.css';

const TONE_ICONS = {
  success: <path d="m5.5 12.5 4.2 4.2L18.5 7.5" />,
  error: <><path d="M12 5v9" /><path d="M12 19h.01" /></>,
  warning: <><path d="M12 5v9" /><path d="M12 19h.01" /></>,
};

/**
 * Popup dialog used for confirmations and for the outcome of an action
 * (success or error). Closes on Escape or a click on the backdrop when
 * `onClose` is given; actions are passed in as buttons.
 */
export default function Dialog({ open, tone = 'neutral', title, children, actions, onClose }) {
  const cardRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cardRef.current?.querySelector('button, a[href]')?.focus();

    function handleKeyDown(event) {
      if (event.key === 'Escape' && onClose) onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={shared.dialogOverlay}
      onMouseDown={(event) => { if (event.target === event.currentTarget && onClose) onClose(); }}
    >
      <div
        ref={cardRef}
        className={shared.dialogCard}
        role={tone === 'error' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        {TONE_ICONS[tone] && (
          <span className={`${shared.dialogIcon} ${shared[`dialogIcon_${tone}`]}`} aria-hidden="true">
            <svg viewBox="0 0 24 24">{TONE_ICONS[tone]}</svg>
          </span>
        )}
        <h2 id="dialog-title" className={shared.dialogTitle}>{title}</h2>
        <div className={shared.dialogBody}>{children}</div>
        {actions && <div className={shared.dialogActions}>{actions}</div>}
      </div>
    </div>
  );
}
