'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '../../lib/supabase/client';
import { uploadDocument, validateUploadFile } from '../../lib/uploadDocumentClient';
import shared from '../../styles/shared.module.css';

export default function UploadDocument() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [caseNumber, setCaseNumber] = useState('');
  const [tags, setTags] = useState('');
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

    const fileProblem = validateUploadFile(file);
    if (fileProblem) {
      setError(true);
      setMessage(fileProblem);
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

    let payload;
    try {
      const result = await uploadDocument(supabase, { file, title: title.trim(), caseNumber, tags });
      setHash(result.sha256Hash);
      payload = result;
    } catch (failure) {
      setBusy(false);
      setError(true);
      setMessage(`Upload failed: ${failure instanceof Error ? failure.message : 'Unable to upload document.'}`);
      return;
    }

    setBusy(false);

    setTitle('');
    setCaseNumber('');
    setTags('');
    setFile(null);
    setMessage('Document uploaded and hashed successfully.');

    if (typeof payload.document?.id === 'string') {
      router.push(`/documents/${payload.document.id}/prepare`);
    }
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
          Case number (optional)
          <input
            className={shared.input}
            value={caseNumber}
            onChange={(event) => setCaseNumber(event.target.value)}
            maxLength={80}
            placeholder="for ex. Civil Case No. R-DVO-26-01234"
          />
        </label>

        <label className={shared.fieldLabel}>
          Tags (optional, comma-separated)
          <input
            className={shared.input}
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="for ex. deed of sale, land title"
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
