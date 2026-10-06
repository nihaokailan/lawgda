import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = (await readFile(new URL('../lib/auditPresentation.js', import.meta.url), 'utf8'))
  .replace("import { ROLE_LABELS } from './roles';", "const ROLE_LABELS = { lawyer: 'Lawyer', staff: 'Staff' };");
const { enrichAuditEntries } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const db = {
  from: () => ({ select: () => ({ in: async () => ({ data: [{ user_id: 'u1', full_name: 'Kiona Luna', email: 'k@firm.ph', role: 'lawyer' }] }) }) }),
};

test('shows who drafted, viewed and signed, and never leaks signing links', async () => {
  const entries = await enrichAuditEntries(db, [
    { id: '1', event_type: 'document_uploaded', created_at: '2026-10-06T00:00:00Z', actor_user_id: 'u1', details: { title: 'Deed of Sale' } },
    { id: '2', event_type: 'document_viewed', created_at: '2026-10-06T00:01:00Z', actor_user_id: 'u1', details: {} },
    { id: '3', event_type: 'invitation_sent', created_at: '2026-10-06T00:02:00Z', actor_user_id: 'u1', actor_type: 'internal_user', details: { signer_email: 'x@y.co', email_status: 'sent', signing_link: 'https://app/sign/SECRET' } },
    { id: '4', event_type: 'signing_completed', created_at: '2026-10-06T00:03:00Z', actor_user_id: null, actor_type: 'external_signer', actor_email: 'x@y.co', details: { signer_name: 'Ext Signer', signer_email: 'x@y.co', signing_method: 'dict' } },
    { id: '5', event_type: 'status_changed', created_at: '2026-10-06T00:04:00Z', actor_user_id: null, details: { from: 'Pending', to: 'Filed' } },
  ]);

  assert.deepEqual([entries[0].title, entries[0].actorName, entries[0].actorRole], ['Draft created', 'Kiona Luna', 'Lawyer']);
  assert.equal(entries[1].title, 'Document viewed');
  assert.equal(entries[3].actorRole, 'External signer');
  assert.equal(entries[3].title, 'Document signed by Ext Signer');
  assert.ok(entries[3].lines.includes('Method: Signing certificate'));
  assert.equal(entries[4].actorName, 'System');
  assert.ok(!JSON.stringify(entries).includes('SECRET'));
});
