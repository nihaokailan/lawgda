'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import shared from '../../styles/shared.module.css';
import StatusDialog from './StatusDialog';

type Props = {
  documentId: string;
  title: string;
  caseNumber: string | null;
  tags: string[];
  canEdit: boolean;
  locked: boolean;
};

/**
 * Indexing panel for Lawyers and Paralegal/Staff. Every saved change —
 * including corrections of wrong entries — is written to the document's
 * hash-chained audit trail with the old and new values.
 */
export default function DocumentDetailsEditor({ documentId, title, caseNumber, tags, canEdit, locked }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ title, caseNumber: caseNumber ?? '', tags: tags.join(', '), note: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    setError(false);
    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/index`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: form.title, caseNumber: form.caseNumber, tags: form.tags, note: form.note }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to save the changes.');
      setEditing(false);
      setForm((current) => ({ ...current, note: '' }));
      setMessage('Saved. The change is recorded in the audit trail.');
      router.refresh();
    } catch (failure) {
      setError(true);
      setMessage(failure instanceof Error ? failure.message : 'Unable to save the changes.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={shared.sectionCard} style={{ marginTop: 0, marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>Document Details</h3>
        {canEdit && !locked && !editing && (
          <button type="button" className={shared.linkButton} onClick={() => setEditing(true)}>Edit details</button>
        )}
      </div>

      {!editing ? (
        <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '0.35rem 1rem', margin: '0.75rem 0 0' }}>
          <dt style={{ color: 'var(--muted)' }}>Title</dt><dd style={{ margin: 0 }}>{title}</dd>
          <dt style={{ color: 'var(--muted)' }}>Case number</dt><dd style={{ margin: 0 }}>{caseNumber || '—'}</dd>
          <dt style={{ color: 'var(--muted)' }}>Tags</dt><dd style={{ margin: 0 }}>{tags.length ? tags.join(', ') : '—'}</dd>
        </dl>
      ) : (
        <form onSubmit={save} className={shared.formGrid} style={{ marginTop: '0.75rem' }}>
          <label className={shared.fieldLabel}>
            Title
            <input className={shared.input} value={form.title} maxLength={200} required onChange={(event) => setForm({ ...form, title: event.target.value })} />
          </label>
          <label className={shared.fieldLabel}>
            Case number
            <input className={shared.input} value={form.caseNumber} maxLength={80} placeholder="e.g. Civil Case No. R-DVO-26-01234" onChange={(event) => setForm({ ...form, caseNumber: event.target.value })} />
          </label>
          <label className={shared.fieldLabel}>
            Tags (comma-separated)
            <input className={shared.input} value={form.tags} placeholder="e.g. affidavit, land title" onChange={(event) => setForm({ ...form, tags: event.target.value })} />
          </label>
          <label className={shared.fieldLabel}>
            Reason for change (optional)
            <input className={shared.input} value={form.note} maxLength={300} placeholder="e.g. Corrected a typo in the case number" onChange={(event) => setForm({ ...form, note: event.target.value })} />
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" className={shared.button} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
            <button type="button" className={shared.linkButton} disabled={busy} onClick={() => { setEditing(false); setForm({ title, caseNumber: caseNumber ?? '', tags: tags.join(', '), note: '' }); }}>Cancel</button>
          </div>
        </form>
      )}

      {locked && <p className={shared.helpText} style={{ marginBottom: 0 }}>This document is Filed, so its details are locked.</p>}
      {canEdit && !locked && <p className={shared.helpText} style={{ marginBottom: 0 }}>Edits change details only, not the file. Each change is logged.</p>}
      <StatusDialog message={message} error={Boolean(error)} onClose={() => setMessage('')} />
    </section>
  );
}
