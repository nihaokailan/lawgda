import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = (await readFile(new URL('../lib/documentLifecycle.js', import.meta.url), 'utf8'))
  .replace("import { getSupabaseAdmin } from './supabaseAdmin';", 'const getSupabaseAdmin = () => globalThis.lifecycleDb;')
  .replace("import { logDocumentAuditEvent } from './auditLog';", 'const logDocumentAuditEvent = async (event) => globalThis.lifecycleEvents.push(event);');
const { transitionDocumentStatus } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

for (const [from, target, expected] of [
  ['Drafting', 'Pending', true],
  ['Pending', 'Filed', true],
  ['Signed', 'Filed', true],
  ['Drafting', 'Filed', true],
  ['Filed', 'Filed', false],
  ['Filed', 'Pending', false],
  ['Filed', 'Signed', false],
]) {
  test(`${from} to ${target}: ${expected ? 'transitions and audits' : 'no duplicate or backward transition'}`, async () => {
    const updates = [];
    globalThis.lifecycleEvents = [];
    globalThis.lifecycleDb = {
      from() {
        let updating = false;
        return {
          select() { return this; },
          eq() { return this; },
          update(value) { updating = true; updates.push(value); return this; },
          async maybeSingle() { return { data: updating ? { id: 'document' } : { status: from }, error: null }; },
        };
      },
    };
    const result = await transitionDocumentStatus({ documentId: 'document', toStatus: target, reason: 'final_signature_completed' });
    assert.equal(result.transitioned, expected);
    assert.equal(updates.length, Number(expected));
    assert.equal(globalThis.lifecycleEvents.length, Number(expected));
    if (expected) {
      assert.deepEqual(updates[0], { status: target });
      assert.equal(globalThis.lifecycleEvents[0].details.to, target);
    }
  });
}
