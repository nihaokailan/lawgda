import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../lib/verificationDocuments.js', import.meta.url), 'utf8');
const { listVerificationDocuments } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const userId = '11111111-1111-4111-8111-111111111111';
function mockAdmin({ permissionError = null, ownedError = null, sharedError = null } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table };
      calls.push(call);
      const query = {
        select() { return query; },
        eq(key, value) { call.eq = [key, value]; return query; },
        or(filter) { call.filter = filter; return query; },
        order() { return query; },
        in(key, values) { call.in = [key, values]; return query; },
        then(resolve, reject) {
          const response = table === 'document_permissions'
            ? { data: [{ document_id: 'shared' }, { document_id: 'owned' }], error: permissionError }
            : call.in
              ? { data: [{ id: 'shared', created_at: '2026-10-02' }, { id: 'owned', created_at: '2026-10-01' }], error: sharedError }
              : { data: [{ id: 'owned', created_at: '2026-10-01' }], error: ownedError };
          return Promise.resolve(response).then(resolve, reject);
        },
      };
      return query;
    },
  };
}
test('scopes owned and shared document queries to the authenticated user', async () => {
  const admin = mockAdmin();
  const documents = await listVerificationDocuments(admin, userId);
  assert.deepEqual(admin.calls[0].eq, ['user_id', userId]);
  assert.equal(admin.calls[1].filter, `owner_id.eq.${userId},and(owner_id.is.null,user_id.eq.${userId}),uploaded_by.eq.${userId}`);
  assert.deepEqual(admin.calls[2].in, ['id', ['shared', 'owned']]);
  assert.deepEqual(documents.map(document => document.id), ['shared', 'owned']);
});
for (const field of ['permissionError', 'ownedError', 'sharedError']) {
  test(`fails closed on ${field}`, async () => {
    await assert.rejects(listVerificationDocuments(mockAdmin({ [field]: { message: 'failure' } }), userId), /Unable/);
  });
}
test('rejects absent or malformed identity before accessing documents', async () => {
  const admin = mockAdmin();
  for (const value of [undefined, '', 'id,owner_id.not.is.null']) {
    await assert.rejects(listVerificationDocuments(admin, value), /authenticated user/);
  }
  assert.equal(admin.calls.length, 0);
});
