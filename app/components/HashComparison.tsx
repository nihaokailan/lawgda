import styles from '../../styles/hashResult.module.css';

type Verdict = 'match' | 'mismatch' | 'earlier';

const VERDICT = {
  match: { word: 'Match', className: styles.match, boxClass: styles.hashBoxMatch, icon: <path d="m5.5 12.5 4.2 4.2L18.5 7.5" /> },
  mismatch: { word: 'Mismatch', className: styles.mismatch, boxClass: styles.hashBoxMismatch, icon: <path d="M6 6l12 12M18 6 6 18" /> },
  earlier: { word: 'Earlier version', className: styles.earlier, boxClass: styles.hashBoxEarlier, icon: <><path d="M12 5v9" /><path d="M12 19h.01" /></> },
};

/** Characters of `value` that differ from `other` at the same position are wrapped in <mark>. */
function HashText({ value, other, highlight }: { value: string; other: string | null; highlight: boolean }) {
  if (!highlight || !other) return <code className={styles.hashValue}>{value}</code>;
  return (
    <code className={styles.hashValue}>
      {[...value].map((character, index) => (character === other[index]
        ? character
        // eslint-disable-next-line react/no-array-index-key
        : <mark key={index} className={styles.diff}>{character}</mark>))}
    </code>
  );
}

function countDifferences(first: string, second: string) {
  let count = Math.abs(first.length - second.length);
  for (let index = 0; index < Math.min(first.length, second.length); index += 1) {
    if (first[index] !== second[index]) count += 1;
  }
  return count;
}

/**
 * The outcome of a SHA-256 integrity check: a Match / Mismatch /
 * Earlier version verdict and both hashes side by side, with every differing
 * character highlighted so a mismatch is visible at a glance.
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
  const highlight = verdict !== 'match' && Boolean(recordedHash);
  const differences = highlight && recordedHash ? countDifferences(checkedHash, recordedHash) : 0;

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
          <HashText value={checkedHash} other={recordedHash} highlight={highlight} />
        </div>
        {recordedHash && (
          <div className={`${styles.hashBox} ${style.boxClass}`}>
            <span className={styles.hashLabel}>{recordedLabel}</span>
            <HashText value={recordedHash} other={checkedHash} highlight={highlight} />
          </div>
        )}
      </div>

      {differences > 0 && (
        <p className={styles.diffNote}>
          {differences} of {Math.max(checkedHash.length, recordedHash?.length ?? 0)} characters differ (highlighted). Changing even one character of a file changes its whole hash.
        </p>
      )}
    </div>
  );
}
