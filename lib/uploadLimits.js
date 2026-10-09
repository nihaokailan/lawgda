// Shared by the browser upload helper and the upload API routes so the
// documented 10 MB limit is enforced identically on both sides.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = '10 MB';

// Files land here first and are only moved to their final path after the
// server has re-hashed them. Kept outside every `<userId>/` prefix so the
// dashboard storage backfill never registers an unverified upload.
export const INCOMING_PREFIX = 'incoming';

export const UPLOAD_BUCKETS = ['secure_docs', 'evidence', 'org-documents'];
