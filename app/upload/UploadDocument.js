'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '../../lib/supabase/client';
import shared from '../../styles/shared.module.css';

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

export default function UploadDocument() {
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [hash, setHash] = useState('');

  const supabase = createSupabaseBrowserClient();

  function onFileChange(event) {
    const selectedFile = event.target.files?.[0] || null;
    setFile(selectedFile);
    setMessage('');
    setError(false);
    setHash('');
  }

  async function onSubmit(event) {
    event.preventDefault();

    setMessage('');
    setError(false);

    if (!title.trim()) {
      setError(true);
      setMessage('Please enter a document title.');
      return;
    }

    if (!file) {
      setError(true);
      setMessage('Please select a PDF file.');
      return;
    }

    if (file.type !== 'application/pdf') {
      setError(true);
      setMessage('Only PDF files are allowed.');
      return;
    }

    setBusy(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setBusy(false);
      setError(true);
      setMessage('You must be signed in to upload documents.');
      return;
    }

    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    const sha256 = toHex(digest);
    setHash(sha256);

    const safeName = file.name.replace(/\s+/g, '-').toLowerCase();
    const filePath = `${user.id}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from('secure_docs')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: 'application/pdf',
      });

    if (uploadError) {
      setBusy(false);
      setError(true);
      setMessage(`Upload failed: ${uploadError.message}`);
      return;
    }

    const { error: insertError } = await supabase.from('documents').insert({
      user_id: user.id,
      title: title.trim(),
      file_path: filePath,
      sha256_hash: sha256,
      status: 'Drafting',
    });

    setBusy(false);

    if (insertError) {
      setError(true);
      setMessage(`File uploaded but failed to save record: ${insertError.message}`);
      return;
    }

    setTitle('');
    setFile(null);
    setMessage('Document uploaded and hashed successfully.');
  }

  return (
    <div className={shared.sectionCard} style={{ marginTop: 0 }}>
      <h2 className={shared.cardTitle}>Upload Deed of Sale</h2>
      <p className={shared.cardText}>Upload a PDF, compute SHA-256 locally, then save it to secure storage.</p>

      <form onSubmit={onSubmit} className={shared.formGrid} style={{ marginTop: '1rem' }}>
        <label className={shared.fieldLabel}>
          Document title
          <input
            className={shared.input}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="for ex. Deed of Sale - Santos Property"
            required
          />
        </label>

        <label className={shared.fieldLabel}>
          PDF file
          <input className={shared.input} type="file" accept="application/pdf,.pdf" onChange={onFileChange} required />
        </label>

        <button type="submit" className={shared.button} disabled={busy}>
          {busy ? 'Uploading...' : 'Upload PDF'}
        </button>
      </form>

      {hash && (
        <div className={shared.cardBlock} style={{ marginTop: '1rem' }}>
          <p className={shared.cardTitle}>SHA-256</p>
          <pre className={shared.hashBlock}>{hash}</pre>
        </div>
      )}

      {message && (
        <p className={`${shared.message} ${error ? shared.messageError : shared.messageSuccess}`}>{message}</p>
      )}
    </div>
  );
}
