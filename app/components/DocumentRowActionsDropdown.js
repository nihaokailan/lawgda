import Link from 'next/link';
import styles from '../../styles/dashboard.module.css';

export default function DocumentRowActionsDropdown({ document }) {
  const certificateAvailable = document.status === 'Signed' || document.status === 'Filed';

  return (
    <details className={styles.menuRoot}>
      <summary className={styles.menuTrigger} aria-label="Open row actions">...</summary>
      <div className={styles.menuContent}>
        <Link href={`/documents/${document.id || ''}`} className={styles.menuItem}>View Details</Link>
        {certificateAvailable && (
          <Link href={`/documents/${document.id || ''}/certificate`} className={styles.menuItem}>
            Download Companion Certificate
          </Link>
        )}
        <Link href={`/repository?move=${document.id || ''}`} className={styles.menuItem}>Move to Folder</Link>
        <Link href={`/documents/${document.id || ''}/audit`} className={styles.menuItem}>View Audit Trail</Link>
      </div>
    </details>
  );
}
