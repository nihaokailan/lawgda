import { INDEX_LIMITS } from './documentIndexing';

// Case folders group a firm's documents and back the QR label printed for the
// physical case folder. Lawyers and Staff of the case's firm manage them.

export const CASE_MANAGER_ROLES = ['lawyer', 'staff'];

/** Returns an error message, or '' if the case title and number are acceptable. */
export function validateCaseFields({ title = '', caseNumber = '' }) {
  const cleanTitle = String(title ?? '').trim();
  if (!cleanTitle) return 'A case title is required.';
  if (cleanTitle.length > INDEX_LIMITS.title) return `Case title must be at most ${INDEX_LIMITS.title} characters.`;
  if (String(caseNumber ?? '').trim().length > INDEX_LIMITS.caseNumber) {
    return `Case number must be at most ${INDEX_LIMITS.caseNumber} characters.`;
  }
  return '';
}

/** True when this profile may manage (rename, add to, remove from) the case. */
export function canManageCase(profile, caseRow) {
  return Boolean(caseRow?.org_id)
    && caseRow.org_id === profile?.org_id
    && CASE_MANAGER_ROLES.includes(profile?.role);
}

// Messages raised by the case functions in 026_case_folders.sql that are safe
// to show to the user, mapped to an HTTP status.
const KNOWN_ERRORS = [
  ['already in a case folder', 409],
  ['Filed documents are locked', 409],
  ['Document not found in this case', 404],
  ['Document not found', 404],
  ['Case not found', 404],
  ['A case title is required', 400],
];

export function caseErrorResponse(message) {
  const text = String(message || '');
  const known = KNOWN_ERRORS.find(([fragment]) => text.includes(fragment));
  return known ? { status: known[1], error: text } : { status: 400, error: 'Unable to save the changes.' };
}
