'use client';

import { useState } from 'react';
import shared from '../../styles/shared.module.css';
import shell from '../../styles/pageShell.module.css';

export default function VerifyPage() {
  const [file, setFile] = useState(null);
  const [hash, setHash] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);

  function handleBack() {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    window.location.href = '/cases';
  }

  async function handleFileChange(event) {
    const nextFile = event.target.files?.[0] ?? null;
    setFile(nextFile);
    setHash('');
    setMessage('');
    setError(false);
  }

  async function handleVerify(e) {
    e.preventDefault();
    if (!file) {
      setError(true);
      setMessage('Please select a file to verify.');
      return;
    }

    const arrayBuffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(digest));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    setHash(hashHex);
    setMessage('SHA-256 hash computed.');
    setError(false);
  }

  return (
    <main className={shell.shell}>
      <div className={shell.content}>
        <div className={shared.pageShell}>
          <header className={shared.topNav}>
            <div className={shared.topNavBrand}>
              <span className={shared.topNavBrandName}>LAWGDA</span>
              <span className={shared.topNavTagline}>Secure Electronic Evidence</span>
            </div>
            <button type="button" className={shared.topNavLink} onClick={handleBack} aria-label="Go back to the previous page">
              &larr; Go Back
            </button>
          </header>
          <h1 className={shared.pageTitle}>Verify Document</h1>
          <p className={shared.pageSubtitle}>Upload a file and compute its SHA-256 hash to compare with your trusted evidence record.</p>
          <div className={shared.sectionCard}>
            <form onSubmit={handleVerify} className={shared.formGrid}>
              <label className={shared.fieldLabel}>
                Select file
                <input className={shared.input} type="file" accept=".pdf,.docx" onChange={handleFileChange} />
              </label>
              <button type="submit" className={shared.button}>Compute hash</button>
            </form>
            {message && (
              <p className={`${shared.message} ${error ? shared.messageError : shared.messageSuccess}`}>{message}</p>
            )}
            {hash && (
              <div className={shared.cardBlock} style={{ marginTop: '1rem' }}>
                <h3 className={shared.cardTitle}>SHA-256 hash</h3>
                <pre className={shared.hashBlock}>{hash}</pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
