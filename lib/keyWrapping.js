import { constants, createCipheriv, createDecipheriv, generateKeyPairSync, privateEncrypt, publicDecrypt, randomBytes, sign as cryptoSign, verify as cryptoVerify, createPrivateKey, createPublicKey } from 'node:crypto';

const WRAP_ALGORITHM = 'aes-256-gcm';
const WRAP_VERSION = 'v1';
const IV_LENGTH = 12; // 96-bit IV, standard for GCM

function getKek() {
  const raw = process.env.KEY_WRAPPING_MASTER_KEY;
  if (!raw) {
    throw new Error('KEY_WRAPPING_MASTER_KEY is not configured. Generate one with `openssl rand -base64 32`.');
  }

  const kek = raw.length === 64 && /^[0-9a-fA-F]+$/.test(raw)
    ? Buffer.from(raw, 'hex')
    : Buffer.from(raw, 'base64');

  if (kek.length !== 32) {
    throw new Error('KEY_WRAPPING_MASTER_KEY must decode to exactly 32 bytes (AES-256).');
  }

  return kek;
}

/**
 * Wraps (encrypts) private key material with AES-256-GCM using the server-only
 * master Key Encryption Key (KEK). The result is opaque ciphertext safe to
 * store in the database — the plaintext key never touches persistent storage.
 */
export function wrapPrivateKey(keyMaterial) {
  const kek = getKek();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(WRAP_ALGORITHM, kek, iv);
  const ciphertext = Buffer.concat([cipher.update(keyMaterial), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [WRAP_VERSION, iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(':');
}

/**
 * Unwraps (decrypts) private key material previously produced by wrapPrivateKey.
 * Throws if the KEK is wrong or the ciphertext/tag has been tampered with.
 */
export function unwrapPrivateKey(wrapped) {
  const kek = getKek();
  const parts = String(wrapped || '').split(':');
  if (parts.length !== 4 || parts[0] !== WRAP_VERSION) {
    throw new Error('Unrecognized wrapped key format.');
  }

  const [, ivB64, authTagB64, ciphertextB64] = parts;
  const decipher = createDecipheriv(WRAP_ALGORITHM, kek, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));

  return Buffer.concat([decipher.update(Buffer.from(ciphertextB64, 'base64')), decipher.final()]);
}

/**
 * Generates a fresh Ed25519 signing key pair for a user. The private key is
 * returned as raw PKCS8 DER bytes so the caller can immediately wrap it —
 * it must never be persisted unwrapped.
 */
export function generateSigningKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });

  return { publicKeyPem: publicKey, privateKeyDer: privateKey };
}

/**
 * Unwraps a user's private key just long enough to produce a signature over
 * `data`, then lets the plaintext key fall out of scope.
 */
export function signWithWrappedKey(wrappedPrivateKey, data) {
  const privateKeyDer = unwrapPrivateKey(wrappedPrivateKey);
  const privateKey = createPrivateKey({ key: privateKeyDer, format: 'der', type: 'pkcs8' });
  return cryptoSign(null, data, privateKey).toString('base64');
}

export function verifyWithPublicKeyPem(publicKeyPem, data, signatureBase64) {
  try {
    const publicKey = createPublicKey(publicKeyPem);
    return cryptoVerify(null, data, publicKey, Buffer.from(signatureBase64, 'base64'));
  } catch {
    return false;
  }
}

export const RSA_SIGNATURE_SCHEME = 'rsa-pkcs1v15-sha256';
// Signatures produced before the scheme fix hashed the digest a second time
// (RSA over SHA-256(SHA-256(document))). Kept only so they still verify.
export const LEGACY_RSA_SIGNATURE_SCHEME = 'rsa-pkcs1v15-sha256-of-digest';

// ASN.1 DigestInfo header for SHA-256 (RFC 8017 §9.2). Prepending it to a
// digest and applying PKCS#1 v1.5 type-1 padding yields exactly the signature
// `openssl dgst -sha256 -sign` would produce over the original document.
const SHA256_DIGEST_INFO_PREFIX = Buffer.from('3031300d060960864801650304020105000420', 'hex');

function sha256DigestInfo(digest) {
  const digestBytes = Buffer.from(digest);
  if (digestBytes.length !== 32) {
    throw new Error('A 32-byte SHA-256 digest is required.');
  }
  return Buffer.concat([SHA256_DIGEST_INFO_PREFIX, digestBytes]);
}

/**
 * Signs a pre-computed SHA-256 digest with an unwrapped RSA private key
 * (e.g. extracted from a DICT-issued .p12 certificate) using standard
 * RSASSA-PKCS1-v1_5. The digest is signed as-is, never re-hashed, so the
 * result verifies against the original document with ordinary tools.
 * The unwrapped key is only referenced for the duration of this call.
 */
export function signRsaDigestWithWrappedKey(wrappedPrivateKey, digest) {
  const privateKeyDer = unwrapPrivateKey(wrappedPrivateKey);
  try {
    return signRsaDigestWithPrivateKey(privateKeyDer, digest);
  } finally {
    privateKeyDer.fill(0);
  }
}

export function signRsaDigestWithPrivateKey(privateKeyDer, digest) {
  const privateKey = createPrivateKey({ key: privateKeyDer, format: 'der', type: 'pkcs8' });
  return privateEncrypt({ key: privateKey, padding: constants.RSA_PKCS1_PADDING }, sha256DigestInfo(digest)).toString('base64');
}

export function verifyRsaDigestWithCertificate(certificatePem, digest, signatureBase64, scheme = RSA_SIGNATURE_SCHEME) {
  try {
    const publicKey = createPublicKey(certificatePem);
    const signature = Buffer.from(signatureBase64, 'base64');
    if (scheme === LEGACY_RSA_SIGNATURE_SCHEME) {
      return cryptoVerify('sha256', digest, publicKey, signature);
    }
    const recovered = publicDecrypt({ key: publicKey, padding: constants.RSA_PKCS1_PADDING }, signature);
    return recovered.equals(sha256DigestInfo(digest));
  } catch {
    return false;
  }
}
