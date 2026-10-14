import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

// Email one-time-code verification for signers (see migration 024).
// A verified signer holds an httpOnly cookie scoped to their signing link; the
// signing API, the document preview and the signature itself all require it.

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const SESSION_TTL_SECONDS = 30 * 60;
const COOKIE_NAME = 'lawgda_signer';
const TABLE = 'signer_email_verifications';

const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');

function hashesEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export class SignerVerificationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Shows "p•••@addu.edu.ph" so the page never reveals the full address before verification. */
export function maskEmail(email) {
  const [name, domain] = String(email || '').split('@');
  if (!domain) return '';
  return `${name.slice(0, 1)}${'•'.repeat(Math.max(name.length - 1, 3))}@${domain}`;
}

/** Creates and stores a fresh code for the request. Returns the plaintext code for emailing. */
export async function issueSignerCode(supabaseAdmin, signingRequestId) {
  const { data: existing } = await supabaseAdmin
    .from(TABLE)
    .select('last_sent_at')
    .eq('signing_request_id', signingRequestId)
    .maybeSingle();
  const lastSent = existing?.last_sent_at ? new Date(existing.last_sent_at).getTime() : 0;
  const wait = lastSent + RESEND_COOLDOWN_MS - Date.now();
  if (wait > 0) {
    throw new SignerVerificationError(`Please wait ${Math.ceil(wait / 1000)} seconds before requesting another code.`, 429);
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const now = new Date();
  const { error } = await supabaseAdmin.from(TABLE).upsert({
    signing_request_id: signingRequestId,
    code_hash: sha256(`${signingRequestId}:${code}`),
    code_expires_at: new Date(now.getTime() + CODE_TTL_MS).toISOString(),
    attempts: 0,
    last_sent_at: now.toISOString(),
    updated_at: now.toISOString(),
  }, { onConflict: 'signing_request_id' });
  if (error) throw new SignerVerificationError(`Unable to create a verification code: ${error.message}`, 500);
  return code;
}

/** Checks a submitted code. On success, returns a new session token for the cookie. */
export async function verifySignerCode(supabaseAdmin, signingRequestId, code) {
  const { data: row } = await supabaseAdmin
    .from(TABLE)
    .select('code_hash,code_expires_at,attempts')
    .eq('signing_request_id', signingRequestId)
    .maybeSingle();

  if (!row?.code_hash) throw new SignerVerificationError('Request a code first.');
  if (row.attempts >= MAX_ATTEMPTS) throw new SignerVerificationError('Too many wrong codes. Request a new code.', 429);
  if (new Date(row.code_expires_at).getTime() < Date.now()) throw new SignerVerificationError('This code has expired. Request a new code.');

  const submitted = String(code || '').replace(/\D/g, '');
  if (!hashesEqual(sha256(`${signingRequestId}:${submitted}`), row.code_hash)) {
    await supabaseAdmin.from(TABLE).update({ attempts: row.attempts + 1, updated_at: new Date().toISOString() }).eq('signing_request_id', signingRequestId);
    const left = MAX_ATTEMPTS - row.attempts - 1;
    throw new SignerVerificationError(left > 0 ? `That code is incorrect. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong codes. Request a new code.');
  }

  return startSignerSession(supabaseAdmin, signingRequestId, { clearCode: true });
}

/** Records a verified session (after a correct code, or for a signed-in signer) and returns its token. */
export async function startSignerSession(supabaseAdmin, signingRequestId, { clearCode = false } = {}) {
  const sessionToken = randomBytes(32).toString('base64url');
  const now = new Date();
  const { error } = await supabaseAdmin.from(TABLE).upsert({
    signing_request_id: signingRequestId,
    ...(clearCode ? { code_hash: null, code_expires_at: null, attempts: 0 } : {}),
    verified_at: now.toISOString(),
    session_hash: sha256(sessionToken),
    session_expires_at: new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString(),
    updated_at: now.toISOString(),
  }, { onConflict: 'signing_request_id' });
  if (error) throw new SignerVerificationError(`Unable to start a verified session: ${error.message}`, 500);
  return sessionToken;
}

/** True when the request carries a valid, unexpired verified-signer cookie for this signing request. */
export async function hasVerifiedSignerSession(supabaseAdmin, request, signingRequestId) {
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  if (!cookie) return false;
  const { data: row } = await supabaseAdmin
    .from(TABLE)
    .select('session_hash,session_expires_at')
    .eq('signing_request_id', signingRequestId)
    .maybeSingle();
  if (!row?.session_hash || new Date(row.session_expires_at).getTime() < Date.now()) return false;
  return hashesEqual(sha256(cookie), row.session_hash);
}

/** Sets the verified-signer cookie, scoped to this signing link's API routes only. */
export function setSignerSessionCookie(response, signingToken, sessionToken) {
  response.cookies.set(COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: `/api/external-sign/${encodeURIComponent(signingToken)}`,
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}
