'use client';

import { INDEX_LIMITS } from '../../lib/documentIndexing';
import styles from './AuthorshipField.module.css';

/**
 * "Are you the author of this document?" for the upload forms. Yes by default;
 * No reveals a required field for the author's name, which is printed under
 * the Lawgda logo on the appended signature page.
 */
export default function AuthorshipField({
  isAuthor,
  authorName,
  onIsAuthorChange,
  onAuthorNameChange,
  labelClassName,
  inputClassName,
}: {
  isAuthor: boolean;
  authorName: string;
  onIsAuthorChange: (isAuthor: boolean) => void;
  onAuthorNameChange: (authorName: string) => void;
  labelClassName?: string;
  inputClassName?: string;
}) {
  return (
    <>
      <fieldset className={styles.fieldset}>
        <legend className={`${labelClassName ?? ''} ${styles.legend}`}>Are you the author of this document?</legend>
        <div className={styles.options}>
          <label className={styles.option}>
            <input type="radio" name="isAuthor" checked={isAuthor} onChange={() => onIsAuthorChange(true)} />
            Yes
          </label>
          <label className={styles.option}>
            <input type="radio" name="isAuthor" checked={!isAuthor} onChange={() => onIsAuthorChange(false)} />
            No
          </label>
        </div>
      </fieldset>

      {!isAuthor && (
        <label className={labelClassName}>
          Author&apos;s name
          <input
            className={inputClassName}
            value={authorName}
            onChange={(event) => onAuthorNameChange(event.target.value)}
            maxLength={INDEX_LIMITS.authorName}
            placeholder="for ex. Atty. Maria Santos"
            required
          />
        </label>
      )}
    </>
  );
}
