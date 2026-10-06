import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = (await readFile(new URL('../lib/orgMembership.js', import.meta.url), 'utf8'))
  .replace("import { ROLES } from './rbac';", "const ROLES = { NORMAL: 'normal', LAWYER: 'lawyer', STAFF: 'staff' };");
const { findAssignableAccount } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

function db(profile, confirmedAt = '2026-01-01') {
  return {
    from: () => ({ select: () => ({ ilike: () => ({ limit: () => ({ maybeSingle: async () => ({ data: profile }) }) }) }) }),
    auth: { admin: { getUserById: async () => ({ data: { user: { email_confirmed_at: confirmedAt } } }) } },
  };
}

const normal = { user_id: 'u', email: 'a@b.co', role: 'normal', org_id: null, is_active: true };

test('a registered, confirmed, firm-less account is eligible', async () => {
  assert.equal((await findAssignableAccount(db(normal), 'org-a', 'A@B.co')).status, 'eligible');
});

test('unknown emails are unavailable (no account is ever created)', async () => {
  assert.equal((await findAssignableAccount(db(null), 'org-a', 'a@b.co')).status, 'unavailable');
});

test('unconfirmed, inactive, other-firm and privileged accounts are all just unavailable', async () => {
  assert.equal((await findAssignableAccount(db(normal, null), 'org-a', 'a@b.co')).status, 'unavailable');
  assert.equal((await findAssignableAccount(db({ ...normal, is_active: false }), 'org-a', 'a@b.co')).status, 'unavailable');
  assert.equal((await findAssignableAccount(db({ ...normal, role: 'lawyer', org_id: 'org-b' }), 'org-a', 'a@b.co')).status, 'unavailable');
  assert.equal((await findAssignableAccount(db({ ...normal, role: 'default_admin' }), 'org-a', 'a@b.co')).status, 'unavailable');
});

test('members of the caller\'s own firm are reported as such', async () => {
  assert.equal((await findAssignableAccount(db({ ...normal, role: 'staff', org_id: 'org-a' }), 'org-a', 'a@b.co')).status, 'already_member');
});

test('malformed emails are rejected', async () => {
  assert.equal((await findAssignableAccount(db(normal), 'org-a', 'nope')).status, 'invalid_email');
});
