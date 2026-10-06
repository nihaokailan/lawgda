import { randomBytes } from 'node:crypto';

// Cryptographically random temporary password for admin-provisioned accounts.
export function generateTemporaryPassword() {
  return `Lw!${randomBytes(15).toString('base64url')}`;
}
