import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../lib/auditEventLabel.js', import.meta.url), 'utf8');
const { auditEventLabel } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('presents audit views without exposing raw event details', () => {
  assert.equal(auditEventLabel({ event_type: 'document_viewed', details: { context: 'audit_trail_view', internal_field: 'secret' } }), 'Audit trail viewed');
});
test('shows signer and status changes in plain language', () => {
  assert.equal(auditEventLabel({ event_type: 'signing_completed', details: { signer_name: 'Alex' } }), 'Document signed by Alex');
  assert.equal(auditEventLabel({ event_type: 'status_changed', details: { from: 'Pending', to: 'Filed' } }), 'Document status changed from Pending to Filed');
});
test('does not describe a failed invitation as sent', () => {
  assert.match(auditEventLabel({ event_type: 'invitation_sent', details: { email_status: 'failed' } }), /could not be sent/);
});
