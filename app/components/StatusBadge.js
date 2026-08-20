import styles from '../../styles/dashboard.module.css';

const STATUS_CLASS = {
  Drafting: styles.badgeDrafting,
  Pending: styles.badgePending,
  Signed: styles.badgeSigned,
  Filed: styles.badgeFiled,
};

export default function StatusBadge({ status }) {
  const normalized = STATUS_CLASS[status] ? status : 'Drafting';
  return (
    <span className={`${styles.statusBadge} ${STATUS_CLASS[normalized]}`}>
      {normalized}
    </span>
  );
}
