import styles from '../../styles/hashResult.module.css';

type Verdict = 'match' | 'mismatch' | 'earlier';

const VERDICT = {
  match: { word: 'Match', className: styles.match, boxClass: styles.hashBoxMatch, icon: <path d="m5.5 12.5 4.2 4.2L18.5 7.5" /> },
  mismatch: { word: 'Mismatch', className: styles.mismatch, boxClass: styles.hashBoxMismatch, icon: <path d="M6 6l12 12M18 6 6 18" /> },
  earlier: { word: 'Earlier version', className: styles.earlier, boxClass: styles.hashBoxEarlier, icon: <><path d="M12 5v9" /><path d="M12 19h.01" /></> },
};

/**
 * The outcome of a SHA-256 integrity check: a Match / Mismatch /
 * Earlier version verdict and both hashes side by side in boxes coloured by
 * the verdict.
 */
export default function HashComparison({
  verdict,
  message,
  checkedHash,
  recordedHash,
  checkedLabel = 'Checked file SHA-256',
  recordedLabel = 'Recorded SHA-256',
}: {
  verdict: Verdict;
  message: string;
  checkedHash: string;
  recordedHash: string | null;
  checkedLabel?: string;
  recordedLabel?: string;
}) {
  const style = VERDICT[verdict];

  return (
    <div className={styles.result} role="status" aria-live="polite">
      <div className={`${styles.verdict} ${style.className}`}>
        <span className={styles.verdictIcon} aria-hidden="true"><svg viewBox="0 0 24 24">{style.icon}</svg></span>
        <p style={{ margin: 0 }}>
          <strong className={styles.verdictWord}>{style.word}</strong>
          <span className={styles.verdictText}> — {message}</span>
        </p>
      </div>

      <div className={styles.hashes}>
        <div className={`${styles.hashBox} ${style.boxClass}`}>
          <span className={styles.hashLabel}>{checkedLabel}</span>
          <code className={styles.hashValue}>{checkedHash}</code>
        </div>
        {recordedHash && (
          <div className={`${styles.hashBox} ${style.boxClass}`}>
            <span className={styles.hashLabel}>{recordedLabel}</span>
            <code className={styles.hashValue}>{recordedHash}</code>
          </div>
        )}
      </div>

    </div>
  );
}
