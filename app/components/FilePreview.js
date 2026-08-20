'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import shared from '../../styles/shared.module.css';
import { createSupabaseBrowserClient } from '../../lib/supabase/client';

export default function FilePreview({ document, onClose }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadPreviewUrl() {
      const supabase = createSupabaseBrowserClient();
      const { data, error: signedUrlError } = await supabase.storage
        .from(document.bucket)
        .createSignedUrl(document.storage_path, 120);

      if (!active) {
        return;
      }

      if (signedUrlError) {
        setError(signedUrlError.message);
        return;
      }

      setUrl(data?.signedUrl || '');
    }

    loadPreviewUrl();

    return () => {
      active = false;
    };
  }, [document.bucket, document.storage_path]);

  return (
    <div className={shared.sectionCard}>
      <div className={shared.buttonGroup} style={{ marginTop: 0 }}>
        <h3 className={shared.cardTitle} style={{ margin: 0 }}>{document.name}</h3>
        <button type="button" className={shared.linkButton} onClick={onClose}>Close</button>
      </div>

      {error && <p className={`${shared.message} ${shared.messageError}`}>Unable to create preview: {error}</p>}
      {!error && !url && <p className={shared.helpText}>Preparing preview...</p>}

      {url && document.mime_type?.startsWith('image/') && (
        <Image
          src={url}
          alt={document.name}
          width={1280}
          height={900}
          unoptimized
          style={{ width: '100%', height: 'auto', borderRadius: '16px', border: '1px solid var(--border)' }}
        />
      )}

      {url && document.mime_type === 'application/pdf' && (
        <iframe title={document.name} src={url} style={{ width: '100%', height: '70vh', border: '1px solid var(--border)', borderRadius: '16px' }} />
      )}

      {url && !document.mime_type?.startsWith('image/') && document.mime_type !== 'application/pdf' && (
        <div className={shared.cardBlock}>
          <p className={shared.cardText}>Inline preview is not available for this file type.</p>
          <a className={shared.button} href={url} target="_blank" rel="noreferrer">Open file</a>
        </div>
      )}
    </div>
  );
}
