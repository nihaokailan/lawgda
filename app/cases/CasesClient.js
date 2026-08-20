'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import WorkspaceShell from '../components/WorkspaceShell';
import shared from '../../styles/shared.module.css';
import { createSupabaseBrowserClient } from '../../lib/supabase/client';
import { ROLE_LABELS } from '../../lib/roles';
import FolderBreadcrumbs from '../components/FolderBreadcrumbs';
import FolderGrid from '../components/FolderGrid';
import DocumentList from '../components/DocumentList';
import FilePreview from '../components/FilePreview';

export default function CasesClient({ profile }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [breadcrumbs, setBreadcrumbs] = useState([{ id: null, name: 'Root' }]);
  const [folders, setFolders] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [newFolderName, setNewFolderName] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewDocument, setPreviewDocument] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);

  const folderQuery = useMemo(() => {
    if (!currentFolderId) {
      return '';
    }
    return `?parentId=${encodeURIComponent(currentFolderId)}`;
  }, [currentFolderId]);

  const loadRepository = useCallback(async () => {
    setLoading(true);
    setError(false);

    const [foldersResponse, documentsResponse] = await Promise.all([
      fetch(`/api/folders${folderQuery}`),
      fetch(`/api/documents${folderQuery}`),
    ]);

    const foldersPayload = await foldersResponse.json();
    const documentsPayload = await documentsResponse.json();

    if (!foldersResponse.ok) {
      setError(true);
      setMessage(foldersPayload.error || 'Unable to load folders.');
      setLoading(false);
      return;
    }

    if (!documentsResponse.ok) {
      setError(true);
      setMessage(documentsPayload.error || 'Unable to load documents.');
      setLoading(false);
      return;
    }

    setFolders(foldersPayload.folders || []);
    setDocuments(documentsPayload.documents || []);
    setBreadcrumbs(foldersPayload.breadcrumbs || [{ id: null, name: 'Root' }]);
    setLoading(false);
  }, [folderQuery]);

  useEffect(() => {
    loadRepository();
  }, [loadRepository]);

  async function handleCreateFolder(event) {
    event.preventDefault();
    setError(false);
    setMessage('');

    const trimmedName = newFolderName.trim();
    if (!trimmedName) {
      setError(true);
      setMessage('Folder name is required.');
      return;
    }

    const response = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: trimmedName,
        parentId: currentFolderId,
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      setError(true);
      setMessage(payload.error || 'Unable to create folder.');
      return;
    }

    setNewFolderName('');
    setMessage('Folder created successfully.');
    loadRepository();
  }

  async function handleUpload(event) {
    event.preventDefault();
    setError(false);
    setMessage('');

    if (!selectedFile) {
      setError(true);
      setMessage('Select a file to upload.');
      return;
    }

    if (!profile.org_id) {
      setError(true);
      setMessage('Your account is not assigned to an organization yet.');
      return;
    }

    const storagePath = `${profile.org_id}/${Date.now()}-${selectedFile.name}`;
    const { error: uploadError } = await supabase.storage
      .from('org-documents')
      .upload(storagePath, selectedFile, { upsert: false, cacheControl: '3600' });

    if (uploadError) {
      setError(true);
      setMessage(`Upload failed: ${uploadError.message}`);
      return;
    }

    const response = await fetch('/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folderId: currentFolderId,
        name: selectedFile.name,
        bucket: 'org-documents',
        storagePath,
        mimeType: selectedFile.type || 'application/octet-stream',
        sizeBytes: selectedFile.size,
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      setError(true);
      setMessage(payload.error || 'File uploaded, but metadata save failed.');
      return;
    }

    setSelectedFile(null);
    setMessage('File uploaded successfully.');
    loadRepository();
  }

  return (
    <WorkspaceShell
      profile={profile}
      title="Folder Repository"
      subtitle={`Role: ${ROLE_LABELS[profile.role] ?? profile.role}. Access is scoped to your organization.`}
    >
      <div className={shared.sectionCard} style={{ marginTop: 0 }}>
        <FolderBreadcrumbs
          crumbs={breadcrumbs}
          onSelect={(folderId) => {
            setCurrentFolderId(folderId);
          }}
        />

        <form onSubmit={handleCreateFolder} className={shared.formGrid}>
          <label className={shared.fieldLabel}>
            Create folder
            <input
              className={shared.input}
              value={newFolderName}
              onChange={(event) => setNewFolderName(event.target.value)}
              placeholder="e.g. Litigation / 2026 / Pleadings"
            />
          </label>
          <button className={shared.button} type="submit">Create Folder</button>
        </form>

        <form onSubmit={handleUpload} className={shared.formGrid}>
          <label className={shared.fieldLabel}>
            Upload file
            <input
              className={shared.input}
              type="file"
              onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
            />
          </label>
          <button className={shared.button} type="submit">Upload to Current Folder</button>
        </form>

        {message && (
          <p className={`${shared.message} ${error ? shared.messageError : shared.messageSuccess}`}>
            {message}
          </p>
        )}
      </div>

      <div className={shared.sectionCard}>
        <h2 className={shared.cardTitle}>Folders</h2>
        {loading ? <p className={shared.helpText}>Loading...</p> : <FolderGrid folders={folders} onOpen={setCurrentFolderId} />}
      </div>

      <div className={shared.sectionCard}>
        <h2 className={shared.cardTitle}>Files</h2>
        {loading ? <p className={shared.helpText}>Loading...</p> : <DocumentList documents={documents} onPreview={setPreviewDocument} />}
      </div>

      {previewDocument && <FilePreview document={previewDocument} onClose={() => setPreviewDocument(null)} />}
    </WorkspaceShell>
  );
}
