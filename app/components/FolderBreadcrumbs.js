'use client';

import shared from '../../styles/shared.module.css';

export default function FolderBreadcrumbs({ crumbs, onSelect }) {
  if (!crumbs.length) {
    return null;
  }

  return (
    <div className={shared.buttonGroup} style={{ marginTop: 0, marginBottom: '0.75rem' }}>
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1;
        return (
          <button
            key={`${crumb.id ?? 'root'}-${index}`}
            type="button"
            className={isLast ? shared.button : shared.linkButton}
            onClick={() => onSelect(crumb.id)}
            disabled={isLast}
          >
            {crumb.name}
          </button>
        );
      })}
    </div>
  );
}
