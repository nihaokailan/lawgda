// Remembers which list (Dashboard or Documents) a document was opened from,
// so "Go Back" on any document page returns there rather than to the
// previous document sub-page.

const ORIGIN_KEY = 'lawgda.documentOrigin';

export const DOCUMENT_ORIGINS = {
  '/dashboard': 'Back to Dashboard',
  '/cases': 'Back to Documents',
};

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
    return path && DOCUMENT_ORIGINS[path] ? path : null;
  } catch {
    return null;
  }
}
