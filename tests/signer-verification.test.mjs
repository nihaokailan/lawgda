import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasVerifiedSignerSession,
  issueSignerCode,
  maskEmail,
  startSignerSession,
  verifySignerCode,
} from '../lib/signerVerification.js';

// Minimal in-memory stand-in for the Supabase table used by signerVerification.
function fakeAdmin() {
  const rows = new Map();
  const query = () => {
    let id;
    const api = {
      select: () => api,
      eq: (_column, value) => { id = value; return api; },
      maybeSingle: async () => ({ data: rows.get(id) ?? null }),
      update(values) { return { eq: async (_c, value) => { rows.set(value, { ...rows.get(value), ...values }); return { error: null }; } }; },
      upsert: async (values) => { rows.set(values.signing_request_id, { ...rows.get(values.signing_request_id), ...values }); return { error: null }; },
    };
    return api;
  };
  return { rows, from: () => query() };
}

const requestWithCookie = (value) => ({ cookies: { get: () => (value ? { value } : undefined) } });

test('masks the signer email', () => {
  assert.equal(maskEmail('pcbilanga@addu.edu.ph'), 'p••••••••@addu.edu.ph');
  assert.equal(maskEmail('ab@x.com'), 'a•••@x.com');
});

test('a correct code starts a session that only its own cookie unlocks', async () => {
  const admin = fakeAdmin();
  const code = await issueSignerCode(admin, 'req-1');
  assert.match(code, /^\d{6}$/);
  assert.ok(!JSON.stringify([...admin.rows.values()]).includes(code), 'plaintext code must not be stored');

  const session = await verifySignerCode(admin, 'req-1', code);
  assert.equal(await hasVerifiedSignerSession(admin, requestWithCookie(session), 'req-1'), true);
  assert.equal(await hasVerifiedSignerSession(admin, requestWithCookie('forged'), 'req-1'), false);
  assert.equal(await hasVerifiedSignerSession(admin, requestWithCookie(null), 'req-1'), false);
  await assert.rejects(verifySignerCode(admin, 'req-1', code), /Request a code first/);
});

test('wrong codes are counted and lock out after five tries', async () => {
  const admin = fakeAdmin();
  const code = await issueSignerCode(admin, 'req-2');
  const wrong = code === '000000' ? '111111' : '000000';
  await assert.rejects(verifySignerCode(admin, 'req-2', wrong), /4 tries left/);
  for (let i = 0; i < 4; i += 1) await verifySignerCode(admin, 'req-2', wrong).catch(() => {});
  await assert.rejects(verifySignerCode(admin, 'req-2', code), /Too many wrong codes/);
});

test('expired codes and expired sessions are rejected', async () => {
  const admin = fakeAdmin();
  const code = await issueSignerCode(admin, 'req-3');
  admin.rows.get('req-3').code_expires_at = new Date(Date.now() - 1000).toISOString();
  await assert.rejects(verifySignerCode(admin, 'req-3', code), /expired/);

  const session = await startSignerSession(admin, 'req-3');
  admin.rows.get('req-3').session_expires_at = new Date(Date.now() - 1000).toISOString();
  assert.equal(await hasVerifiedSignerSession(admin, requestWithCookie(session), 'req-3'), false);
});

test('a new code cannot be requested within a minute of the last one', async () => {
  const admin = fakeAdmin();
  await issueSignerCode(admin, 'req-4');
  await assert.rejects(issueSignerCode(admin, 'req-4'), /Please wait/);
});
