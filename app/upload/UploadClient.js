'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createBrowserSupabaseClient } from '@supabase/auth-helpers-nextjs';
import shared from '../../styles/shared.module.css';
import WorkspaceShell from '../components/WorkspaceShell';
import { ROLE_LABELS } from '../../lib/roles';

export default function UploadClient({ profile }) {
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [link, setLink] = useState('');
  const [documents, setDocuments] = useState([]);
  const [signingRequests, setSigningRequests] = useState([]);
  const [internalUsers, setInternalUsers] = useState([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState('');
  const [signerType, setSignerType] = useState('external');
  const [internalSignerId, setInternalSignerId] = useState('');
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [signingOrder, setSigningOrder] = useState(1);
  const [enforceSequential, setEnforceSequential] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [creatingRequest, setCreatingRequest] = useState(false);
  const [signingLink, setSigningLink] = useState('');
  const supabase = createBrowserSupabaseClient();

  const internalUserMap = useMemo(() => {
    const next = new Map();
    internalUsers.forEach((user) => {
      next.set(user.user_id, user);
    });
    return next;
  }, [internalUsers]);

  const requestsByDocument = useMemo(() => {
    const grouped = new Map();
    signingRequests.forEach((item) => {
      if (!grouped.has(item.document_id)) {
        grouped.set(item.document_id, []);
      }
      grouped.get(item.document_id).push(item);
    });
    grouped.forEach((items) => {
      items.sort((a, b) => a.signing_order - b.signing_order);
    });
    return grouped;
  }, [signingRequests]);

  const loadDocuments = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from('documents')
      .select('id,filename,bucket,path,sha256_hash,created_at')
      .order('created_at', { ascending: false });

    if (loadError) {
      setError(true);
      setMessage(`Unable to load documents: ${loadError.message}`);
      return;
    }

    setDocuments(data ?? []);
    if (!selectedDocumentId && (data ?? []).length > 0) {
      setSelectedDocumentId(data[0].id);
    }
  }, [selectedDocumentId, supabase]);

  const loadSigningRequests = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from('signing_requests')
      .select('id,document_id,signer_name,signer_email,status,signing_order,enforce_sequential,expires_at,signed_at,viewed_at,revoked_at,internal_signer_id')
      .order('created_at', { ascending: false });

    if (loadError) {
      setError(true);
      setMessage(`Unable to load signing requests: ${loadError.message}`);
      return;
    }

    setSigningRequests(data ?? []);
  }, [supabase]);

  const loadInternalUsers = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('user_id,full_name,email,role')
      .in('role', ['admin', 'administrator', 'lawyer', 'staff'])
      .order('full_name', { ascending: true });

    setInternalUsers(data ?? []);
  }, [supabase]);

  useEffect(() => {
    loadDocuments();
    loadSigningRequests();
    loadInternalUsers();
  }, [loadDocuments, loadSigningRequests, loadInternalUsers]);

  function handleFileChange(event) {
    const nextFile = event.target.files?.[0] || null;
    setFile(nextFile);
    setMessage('');
    setError(false);
    setLink('');
  }

  async function handleUpload(e) {
    e.preventDefault();
    setMessage('');
    setError(false);
    if (!file) {
      setError(true);
      setMessage('Please select a PDF or DOCX file.');
      return;
    }

    const fileBuffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', fileBuffer);
    const hashHex = Array.from(new Uint8Array(digest))
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('');

    const filePath = `documents/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from('evidence').upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

    if (uploadError) {
      setError(true);
      setMessage(`Upload failed: ${uploadError.message}`);
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setError(true);
      setMessage('Uploaded, but could not identify the user to save metadata.');
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('user_id', user.id)
      .maybeSingle();

    const orgId = profileError ? null : profileData?.org_id ?? null;

    const { error: recordError } = await supabase.from('documents').insert([
      {
        user_id: user.id,
        owner_id: user.id,
        uploaded_by: user.id,
        bucket: 'evidence',
        path: filePath,
        file_path: filePath,
        title: file.name,
        status: 'Drafting',
        sha256_hash: hashHex,
        created_at: new Date().toISOString(),
      },
    ]);

    if (recordError) {
      setError(true);
      setMessage(`Uploaded file, but failed to save document record: ${recordError.message}`);
      return;
    }

    const { data: urlData, error: urlError } = await supabase.storage.from('evidence').createSignedUrl(filePath, 60);
    if (urlError) {
      setError(true);
      setMessage(`Uploaded, but could not create download link: ${urlError.message}`);
      return;
    }

    setMessage(`Uploaded ${file.name} successfully.`);
    setLink(urlData.signedUrl);
    setFile(null);
    loadDocuments();
  }

  async function handleCreateSigningRequest(e) {
    e.preventDefault();
    setCreatingRequest(true);
    setMessage('');
    setError(false);
    setSigningLink('');

    if (!selectedDocumentId) {
      setCreatingRequest(false);
      setError(true);
      setMessage('Please select a document first.');
      return;
    }

    let payloadSignerName = signerName.trim();
    let payloadSignerEmail = signerEmail.trim().toLowerCase();

    if (signerType === 'internal') {
      const selectedUser = internalUserMap.get(internalSignerId);
      if (!selectedUser) {
        setCreatingRequest(false);
        setError(true);
        setMessage('Please select an internal signer.');
        return;
      }

      payloadSignerName = selectedUser.full_name || selectedUser.email || 'Internal user';
      payloadSignerEmail = (selectedUser.email || '').toLowerCase();
    }

    if (!payloadSignerName || !payloadSignerEmail) {
      setCreatingRequest(false);
      setError(true);
      setMessage('Signer name and email are required.');
      return;
    }

    const response = await fetch('/api/signing-requests', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        documentId: selectedDocumentId,
        signerType,
        internalSignerId: signerType === 'internal' ? internalSignerId : null,
        signerName: payloadSignerName,
        signerEmail: payloadSignerEmail,
        signingOrder,
        enforceSequential,
        expiresInDays,
      }),
    });

    const payload = await response.json();
    setCreatingRequest(false);

    if (!response.ok) {
      setError(true);
      setMessage(payload.error ?? 'Unable to create signing request.');
      return;
    }

    setMessage('Signing request created successfully.');
    setSigningLink(payload.signingLink || '');
    setSignerType('external');
    setInternalSignerId('');
    setSignerName('');
    setSignerEmail('');
    setSigningOrder(1);
    setEnforceSequential(false);
    setExpiresInDays(7);
    loadSigningRequests();
  }

  async function handleRequestAction(requestId, action) {
    setMessage('');
    setError(false);

    const response = await fetch(`/api/signing-requests/${requestId}/${action}`, {
      method: 'POST',
    });
    const payload = await response.json();

    if (!response.ok) {
      setError(true);
      setMessage(payload.error ?? `Unable to ${action} request.`);
      return;
    }

    setMessage(action === 'resend' ? 'Invitation marked as resent.' : 'Signing request revoked.');
    loadSigningRequests();
  }

  return (
    <WorkspaceShell
      profile={profile}
      title="Request Signatures"
      subtitle={`Upload legal files and register them for signature workflows. Role: ${ROLE_LABELS[profile.role] ?? profile.role}.`}
    >
      <div className={shared.sectionCard} style={{ marginTop: 0 }}>
        <form onSubmit={handleUpload} className={shared.formGrid}>
          <label className={shared.fieldLabel}>
            Select PDF or DOCX
            <input className={shared.input} type="file" onChange={handleFileChange} accept=".pdf,.docx" />
          </label>
          <button type="submit" className={shared.button}>Upload</button>
        </form>
        {file && <p className={shared.helpText}>Selected file: {file.name}</p>}
        {message && <p className={`${shared.message} ${error ? shared.messageError : shared.messageSuccess}`}>{message}</p>}
        {link && (
          <div className={shared.cardBlock} style={{ marginTop: '1rem' }}>
            <p className={shared.cardTitle}>Download link</p>
            <a href={link} target="_blank" rel="noreferrer" className={shared.button}>Open file</a>
            <p className={shared.cardText}>The link will expire in 60 seconds.</p>
          </div>
        )}
      </div>

      <div className={shared.sectionCard}>
        <h3 className={shared.cardTitle}>Signers</h3>
        <p className={shared.cardText}>Add one or more signers per document, with optional signing order.</p>

        <label className={shared.fieldLabel} style={{ marginTop: '1rem' }}>
          Select document
          <select className={shared.select} value={selectedDocumentId} onChange={(event) => setSelectedDocumentId(event.target.value)}>
            {documents.map((doc) => (
              <option key={doc.id} value={doc.id}>{doc.filename || doc.path}</option>
            ))}
          </select>
        </label>

        {documents.length === 0 && (
          <p className={shared.helpText} style={{ marginTop: '1rem' }}>Upload at least one document to add signers.</p>
        )}

        {documents.length > 0 && (
          <form onSubmit={handleCreateSigningRequest} className={shared.formGrid} style={{ marginTop: '1rem' }}>
            <label className={shared.fieldLabel}>
              Signer type
              <select className={shared.select} value={signerType} onChange={(event) => setSignerType(event.target.value)}>
                <option value="external">External signer</option>
                <option value="internal">Internal signer</option>
              </select>
            </label>

            {signerType === 'internal' ? (
              <label className={shared.fieldLabel}>
                Internal user
                <select className={shared.select} value={internalSignerId} onChange={(event) => setInternalSignerId(event.target.value)} required>
                  <option value="">Select user</option>
                  {internalUsers.map((person) => (
                    <option key={person.user_id} value={person.user_id}>
                      {(person.full_name || person.email || 'Unknown user')} ({person.role})
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <label className={shared.fieldLabel}>
                  Signer name
                  <input className={shared.input} value={signerName} onChange={(event) => setSignerName(event.target.value)} required={signerType === 'external'} />
                </label>
                <label className={shared.fieldLabel}>
                  Signer email
                  <input className={shared.input} type="email" value={signerEmail} onChange={(event) => setSignerEmail(event.target.value)} required={signerType === 'external'} />
                </label>
              </>
            )}

            <label className={shared.fieldLabel}>
              Signing order
              <input className={shared.input} type="number" min={1} value={signingOrder} onChange={(event) => setSigningOrder(Number(event.target.value) || 1)} />
            </label>

            <label className={shared.fieldLabel}>
              Expires in (days)
              <input className={shared.input} type="number" min={1} max={30} value={expiresInDays} onChange={(event) => setExpiresInDays(Number(event.target.value) || 7)} />
            </label>

            <label className={shared.fieldLabel}>
              <span>Sequential signing</span>
              <input type="checkbox" checked={enforceSequential} onChange={(event) => setEnforceSequential(event.target.checked)} />
            </label>

            <button className={shared.button} type="submit" disabled={creatingRequest}>
              {creatingRequest ? 'Creating...' : '+ Add Signer'}
            </button>
          </form>
        )}

        {signingLink && (
          <div className={shared.cardBlock} style={{ marginTop: '1rem' }}>
            <p className={shared.cardTitle}>Secure signing link</p>
            <a href={signingLink} target="_blank" rel="noreferrer" className={shared.button}>Open signer link</a>
            <p className={shared.cardText}>{signingLink}</p>
          </div>
        )}
      </div>

      <div className={shared.sectionCard}>
        <h3 className={shared.cardTitle}>Signing Requests</h3>
        <div className={shared.cardGrid}>
          {documents.map((doc) => {
            const requests = requestsByDocument.get(doc.id) ?? [];
            return (
              <div key={doc.id} className={shared.cardBlock}>
                <p className={shared.cardTitle}>{doc.filename || doc.path}</p>
                {doc.sha256_hash && <p className={shared.cardText}>SHA-256: {doc.sha256_hash}</p>}
                {requests.length === 0 && <p className={shared.helpText}>No signers yet.</p>}
                {requests.map((requestItem) => (
                  <div key={requestItem.id} style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #e5e7eb' }}>
                    <p className={shared.cardText}>
                      {requestItem.signer_name} ({requestItem.signer_email})
                    </p>
                    <p className={shared.cardText}>
                      {(() => {
                        const blockedByOrder = requestItem.enforce_sequential && requests.some(
                          (candidate) => candidate.signing_order < requestItem.signing_order && ['pending', 'viewed'].includes(candidate.status)
                        );
                        const label = blockedByOrder && ['pending', 'viewed'].includes(requestItem.status)
                          ? 'waiting'
                          : requestItem.status;
                        return `Order: ${requestItem.signing_order} | Status: ${label}`;
                      })()}
                    </p>
                    {['pending', 'viewed'].includes(requestItem.status) && (
                      <div className={shared.buttonGroup}>
                        <button type="button" className={shared.linkButton} onClick={() => handleRequestAction(requestItem.id, 'resend')}>Resend</button>
                        <button type="button" className={shared.linkButton} onClick={() => handleRequestAction(requestItem.id, 'revoke')}>Revoke</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </WorkspaceShell>
  );
}
