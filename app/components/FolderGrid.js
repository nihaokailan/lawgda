'use client';

import shared from '../../styles/shared.module.css';

export default function FolderGrid({ folders, onOpen }) {
  if (!folders.length) {
    return <p className={shared.helpText}>No folders yet in this location.</p>;
  }

  return (
    <div className={shared.cardGrid}>
      {folders.map((folder) => (
        <button
          type="button"
          key={folder.id}
          className={shared.cardBlock}
          onClick={() => onOpen(folder.id)}
          style={{ textAlign: 'left' }}
        >
          <h3 className={shared.cardTitle}>{folder.name}</h3>
          <p className={shared.cardText}>{folder.document_count ?? 0} files</p>
        </button>
      ))}
    </div>
  );
}
