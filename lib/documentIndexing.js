// Indexing metadata that Staff/Lawyers enter by hand (§1.5.2(4)): title,
// court case number and tags. Shared by the upload form, the upload API and
// the "Edit details" API so the same rules apply everywhere.

export const INDEX_LIMITS = {
  title: 200,
  caseNumber: 80,
  tags: 20,
  tagLength: 40,
  note: 300,
};

/** Accepts "a, b, c" or ['a', 'b'] and returns trimmed, de-duplicated tags. */
export function parseTags(value) {
  const list = Array.isArray(value) ? value : String(value ?? '').split(',');
  return [...new Set(list.map((tag) => String(tag).trim()).filter(Boolean))];
}

/** Returns an error message, or '' if the case number and tags are acceptable. */
export function validateIndexFields({ caseNumber = '', tags = [] }) {
  if (String(caseNumber).length > INDEX_LIMITS.caseNumber) {
    return `Case number must be at most ${INDEX_LIMITS.caseNumber} characters.`;
  }
  if (tags.length > INDEX_LIMITS.tags || tags.some((tag) => tag.length > INDEX_LIMITS.tagLength)) {
    return `Use at most ${INDEX_LIMITS.tags} tags of up to ${INDEX_LIMITS.tagLength} characters each.`;
  }
  return '';
}

/** True when a document's title, case number or any tag contains the query. */
export function matchesIndexQuery({ title = '', caseNumber = '', tags = [] }, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  return [title, caseNumber || '', ...tags].some((value) => String(value).toLowerCase().includes(q));
}
