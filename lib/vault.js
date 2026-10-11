// Minimal HashiCorp Vault client for Lawgda's Key Management Server (KMS).
//
// Vault's Transit engine holds the AES-256 Key Encryption Key (KEK) named
// `lawgda-kek`. The KEK never leaves Vault: Lawgda sends private-key material
// to be wrapped (encrypted) and gets ciphertext back, and sends ciphertext to
// be unwrapped only at signing time. Every call is recorded in Vault's own
// audit log. Lawgda authenticates with AppRole; the resulting token lives only
// in server memory and is never sent to the browser.
//
// Required (server-only) env: VAULT_ADDR, VAULT_ROLE_ID, VAULT_SECRET_ID.
// Optional: VAULT_TRANSIT_MOUNT (default "transit"), VAULT_KEK_NAME (default "lawgda-kek").

const REQUEST_TIMEOUT_MS = 5000;

let cachedToken = null;
let cachedTokenExpiresAt = 0;

export function isVaultConfigured() {
  return Boolean(process.env.VAULT_ADDR && process.env.VAULT_ROLE_ID && process.env.VAULT_SECRET_ID);
}

function vaultUrl(path) {
  return `${String(process.env.VAULT_ADDR).replace(/\/+$/, '')}/v1/${path}`;
}

function transitPath(operation) {
  const mount = process.env.VAULT_TRANSIT_MOUNT || 'transit';
  const keyName = process.env.VAULT_KEK_NAME || 'lawgda-kek';
  return `${mount}/${operation}/${keyName}`;
}

export class VaultError extends Error {
  constructor(message, status = 503) {
    super(message);
    this.name = 'VaultError';
    this.status = status;
  }
}

async function send(path, { token, body }) {
  let response;
  try {
    response = await fetch(vaultUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Vault-Token': token } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (error) {
    throw new VaultError(`Key Management Server unreachable: ${error instanceof Error ? error.message : 'network error'}`);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = Array.isArray(payload.errors) ? payload.errors.join('; ') : `HTTP ${response.status}`;
    // 503 = sealed or standby; 403 = permission/token problem.
    throw new VaultError(`Key Management Server rejected the request: ${detail}`, response.status);
  }
  return payload;
}

async function login() {
  const payload = await send('auth/approle/login', {
    body: { role_id: process.env.VAULT_ROLE_ID, secret_id: process.env.VAULT_SECRET_ID },
  });
  const auth = payload.auth || {};
  if (!auth.client_token) {
    throw new VaultError('Key Management Server login returned no token.');
  }
  cachedToken = auth.client_token;
  // Renew a minute early so a token never expires mid-request.
  cachedTokenExpiresAt = Date.now() + Math.max(0, (Number(auth.lease_duration) || 0) - 60) * 1000;
  return cachedToken;
}

async function authorizedRequest(path, body) {
  if (!isVaultConfigured()) {
    throw new VaultError('Key Management Server is not configured (VAULT_ADDR / VAULT_ROLE_ID / VAULT_SECRET_ID).');
  }
  const token = cachedToken && Date.now() < cachedTokenExpiresAt ? cachedToken : await login();
  try {
    return await send(path, { token, body });
  } catch (error) {
    // A revoked/expired token: log in again once, then retry.
    if (error instanceof VaultError && error.status === 403) {
      cachedToken = null;
      return send(path, { token: await login(), body });
    }
    throw error;
  }
}

/** Wraps key material with the KEK inside Vault. Returns "vault:v<N>:<ciphertext>". */
export async function vaultEncrypt(plaintext) {
  const payload = await authorizedRequest(transitPath('encrypt'), {
    plaintext: Buffer.from(plaintext).toString('base64'),
  });
  const ciphertext = payload?.data?.ciphertext;
  if (typeof ciphertext !== 'string' || !ciphertext.startsWith('vault:')) {
    throw new VaultError('Key Management Server returned an unexpected encrypt response.');
  }
  return ciphertext;
}

/** Unwraps "vault:v<N>:…" ciphertext inside Vault and returns the key material. */
export async function vaultDecrypt(ciphertext) {
  const payload = await authorizedRequest(transitPath('decrypt'), { ciphertext });
  const plaintext = payload?.data?.plaintext;
  if (typeof plaintext !== 'string') {
    throw new VaultError('Key Management Server returned an unexpected decrypt response.');
  }
  return Buffer.from(plaintext, 'base64');
}
