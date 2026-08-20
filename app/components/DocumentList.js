'use client';

import shared from '../../styles/shared.module.css';

export default function DocumentList({ documents, onPreview }) {
  if (!documents.length) {
    return <p className={shared.helpText}>No files in this folder.</p>;
  }

  return (
    <div className={shared.cardGrid}>
      {documents.map((doc) => (
        <div key={doc.id} className={shared.cardBlock}>
          <h3 className={shared.cardTitle}>{doc.name}</h3>
          <p className={shared.cardText}>{doc.mime_type || 'Unknown type'}</p>
          <p className={shared.cardText}>Size: {Math.ceil((doc.size_bytes ?? 0) / 1024)} KB</p>
          <button type="button" className={shared.linkButton} onClick={() => onPreview(doc)}>
            Preview
          </button>
        </div>
      ))}
    </div>
  );
}
