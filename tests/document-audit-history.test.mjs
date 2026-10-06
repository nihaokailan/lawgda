import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const verifier = await readFile(new URL('../lib/auditChainVerify.js', import.meta.url));
const verifierUrl = `data:text/javascript;base64,${verifier.toString('base64')}`;
const source = (await readFile(new URL('../lib/documentAuditHistory.js', import.meta.url), 'utf8')).replace("'./auditChainVerify'", JSON.stringify(verifierUrl));
const { loadDocumentAuditHistory } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
function client(rows, fail = false) {
  const calls = [];
  return { calls, from(table) {
    return {
      select() { return this; },
      eq(field, id) { assert.equal(field, 'document_id'); assert.equal(id, 'document'); return this; },
      order() { return this; },
      async range(start, end) {
        calls.push([table, start]);
        return fail ? { error: new Error('unavailable') } : { data: (rows[table] || []).slice(start, end + 1) };
      },
    };
  } };
}
test('loads all pages and sorts document and signing events together', async () => {
  const rows = Array.from({ length: 501 }, (_, i) => ({ id: String(i), event_type: 'document_viewed', created_at: new Date(1700000000000 + i * 1000).toISOString() }));
  const db = client({ audit_logs: rows, signing_audit_events: [{ id: 'sign', created_at: '2020-01-01T00:00:00Z' }] });
  const history = await loadDocumentAuditHistory(db, 'document');
  assert.equal(history.events.length, 502);
  assert.equal(history.events[0].id, 'sign');
  assert.equal(history.valid, null);
  assert.ok(db.calls.some(([table, start]) => table === 'audit_logs' && start === 500));
});
test('empty history is not reported as verified', async () => {
  assert.equal((await loadDocumentAuditHistory(client({}), 'document')).valid, null);
});
test('read failure cannot return a verified partial history', async () => {
  await assert.rejects(loadDocumentAuditHistory(client({}, true), 'document'), /complete audit history/);
});
