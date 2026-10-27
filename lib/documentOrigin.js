// Remembers which list (Dashboard, Documents or a case folder) a document was opened from,
// so "Go Back" on any document page returns there rather than to the
// previous document sub-page.

const ORIGIN_KEY = 'lawgda.documentOrigin';

export const DOCUMENT_ORIGINS = {
  '/dashboard': 'Back to Dashboard',
  '/cases': 'Back to Documents',
};

const FOLDER_PATH = /^\/cases\/[0-9a-f-]{36}$/i;

/** Button text for returning to `path`, or null if it is not a known origin. */
export function documentOriginLabel(path) {
  if (DOCUMENT_ORIGINS[path]) return DOCUMENT_ORIGINS[path];
  return FOLDER_PATH.test(String(path || '')) ? 'Back to folder' : null;
}

export function rememberDocumentOrigin(path) {
  try {
    window.sessionStorage.setItem(ORIGIN_KEY, path);
  } catch {
    // Storage unavailable: Go Back falls back to the dashboard.
  }
}

export function readDocumentOrigin() {
  try {
    const path = window.sessionStorage.getItem(ORIGIN_KEY);
    return path && documentOriginLabel(path) ? path : null;
  } catch {
    return null;
  }
}
