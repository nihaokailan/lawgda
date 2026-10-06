import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../lib/signingTurn.js', import.meta.url), 'utf8');
const { loadMySigningTurns } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const future = new Date(Date.now() + 86400000).toISOString();
const row = (id, document_id, signer_email, signing_order, status = 'pending', expires_at = future) => ({ id, document_id, signer_email, signing_order, status, expires_at });

function db(rows) {
  return { from: () => ({ select: () => ({ in: () => ({ in: async () => ({ data: rows }) }) }) }) };
}

test('it is the lawyer\'s turn only when nobody earlier is still open', async () => {
  const turns = await loadMySigningTurns(db([
    row('a', 'doc1', 'ext@x.co', 1),
    row('b', 'doc1', 'Lawyer@Firm.ph', 2),
    row('c', 'doc2', 'lawyer@firm.ph', 1),
  ]), 'lawyer@firm.ph', ['doc1', 'doc2']);
  assert.deepEqual(turns.get('doc1'), { state: 'waiting', requestId: 'b' });
  assert.deepEqual(turns.get('doc2'), { state: 'sign', requestId: 'c' });
});

test('signed requests are no longer open, so the next signer becomes actionable', async () => {
  const turns = await loadMySigningTurns(db([row('b', 'doc1', 'lawyer@firm.ph', 2)]), 'lawyer@firm.ph', ['doc1']);
  assert.equal(turns.get('doc1').state, 'sign');
});

test('expired requests and other people\'s documents are ignored', async () => {
  const past = new Date(Date.now() - 1000).toISOString();
  const turns = await loadMySigningTurns(db([row('b', 'doc1', 'lawyer@firm.ph', 1, 'pending', past), row('c', 'doc3', 'someone@else.co', 1)]), 'lawyer@firm.ph', ['doc1', 'doc3']);
  assert.equal(turns.size, 0);
});
