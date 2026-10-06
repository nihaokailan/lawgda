import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function load(path, replacements = []) {
  let source = await readFile(new URL(path, import.meta.url), 'utf8');
  for (const [from, to] of replacements) source = source.replace(from, to);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

const rbac = await load('../lib/rbac.js');
const { ROLES, PERMISSIONS, hasPermission, ADMIN_CREATABLE_ROLES, DEFAULT_ADMIN_CREATABLE_ROLES } = rbac;

const FIRM_LEVEL = [
  PERMISSIONS.VIEW_DOCUMENT_CONTENT,
  PERMISSIONS.VIEW_AUDIT_LOGS,
  PERMISSIONS.MANAGE_USERS,
  PERMISSIONS.CREATE_USERS,
  PERMISSIONS.OVERSEE_REPOSITORY,
  PERMISSIONS.MANAGE_SYSTEM_SETTINGS,
  PERMISSIONS.UPLOAD_DOCUMENT,
  PERMISSIONS.APPLY_DICT_DIGITAL_SIGNATURE,
  PERMISSIONS.SET_STATUS_FILED,
  PERMISSIONS.DATA_ENTRY,
  PERMISSIONS.DOCUMENT_INDEXING,
  PERMISSIONS.SIGN_DOCUMENT,
];

test('DEFAULT_ADMIN only manages organizations and their admins', () => {
  assert.equal(hasPermission(ROLES.DEFAULT_ADMIN, PERMISSIONS.MANAGE_ORGANIZATIONS), true);
  assert.equal(hasPermission(ROLES.DEFAULT_ADMIN, PERMISSIONS.MANAGE_ORG_ADMINS), true);
  assert.equal(hasPermission(ROLES.DEFAULT_ADMIN, PERMISSIONS.VIEW_ORGANIZATION_SUMMARY), true);
  for (const permission of FIRM_LEVEL) {
    assert.equal(hasPermission(ROLES.DEFAULT_ADMIN, permission), false, permission);
  }
});

test('ADMIN administers its firm but never sees document content or signs', () => {
  for (const permission of [PERMISSIONS.MANAGE_USERS, PERMISSIONS.CREATE_USERS, PERMISSIONS.OVERSEE_REPOSITORY, PERMISSIONS.VIEW_AUDIT_LOGS, PERMISSIONS.MANAGE_SYSTEM_SETTINGS]) {
    assert.equal(hasPermission(ROLES.ADMIN, permission), true, permission);
  }
  for (const permission of [PERMISSIONS.VIEW_DOCUMENT_CONTENT, PERMISSIONS.UPLOAD_DOCUMENT, PERMISSIONS.APPLY_DICT_DIGITAL_SIGNATURE, PERMISSIONS.MANAGE_ORG_ADMINS, PERMISSIONS.MANAGE_ORGANIZATIONS]) {
    assert.equal(hasPermission(ROLES.ADMIN, permission), false, permission);
  }
});

test('LAWYER and STAFF hold no administration or content-view permission', () => {
  for (const role of [ROLES.LAWYER, ROLES.STAFF]) {
    for (const permission of [PERMISSIONS.MANAGE_USERS, PERMISSIONS.MANAGE_ORG_ADMINS, PERMISSIONS.VIEW_AUDIT_LOGS, PERMISSIONS.VIEW_DOCUMENT_CONTENT]) {
      assert.equal(hasPermission(role, permission), false, `${role} ${permission}`);
    }
  }
});

test('unknown roles get nothing', () => {
  assert.equal(hasPermission('superuser', PERMISSIONS.MANAGE_USERS), false);
  assert.equal(hasPermission(undefined, PERMISSIONS.MANAGE_USERS), false);
});

test('provisioning boundaries: DEFAULT_ADMIN creates only ADMIN, ADMIN creates only LAWYER/STAFF', () => {
  assert.deepEqual(DEFAULT_ADMIN_CREATABLE_ROLES, [ROLES.ADMIN]);
  assert.deepEqual(ADMIN_CREATABLE_ROLES, [ROLES.LAWYER, ROLES.STAFF]);
});

const { loadAccessibleDocument } = await load('../lib/documentAccess.js', [
  ["import { getSupabaseAdmin } from './supabaseAdmin';", 'const getSupabaseAdmin = () => globalThis.accessDb;'],
  ["import { RbacError, ROLES } from './rbac';", "const ROLES = { DEFAULT_ADMIN: 'default_admin' }; class RbacError extends Error { constructor(m, status) { super(m); this.status = status; } }"],
]);

function fakeDb({ document, permissions = [] }) {
  return {
    from(table) {
      const rows = table === 'documents' ? (document ? [document] : []) : permissions;
      const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: rows[0] ?? null, error: null }) };
      return chain;
    },
  };
}

const user = { id: 'u1' };
const lawyer = { role: 'lawyer', org_id: 'org-a' };

test('document access: owner in same org is allowed', async () => {
  globalThis.accessDb = fakeDb({ document: { id: 'd', org_id: 'org-a', owner_id: 'u1' } });
  assert.equal((await loadAccessibleDocument({ user, profile: lawyer, documentId: 'd' })).id, 'd');
});

test('document access: another organization sees "not found"', async () => {
  globalThis.accessDb = fakeDb({ document: { id: 'd', org_id: 'org-b', owner_id: 'u1' } });
  await assert.rejects(loadAccessibleDocument({ user, profile: lawyer, documentId: 'd' }), { status: 404 });
});

test('document access: same org without ownership or grant is forbidden', async () => {
  globalThis.accessDb = fakeDb({ document: { id: 'd', org_id: 'org-a', owner_id: 'someone-else' } });
  await assert.rejects(loadAccessibleDocument({ user, profile: lawyer, documentId: 'd' }), { status: 403 });
});

test('document access: explicit permission grant is honoured', async () => {
  globalThis.accessDb = fakeDb({ document: { id: 'd', org_id: 'org-a', owner_id: 'someone-else' }, permissions: [{ id: 'p' }] });
  assert.equal((await loadAccessibleDocument({ user, profile: lawyer, documentId: 'd' })).id, 'd');
});

test('document access: Default Admin and Org Admin never pass', async () => {
  globalThis.accessDb = fakeDb({ document: { id: 'd', org_id: 'org-a', owner_id: 'someone-else' } });
  await assert.rejects(loadAccessibleDocument({ user, profile: { role: 'default_admin', org_id: null }, documentId: 'd' }), { status: 403 });
  await assert.rejects(loadAccessibleDocument({ user, profile: { role: 'admin', org_id: 'org-a' }, documentId: 'd' }), { status: 403 });
});

const { findStaffEmails } = await load('../lib/staffSigners.js', [
  ["import { ROLES } from './rbac';", "const ROLES = { STAFF: 'staff' };"],
]);

test('staff signer check returns only the emails that belong to Staff accounts', async () => {
  const db = { from: () => ({ select: () => ({ eq: () => ({ in: async (_c, wanted) => ({ data: wanted.filter((e) => e === 's@firm.ph').map((email) => ({ email })) }) }) }) }) };
  assert.deepEqual(await findStaffEmails(db, ['L@firm.ph', 'S@Firm.ph', ' ']), ['s@firm.ph']);
  assert.deepEqual(await findStaffEmails(db, []), []);
});
