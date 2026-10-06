'use client';

import { useEffect, useMemo, useState } from 'react';
import { DndContext, PointerSensor, closestCenter, type DragEndEvent, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { createSupabaseBrowserClient } from '../../../../lib/supabase/client';
import prep from './prepare.module.css';
import shared from '../../../../styles/shared.module.css';

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

type Participant = {
  id: string;
  name: string;
  email: string;
  role: 'Signer' | 'Approver' | 'Viewer';
};

function SortableParticipantCard({
  row,
  index,
  onUpdate,
  onRemove,
  locked,
  flaggedMessage,
}: {
  row: Participant;
  index: number;
  onUpdate: (id: string, field: keyof Participant, value: string) => void;
  onRemove: (id: string) => void;
  locked: boolean;
  flaggedMessage?: string;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${prep.participantRow} ${isDragging ? prep.participantRowDragging : ''}`}
    >
      <div className={prep.rowHeader}>
        <div className={prep.rowLeftCluster}>
          <button
            ref={setActivatorNodeRef}
            type="button"
            className={prep.dragHandle}
            aria-label={`Drag participant ${index + 1}`}
            disabled={locked}
            {...attributes}
            {...listeners}
          >
            <span className={prep.dotGrid}>
              <span className={prep.dot} />
              <span className={prep.dot} />
              <span className={prep.dot} />
              <span className={prep.dot} />
              <span className={prep.dot} />
              <span className={prep.dot} />
            </span>
          </button>
          <span>#{index + 1}</span>
        </div>
        <button type="button" className={prep.removeButton} onClick={() => onRemove(row.id)} disabled={locked}>
          Remove
        </button>
      </div>

      <label className={prep.fieldLabel}>
        Name
        <input
          className={prep.fieldInput}
          value={row.name}
          onChange={(event) => onUpdate(row.id, 'name', event.target.value)}
          placeholder="Participant name"
          disabled={locked}
        />
      </label>

      <label className={prep.fieldLabel}>
        Email
        <input
          className={prep.fieldInput}
          type="email"
          value={row.email}
          onChange={(event) => onUpdate(row.id, 'email', event.target.value)}
          placeholder="email@example.com"
          disabled={locked}
          aria-invalid={Boolean(flaggedMessage)}
        />
        {flaggedMessage && (
          <span role="alert" style={{ color: '#991b1b', fontSize: '0.85rem', fontWeight: 600 }}>{flaggedMessage}</span>
        )}
      </label>

      <label className={prep.fieldLabel}>
        Role
        <select
          className={prep.fieldInput}
          value={row.role}
          onChange={(event) => onUpdate(row.id, 'role', event.target.value)}
          disabled={locked}
        >
          <option value="Signer">Signer</option>
          <option value="Approver">Approver</option>
          <option value="Viewer">Viewer</option>
        </select>
      </label>
    </div>
  );
}

function toParticipantRows(rows: SigningRequest[]): Participant[] {
  if (!rows.length) {
    return [
      {
        id: crypto.randomUUID(),
        name: '',
        email: '',
        role: 'Signer',
      },
    ];
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.signer_name || '',
    email: row.signer_email || '',
    role: 'Signer',
  }));
}

export default function PrepareDocumentClient({
  document,
  me,
  initialSigningRequests,
}: {
  document: {
    id: string;
    title: string;
    bucket: string;
    filePath: string;
  };
  me: {
    userId: string;
    name: string;
    email: string;
    role: string;
  };
  initialSigningRequests: SigningRequest[];
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [originalUrl, setOriginalUrl] = useState('');
  const [participants, setParticipants] = useState<Participant[]>(() => toParticipantRows(initialSigningRequests));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);
  const [staffEmails, setStaffEmails] = useState<string[]>([]);
  const [workflowSent, setWorkflowSent] = useState(initialSigningRequests.length > 0);
  const workflowLocked = workflowSent;

  useEffect(() => {
    let mounted = true;

    async function createPreviewUrl(bucket: string, filePath: string) {
      if (!bucket || !filePath) {
        return '';
      }

      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(filePath, 120);
      if (error || !data?.signedUrl) {
        return '';
      }

      return data.signedUrl;
    }

    async function loadPreviewUrls() {
      let hasAuthorizedPreview = false;
      try {
        const response = await fetch(`/api/documents/${encodeURIComponent(document.id)}/download`);
        const payload = await response.json();
        if (response.ok && payload.downloadUrl && mounted) {
          hasAuthorizedPreview = true;
          setOriginalUrl(payload.downloadUrl);
        }
      } catch {
        // Fall back to direct Storage URL resolution below.
      }

      const candidateBuckets = Array.from(new Set([document.bucket, 'secure_docs', 'evidence', 'org-documents', 'documents'].filter(Boolean)));
      const candidatePaths = Array.from(new Set([
        document.filePath,
        document.filePath?.replace(/^\//, ''),
        document.filePath ? document.filePath.split('/').slice(1).join('/') : '',
      ].filter(Boolean)));

      let resolvedOriginal = '';
      for (const bucket of candidateBuckets) {
        for (const filePath of candidatePaths) {
          const signedUrl = await createPreviewUrl(bucket, filePath);
          if (signedUrl) {
            resolvedOriginal = signedUrl;
            break;
          }
        }
        if (resolvedOriginal) {
          break;
        }
      }

      if (mounted && !hasAuthorizedPreview) {
        setOriginalUrl(resolvedOriginal);
      }
    }

    // Load once. Re-resolving signed URLs on a timer swapped the iframe `src`
    // every few seconds, which made the original document flash and reload.
    loadPreviewUrls();

    return () => {
      mounted = false;
    };
  }, [document.id, document.bucket, document.filePath, supabase]);

  function updateParticipant(id: string, field: keyof Participant, value: string) {
    if (field === 'email') {
      setStaffEmails([]);
    }
    setParticipants((current) => current.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  }

  function addParticipant() {
    setParticipants((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        name: '',
        email: '',
        role: 'Signer',
      },
    ]);
  }

  function includeMe() {
    setParticipants((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        name: me.name,
        email: me.email,
        role: 'Signer',
      },
    ]);
  }

  function removeParticipant(id: string) {
    setParticipants((current) => (current.length <= 1 ? current : current.filter((row) => row.id !== id)));
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    setParticipants((current) => {
      const oldIndex = current.findIndex((row) => row.id === active.id);
      const newIndex = current.findIndex((row) => row.id === over.id);

      if (oldIndex < 0 || newIndex < 0) {
        return current;
      }

      return arrayMove(current, oldIndex, newIndex);
    });
  }

  const readyParticipants = participants.filter((row) => row.name.trim() && row.email.trim());

  // Sending locks the workflow, so confirm the names/emails first.
  function requestSend() {
    if (readyParticipants.length === 0) {
      void saveWorkflow();
      return;
    }
    setConfirmSendOpen(true);
  }

  async function saveWorkflow() {
    setConfirmSendOpen(false);
    setSaving(true);
    setError(false);
    setMessage('');

    if (initialSigningRequests.length > 0) {
      setSaving(false);
      setError(true);
      setMessage('A signing workflow has already been sent for this document. Create a new document workflow instead of sending duplicate links.');
      return;
    }

    const cleaned = participants
      .map((row) => ({
        ...row,
        name: row.name.trim(),
        email: row.email.trim().toLowerCase(),
      }))
      .filter((row) => row.name && row.email);

    if (cleaned.length === 0) {
      setSaving(false);
      setError(true);
      setMessage('Add at least one participant with name and email.');
      return;
    }

    // Check every participant before any link is created or emailed, so a
    // Staff email blocks the whole workflow instead of sending part of it.
    try {
      const checkResponse = await fetch('/api/signing-requests/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: cleaned.map((row) => row.email) }),
      });
      const checkPayload = await checkResponse.json();
      if (!checkResponse.ok) {
        throw new Error(checkPayload.error || 'Unable to validate participants.');
      }
      if (checkPayload.staffEmails?.length) {
        setStaffEmails(checkPayload.staffEmails);
        setSaving(false);
        setError(true);
        setMessage(
          `Staff members are not allowed to sign documents. Please change these emails and try again: ${checkPayload.staffEmails.join(', ')}. No signing links were sent.`
        );
        return;
      }
    } catch (failure) {
      setSaving(false);
      setError(true);
      setMessage(failure instanceof Error ? failure.message : 'Unable to validate participants.');
      return;
    }

    let emailDeliveryError = '';
    let deferredInvitationCount = 0;
    for (let i = 0; i < cleaned.length; i += 1) {
      const row = cleaned[i];

      let response;
      let payload;
      try {
        response = await fetch('/api/signing-requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documentId: document.id,
            signerType: 'external',
            signerName: row.name,
            signerEmail: row.email,
            signingOrder: i + 1,
            enforceSequential: true,
          }),
        });
        payload = await response.json();
      } catch {
        setSaving(false);
        setError(true);
        setMessage('The signing service is unavailable. Confirm the app is running, then try again.');
        return;
      }

      if (!response.ok) {
        setSaving(false);
        setError(true);
        setMessage(payload.error || 'Unable to save signing workflow.');
        return;
      }

      if (!payload.emailSent) {
        emailDeliveryError = payload.emailError || 'Gmail could not deliver one or more signing invitations.';
      }
      if (payload.invitationDeferred) {
        deferredInvitationCount += 1;
      }
    }

    setSaving(false);
    setError(Boolean(emailDeliveryError));
    setMessage(
      emailDeliveryError
        || (deferredInvitationCount > 0
          ? 'Signing workflow saved. Invitations will be sent to each next signer when the preceding signer completes.'
          : 'Signing workflow saved and invitation emails were sent.')
    );
    setWorkflowSent(true);
  }

  if (workflowSent) {
    const sentParticipants = initialSigningRequests.length > 0 ? toParticipantRows(initialSigningRequests) : participants;
    return (
      <section className={shared.sectionCard}>
        <h2 className={shared.cardTitle}>Signing workflow sent</h2>
        <p className={shared.cardText}>The document is locked from further drafting changes. Signers will receive their invitations in order.</p>
        <div style={{ display: 'grid', gap: '0.6rem', marginTop: '1rem' }}>
          {sentParticipants.map((participant, index) => (
            <div key={participant.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.6rem' }}>
              <strong>#{index + 1} {participant.name}</strong>
              <div className={shared.helpText}>{participant.email}</div>
            </div>
          ))}
        </div>
        {message && <p className={error ? prep.errorText : prep.successText} style={{ marginTop: '1rem' }}>{message}</p>}
      </section>
    );
  }

  return (
    <section className={prep.prepareLayout}>
      <article className={prep.previewPane}>
        <p className={prep.previewLabel}>ORIGINAL DOCUMENT</p>
        {originalUrl ? (
          <iframe title={`${document.title} original`} src={originalUrl} className={prep.previewFrame} />
        ) : (
          <div className={prep.previewFallback}>Original document preview unavailable.</div>
        )}
      </article>

      <aside className={prep.sidebarPane}>
        <h3 className={prep.sidebarTitle}>Participants</h3>
        <p className={prep.sidebarSubtitle}>Set signing order workflow</p>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={participants.map((row) => row.id)} strategy={verticalListSortingStrategy}>
            <div className={prep.participantList}>
              {participants.map((row, index) => (
                <SortableParticipantCard
                  key={row.id}
                  row={row}
                  index={index}
                  onUpdate={updateParticipant}
                  onRemove={removeParticipant}
                  locked={workflowLocked}
                  flaggedMessage={
                    staffEmails.includes(row.email.trim().toLowerCase())
                      ? 'This email belongs to a Staff member. Staff are not allowed to sign - please change it.'
                      : undefined
                  }
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <div className={prep.buttonRow}>
          <button type="button" className={shared.linkButton} onClick={addParticipant} disabled={workflowLocked}>Add participant</button>
          {me.role !== 'staff' && (
            <button type="button" className={shared.linkButton} onClick={includeMe} disabled={workflowLocked}>Include me</button>
          )}
        </div>

        <button type="button" className={shared.button} onClick={requestSend} disabled={saving || workflowLocked}>
          {saving ? 'Saving...' : workflowLocked ? 'Workflow locked' : 'Send signing links'}
        </button>

        {confirmSendOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-send-title"
            style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}
          >
            <div className={shared.sectionCard} style={{ maxWidth: 480, width: '100%', margin: 0, background: '#fff' }}>
              <h3 id="confirm-send-title" style={{ marginTop: 0 }}>Are you sure the details are correct?</h3>
              <p className={shared.cardText}>Signing links will be sent in this order and the workflow will be locked:</p>
              <ol style={{ paddingLeft: '1.2rem', lineHeight: 1.6 }}>
                {readyParticipants.map((row) => (
                  <li key={row.id}>{row.name.trim()} &ndash; {row.email.trim().toLowerCase()}</li>
                ))}
              </ol>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
                <button type="button" className={shared.linkButton} onClick={() => setConfirmSendOpen(false)}>No</button>
                <button type="button" className={shared.button} onClick={() => { void saveWorkflow(); }}>Yes</button>
              </div>
            </div>
          </div>
        )}

        {message && <p className={error ? prep.errorText : prep.successText}>{message}</p>}
      </aside>
    </section>
  );
}
