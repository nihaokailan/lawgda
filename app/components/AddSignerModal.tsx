'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '../../lib/supabase/client';
import { addSigner, removeSigner } from '../cases/actions';
import styles from '../../styles/dashboard.module.css';

type SignerRow = {
  user_id: string;
  role: string;
  email?: string | null;
};

type AddSignerModalProps = {
  open: boolean;
  documentId: string;
  onClose: () => void;
  onChanged: () => void;
};

export default function AddSignerModal({ open, documentId, onClose, onChanged }: AddSignerModalProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [signers, setSigners] = useState<SignerRow[]>([]);

  const loadSigners = useCallback(async () => {
    const { data: permissionRows } = await supabase
      .from('document_permissions')
      .select('user_id,role')
      .eq('document_id', documentId)
      .order('created_at', { ascending: true });

    const ids = (permissionRows ?? []).map((row) => row.user_id).filter(Boolean);
    let emailMap = new Map<string, string>();

    if (ids.length > 0) {
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('user_id,email')
        .in('user_id', ids);

      emailMap = new Map((profileRows ?? []).map((item) => [item.user_id, item.email]));
    }

    const rows = (permissionRows ?? []).map((row) => ({
      user_id: row.user_id,
      role: row.role,
      email: emailMap.get(row.user_id) ?? null,
    }));

    setSigners(rows);
  }, [documentId, supabase]);

  useEffect(() => {
    if (!open) {
      setSigners([]);
      return;
    }

    void loadSigners();
  }, [open, documentId, loadSigners]);

  if (!open) {
    return null;
  }

  async function handleAddSigner(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    setError(false);

    try {
      await addSigner(documentId, target.trim());
      setTarget('');
      setMessage('Signer added successfully.');
      await loadSigners();
      onChanged();
    } catch (err) {
      setError(true);
      setMessage(err instanceof Error ? err.message : 'Unable to add signer.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveSigner(userId: string) {
    setBusy(true);
    setMessage('');
    setError(false);

    try {
      await removeSigner(documentId, userId);
      setMessage('Signer removed successfully.');
      await loadSigners();
      onChanged();
    } catch (err) {
      setError(true);
      setMessage(err instanceof Error ? err.message : 'Unable to remove signer.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Add signer">
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <h3 className={styles.sectionTitle}>Add Signer</h3>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close add signer dialog" title="Close">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>
          </button>
        </div>

        <form className={styles.modalBody} onSubmit={handleAddSigner}>
          <label className={styles.modalLabel}>
            Signer Email or User ID
            <input
              className={styles.modalInput}
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              placeholder="user@email.com or UUID"
              required
            />
          </label>

          <p className={styles.infoText}>
            Signers are auto-assigned with role signer.
          </p>

          <div className={styles.modalActions}>
            <button type="submit" className={styles.primaryActionButton} disabled={busy}>
              {busy ? 'Saving...' : 'Add Signer'}
            </button>
          </div>
        </form>

        {signers.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {signers.map((signer) => (
                  <tr key={signer.user_id}>
                    <td>{signer.email || signer.user_id}</td>
                    <td>{signer.role}</td>
                    <td>
                      {signer.role !== 'owner' && (
                        <button
                          type="button"
                          className={styles.secondaryActionButton}
                          onClick={() => handleRemoveSigner(signer.user_id)}
                          disabled={busy}
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {message && <p className={error ? styles.alertError : styles.alertSuccess}>{message}</p>}
      </div>
    </div>
  );
}
