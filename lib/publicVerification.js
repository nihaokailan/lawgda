/**
 * Classifies a file's SHA-256 against every hash Lawgda recorded for a
 * document:
 *  - 'authentic'      matches the final signed PDF
 *  - 'earlier_version' matches the original upload or an intermediate signed
 *                      copy — genuine, but not the final document
 *  - 'breach'          matches nothing recorded: the file was altered
 */
export function classifyFileHash(document, computedHash) {
  const metadata = document?.metadata && typeof document.metadata === 'object' && !Array.isArray(document.metadata)
    ? document.metadata
    : {};
  const hash = String(computedHash || '').toLowerCase();
  const finalHash = String(metadata.post_sign_hash || '').toLowerCase();

  if (finalHash && hash === finalHash) {
    return { outcome: 'authentic', matchedVersion: 'final_signed', expectedHash: finalHash };
  }

  const chain = Array.isArray(metadata.hash_chain) ? metadata.hash_chain : [];
  const earlier = new Map();
  if (document?.sha256_hash) earlier.set(String(document.sha256_hash).toLowerCase(), 'original_upload');
  chain.forEach((entry, index) => {
    if (entry?.pre_sign_hash && !earlier.has(String(entry.pre_sign_hash).toLowerCase())) {
      earlier.set(String(entry.pre_sign_hash).toLowerCase(), index === 0 ? 'original_upload' : `before_signature_${index + 1}`);
    }
    if (entry?.post_sign_hash && !earlier.has(String(entry.post_sign_hash).toLowerCase())) {
      earlier.set(String(entry.post_sign_hash).toLowerCase(), `after_signature_${index + 1}`);
    }
  });

  if (earlier.has(hash)) {
    return { outcome: 'earlier_version', matchedVersion: earlier.get(hash), expectedHash: finalHash || null };
  }

  return { outcome: 'breach', matchedVersion: null, expectedHash: finalHash || null };
}
