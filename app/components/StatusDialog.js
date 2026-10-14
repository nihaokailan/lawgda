'use client';

import Dialog from './Dialog';
import shared from '../../styles/shared.module.css';

/**
 * Shows the outcome of an action (a warning, error or confirmation) as a
 * popup instead of inline text. Pass the page's message, whether it is an
 * error, and a callback that clears the message.
 */
export default function StatusDialog({ message, error = false, onClose, successTitle = 'Done' }) {
  return (
    <Dialog
      open={Boolean(message)}
      tone={error ? 'error' : 'success'}
      title={error ? 'Please check this' : successTitle}
      onClose={onClose}
      actions={<button type="button" className={shared.button} onClick={onClose}>OK</button>}
    >
      <p>{message}</p>
    </Dialog>
  );
}
