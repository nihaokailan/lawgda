'use client';

import { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import shared from '../../styles/shared.module.css';
import shell from '../../styles/pageShell.module.css';

export default function UploadClient() {
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState('');
  const [link, setLink] = useState('');
  const supabase = createClientComponentClient();

  function handleFileChange(event) {
    const nextFile = event.target.files?.[0] || null;
    setFile(nextFile);
    setMessage('');
    setLink('');
  }

  async function handleUpload(e) {
    e.preventDefault();
    if (!file) {
      setMessage('Please select a PDF or DOCX file.');
      return;
    }

    const filePath = `documents/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from('evidence').upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

    if (uploadError) {
      setMessage(`Upload failed: ${uploadError.message}`);
      return;
    }

    const { data: urlData, error: urlError } = await supabase.storage.from('evidence').createSignedUrl(filePath, 60);
    if (urlError) {
      setMessage(`Uploaded, but could not create download link: ${urlError.message}`);
      return;
    }

    setMessage(`Uploaded ${file.name} successfully.`);
    setLink(urlData.signedUrl);
    setFile(null);
  }

  return (
    <main className={shell.shell}>
      <div className={shell.content}>
        <div className={shared.pageShell}>
          <div className={shared.heroPanel}>
            <h2 className={shared.pageTitle}>Sign and Secure Your Document</h2>
            <p className={`${shared.pageSubtitle} ${shared.heroSubtitle}`}>
              Upload a legal PDF or DOCX, generate a secure file link, and keep your evidence workflow aligned with the landing experience.
            </p>
          </div>

          <div className={shared.sectionCard} style={{ marginTop: '1.75rem' }}>
            <form onSubmit={handleUpload} className={shared.formGrid}>
              <label className={shared.fieldLabel}>
                Select PDF or DOCX
                <input className={shared.input} type="file" onChange={handleFileChange} accept=".pdf,.docx" />
              </label>
              <button type="submit" className={shared.button}>Upload</button>
            </form>
            {file && <p className={shared.helpText}>Selected file: {file.name}</p>}
            {message && <p className={`${shared.message} ${shared.messageSuccess}`}>{message}</p>}
            {link && (
              <div className={shared.cardBlock} style={{ marginTop: '1rem' }}>
                <p className={shared.cardTitle}>Download link</p>
                <a href={link} target="_blank" rel="noreferrer" className={shared.linkButton}>Open file</a>
                <p className={shared.cardText}>The link will expire in 60 seconds.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
