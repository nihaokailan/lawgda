'use client';

import { useState, useEffect } from 'react';
import shared from '../../../styles/shared.module.css';
import styles from '../../../styles/dashboard.module.css';
import DocumentVerifier from '../../components/DocumentVerifier';
import DocumentLifecycleTimeline from '../../components/DocumentLifecycleTimeline';
import StatusDialog from '../../components/StatusDialog';

type DocumentViewProps = {
  document: {
    id: string;
    title: string;
    status: string;
    rawStatus: string;
    sha256_hash: string | null;
    metadata: Record<string, unknown> | null;
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
  const metadata = document.metadata && typeof document.metadata === 'object' ? document.metadata : {};
  const signedHash = typeof metadata.post_sign_hash === 'string' ? metadata.post_sign_hash : '';
  const hasSignedVersion = Boolean(signedHash && metadata.signed_file_path);
  const expectedHash = signedHash || document.sha256_hash || '';
  const hashLabel = hasSignedVersion ? 'Finished signed document SHA-256' : 'Original SHA-256';
  const downloadVersion = hasSignedVersion ? '?version=signed' : '';

  useEffect(() => {
    let mounted = true;

    async function loadPreview() {
      try {
        const response = await fetch(`/api/documents/${document.id}/download${downloadVersion ? `${downloadVersion}&check=1` : '?check=1'}`);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || 'Unable to load PDF preview.');
        }
        if (mounted) {
          setPreviewUrl(`/api/documents/${document.id}/download${downloadVersion ? `${downloadVersion}&inline=1` : '?inline=1'}`);
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
  }, [document.id, downloadVersion]);

  function formatDate(dateString: string | null) {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString();
  }

  async function handleDownload() {
    setDownloading(true);
    setDownloadError('');

    try {
      const response = await fetch(`/api/documents/${document.id}/download${downloadVersion}`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Download failed');
      }

      const { downloadUrl, fileName } = await response.json();

      const fileResponse = await fetch(downloadUrl, { cache: 'no-store' });
      if (!fileResponse.ok) throw new Error('Unable to download the document. Please try again.');
      const localUrl = URL.createObjectURL(await fileResponse.blob());

      // Download the bytes now instead of retaining a temporary storage link.
      const link = window.document.createElement('a');
      link.href = localUrl;
      link.download = fileName;
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(localUrl), 60000);

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

      {/* Document Lifecycle History */}
      <DocumentLifecycleTimeline documentId={document.id} currentStatus={document.rawStatus} />

      {/* SHA-256 Hash Display */}
      {expectedHash && (
        <div className={shared.sectionCard}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>Document Hash</h3>
          <div style={{ padding: '1rem', background: '#f5f5f5', borderRadius: '8px', fontFamily: 'monospace', fontSize: '0.85rem', wordBreak: 'break-all', marginBottom: '1rem' }}>
            {expectedHash}
          </div>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>
            This SHA-256 hash uniquely identifies the {hasSignedVersion ? 'finished signed' : 'original'} version of the document. Any modification will produce a different hash.
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
          Save a copy. You can later check it hasn’t changed with Verify below.
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

        <StatusDialog message={downloadError} error onClose={() => setDownloadError('')} />
      </div>

      {/* Verification Component */}
      {expectedHash && (
        <DocumentVerifier
          documentId={document.id}
          version={hasSignedVersion ? 'signed' : 'original'}
          documentTitle={document.title}
          storedHash={expectedHash}
          hashLabel={hashLabel}
        />
      )}
    </>
  );
}
