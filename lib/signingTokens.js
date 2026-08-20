import { createHash, randomBytes } from 'node:crypto';

export function generateSigningToken() {
  const raw = randomBytes(32).toString('base64url');
  return `sr_${raw}`;
}

export function hashSigningToken(rawToken) {
  return createHash('sha256').update(rawToken).digest('hex');
}
