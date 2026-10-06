import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../lib/auditChainVerify.js', import.meta.url));
const { verifyAuditLogsChain, verifySigningAuditChain } = await import(`data:text/javascript;base64,${source.toString('base64')}`);
for (const signing of [false, true]) {
  const verify = signing ? verifySigningAuditChain : verifyAuditLogsChain;
  const row = { id: 'event', document_id: 'document', event_type: 'viewed', previous_hash: '0'.repeat(64), details: { context: 'audit_trail_view' }, details_text: '{"context": "audit_trail_view"}', created_at_text: '2026-09-22 05:51:40+00' };
  const fields = signing ? ['id', 'signing_request_id', 'document_id', 'event_type', 'actor_type', 'actor_user_id', 'actor_email'] : ['id', 'document_id', 'event_type', 'actor_user_id'];
  row.record_hash = createHash('sha256').update(row.previous_hash + fields.map(k => row[k] || '').join('') + row.details_text + row.created_at_text).digest('hex');
  test(`${signing ? 'signing' : 'document'} audit uses exact SQL text and detects tampering`, () => {
    assert.equal(verify([row]).valid, true);
    assert.equal(verify([{ ...row, event_type: 'changed' }]).valid, false);
    assert.equal(verify([{ ...row, previous_hash: 'bad' }]).valid, false);
    assert.equal(verify([{ ...row, document_id: '' }]).valid, false);
  });
  test(`${signing ? 'signing' : 'document'} audit distinguishes missing historical hashes`, () => {
    assert.equal(verify([{ id: 'old' }, row]).valid, null);
    assert.equal(verify([{ id: 'old' }, { ...row, event_type: 'changed' }]).valid, false);
    assert.equal(verify([row, { id: 'new-unhashed' }]).valid, false);
    assert.equal(verify([{ ...row, details_text: undefined }]).valid, null);
  });
}
