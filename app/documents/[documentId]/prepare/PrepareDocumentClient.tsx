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
}: {
  row: Participant;
  index: number;
  onUpdate: (id: string, field: keyof Participant, value: string) => void;
  onRemove: (id: string) => void;
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
        <button type="button" className={prep.removeButton} onClick={() => onRemove(row.id)}>
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
        />
      </label>

      <label className={prep.fieldLabel}>
        Role
        <select
          className={prep.fieldInput}
          value={row.role}
          onChange={(event) => onUpdate(row.id, 'role', event.target.value)}
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
    signedBucket: string;
    signedPath: string;
  };
  me: {
    userId: string;
    name: string;
    email: string;
  };
  initialSigningRequests: SigningRequest[];
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [originalUrl, setOriginalUrl] = useState('');
  const [signedUrl, setSignedUrl] = useState('');
  const [participants, setParticipants] = useState<Participant[]>(() => toParticipantRows(initialSigningRequests));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadPreviewUrls() {
      if (document.filePath) {
        const { data } = await supabase.storage.from(document.bucket).createSignedUrl(document.filePath, 120);
        if (mounted) {
          setOriginalUrl(data?.signedUrl || '');
        }
      }

      if (document.signedPath) {
        const bucket = document.signedBucket || document.bucket;
        const { data } = await supabase.storage.from(bucket).createSignedUrl(document.signedPath, 120);
        if (mounted) {
          setSignedUrl(data?.signedUrl || '');
        }
      }
    }

    loadPreviewUrls();

    return () => {
      mounted = false;
    };
  }, [document.bucket, document.filePath, document.signedBucket, document.signedPath, supabase]);

  function updateParticipant(id: string, field: keyof Participant, value: string) {
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

  async function saveWorkflow() {
    setSaving(true);
    setError(false);
    setMessage('');

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

    for (let i = 0; i < cleaned.length; i += 1) {
      const row = cleaned[i];

      const response = await fetch('/api/signing-requests', {
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

      const payload = await response.json();
      if (!response.ok) {
        setSaving(false);
        setError(true);
        setMessage(payload.error || 'Unable to save signing workflow.');
        return;
      }
    }

    setSaving(false);
    setMessage('Signing workflow saved. Participants were added in order.');
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

      <article className={prep.previewPane}>
        <p className={prep.previewLabel}>Signed</p>
        {signedUrl ? (
          <iframe title={`${document.title} signed`} src={signedUrl} className={prep.previewFrame} />
        ) : (
          <div className={prep.previewFallback}>No signed version yet.</div>
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
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <div className={prep.buttonRow}>
          <button type="button" className={shared.linkButton} onClick={addParticipant}>Add participant</button>
          <button type="button" className={shared.linkButton} onClick={includeMe}>Include me</button>
        </div>

        <button type="button" className={shared.button} onClick={saveWorkflow} disabled={saving}>
          {saving ? 'Saving...' : 'Send'}
        </button>

        {message && <p className={error ? prep.errorText : prep.successText}>{message}</p>}
      </aside>
    </section>
  );
}