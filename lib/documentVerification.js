export function getVerificationTarget(document, version) {
  const metadata = document?.metadata || {};
  return {
    hash: version === 'signed' ? String(metadata.post_sign_hash || '') : String(document?.sha256_hash || ''),
    query: version === 'signed' ? '?version=signed' : '',
  };
}

export async function readStoredDocument(documentId, query, signal) {
  const separator = query ? '&' : '?';
  const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/download${query}${separator}purpose=verification`, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('Unable to access this document. Check your access and try again.');
  const payload = await response.json();
  if (!payload.downloadUrl) throw new Error('The stored file is unavailable.');
  const fileResponse = await fetch(payload.downloadUrl, { signal, cache: 'no-store' });
  if (!fileResponse.ok) throw new Error('Unable to read the stored file. Please try again.');
  return fileResponse.arrayBuffer();
}

export async function compareDocumentBytes(bytes, expectedHash) {
  if (!/^[a-f0-9]{64}$/i.test(expectedHash)) throw new Error('This document version does not have a valid recorded hash.');
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const computedHash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
  return { computedHash, matches: computedHash === expectedHash.toLowerCase() };
}

/**
 * Records an in-app check in the audit trail. The server re-decides
 * match/mismatch from the hash, so the logged result cannot be forged.
 */
export async function recordIntegrityCheck(documentId, computedHash, version, channel) {
  const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/integrity-check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ computedHash, version, channel }),
  });
  if (!response.ok) throw new Error('Unable to record this check in the audit trail.');
  return response.json();
}
