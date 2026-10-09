import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from './uploadLimits';

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

export async function sha256OfFile(file) {
  return toHex(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
}

/** Returns an error message for an unacceptable file, or '' if it can be uploaded. */
export function validateUploadFile(file) {
  if (!file) return 'Please select a PDF file.';
  if (file.type !== 'application/pdf') return 'Only PDF files are allowed.';
  if (file.size > MAX_UPLOAD_BYTES) return `Files larger than ${MAX_UPLOAD_LABEL} are not allowed.`;
  return '';
}

async function readJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

/**
 * Hashes the PDF in the browser, sends it directly to Supabase Storage through
 * a signed upload URL, then asks the server to re-hash and register it.
 * Throws an Error with a user-facing message on any failure.
 */
export async function uploadDocument(supabase, { file, title, caseId = null, sha256Hash = null, caseNumber = '', tags = '' }) {
  const problem = validateUploadFile(file);
  if (problem) throw new Error(problem);

  const hash = sha256Hash || await sha256OfFile(file);

  const ticketResponse = await fetch('/api/documents/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ size: file.size, type: file.type }),
  });
  const ticket = await readJson(ticketResponse);
  if (!ticketResponse.ok) throw new Error(ticket.error || 'Unable to prepare upload.');

  const { error: storageError } = await supabase.storage
    .from(ticket.bucket)
    .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: 'application/pdf' });
  if (storageError) throw new Error(storageError.message || 'Upload failed.');

  const finalizeResponse = await fetch('/api/documents/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, caseId, caseNumber, tags, bucket: ticket.bucket, path: ticket.path, sha256Hash: hash }),
  });
  const payload = await readJson(finalizeResponse);
  if (!finalizeResponse.ok) throw new Error(payload.error || 'Unable to upload document.');

  return { document: payload.document || null, sha256Hash: hash };
}
