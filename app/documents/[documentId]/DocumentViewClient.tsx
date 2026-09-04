'use client';

import { useState, useEffect } from 'react';
import shared from '../../../styles/shared.module.css';
import styles from '../../../styles/dashboard.module.css';
import DocumentVerifier from '../../components/DocumentVerifier';

type DocumentViewProps = {
  document: {
    id: string;
    title: string;
    status: string;
    sha256_hash: string | null;
    created_at: string | null;
    user_id: string;
  };
};

export default function DocumentViewClient({ document }: DocumentViewProps) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [downloadedAt, setDownloadedAt] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewError, setPreviewError] = useState('');

  useEffect(() => {
    let mounted = true;

    async function loadPreview() {
      try {
        const response = await fetch(`/api/documents/${document.id}/download`);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || 'Unable to load PDF preview.');
        }
        if (mounted) {
          setPreviewUrl(payload.downloadUrl || '');
        }
      } catch (error) {
        if (mounted) {
          setPreviewError(error instanceof Error ? error.message : 'Unable to load PDF preview.');
        }
      }
    }

    loadPreview();
    return () => {
      mounted = false;
    };
  }, [document.id]);

  function formatDate(dateString: string | null) {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString();
  }

  async function handleDownload() {
    setDownloading(true);
    setDownloadError('');

    try {
      const response = await fetch(`/api/documents/${document.id}/download`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Download failed');
      }

      const { downloadUrl, fileName } = await response.json();

      // Create a temporary link and trigger download
      const link = window.document.createElement('a');
      link.href = downloadUrl;
      link.download = fileName;
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);

      setDownloadedAt(new Date().toLocaleString());
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      {/* Document Info Card */}
      <div className={shared.sectionCard} style={{ marginTop: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          <div>
            <p style={{ margin: '0 0 0.5rem 0', color: 'var(--muted)', fontSize: '0.9rem', fontWeight: 600 }}>Title</p>
            <h2 style={{ margin: 0, fontSize: '1.5rem' }}>{document.title}</h2>
          </div>
          <div>
            <p style={{ margin: '0 0 0.5rem 0', color: 'var(--muted)', fontSize: '0.9rem', fontWeight: 600 }}>Status</p>
            <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--crimson)' }}>{document.status}</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginTop: '2rem' }}>
          <div>
            <p style={{ margin: '0 0 0.5rem 0', color: 'var(--muted)', fontSize: '0.9rem', fontWeight: 600 }}>Uploaded</p>
            <p style={{ margin: 0 }}>{formatDate(document.created_at)}</p>
          </div>
          <div>
            <p style={{ margin: '0 0 0.5rem 0', color: 'var(--muted)', fontSize: '0.9rem', fontWeight: 600 }}>Document ID</p>
            <p style={{ margin: 0, fontFamily: 'monospace', fontSize: '0.9rem' }}>{document.id}</p>
          </div>
        </div>
      </div>

      {/* SHA-256 Hash Display */}
      {document.sha256_hash && (
        <div className={shared.sectionCard}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>Document Hash</h3>
          <div style={{ padding: '1rem', background: '#f5f5f5', borderRadius: '8px', fontFamily: 'monospace', fontSize: '0.85rem', wordBreak: 'break-all', marginBottom: '1rem' }}>
            {document.sha256_hash}
          </div>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>
            This SHA-256 hash uniquely identifies this version of the document. Any modification will produce a different hash.
          </p>
        </div>
      )}

      <div className={shared.sectionCard}>
        <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>PDF Preview</h3>
        {previewUrl && (
          <iframe
            title={`PDF preview for ${document.title}`}
            src={previewUrl}
            style={{ width: '100%', minHeight: '720px', border: '1px solid var(--border)', borderRadius: '8px', background: '#fff' }}
          />
        )}
        {!previewUrl && !previewError && <p style={{ color: 'var(--muted)' }}>Loading PDF preview...</p>}
        {previewError && <p style={{ color: '#991b1b' }}>{previewError}</p>}
      </div>

      {/* Download Section */}
      <div className={shared.sectionCard}>
        <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>Download Document</h3>
        <p style={{ color: 'var(--muted)', marginBottom: '1.5rem' }}>
          Download the document for offline access. You can verify it has not been modified by uploading it below.
        </p>

        <button
          onClick={handleDownload}
          disabled={downloading}
          className={shared.button}
          style={{ marginBottom: downloading || downloadError ? '1rem' : 0 }}
        >
          {downloading ? 'Downloading...' : '⬇ Download PDF'}
        </button>

        {downloadedAt && (
          <p style={{ margin: 0, color: '#047857', fontSize: '0.9rem', fontWeight: 600 }}>
            ✓ Downloaded at {downloadedAt}
          </p>
        )}

        {downloadError && (
          <p style={{ margin: 0, color: '#991b1b', fontSize: '0.9rem' }}>
            ✗ Error: {downloadError}
          </p>
        )}
      </div>

      {/* Verification Component */}
      {document.sha256_hash && (
        <DocumentVerifier 
          documentTitle={document.title}
          storedHash={document.sha256_hash}
        />
      )}
    </>
  );
}
