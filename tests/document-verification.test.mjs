import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const source = await readFile(new URL('../lib/documentVerification.js', import.meta.url), 'utf8');
const { getVerificationTarget, readStoredDocument, compareDocumentBytes } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const bytes = new TextEncoder().encode('original document');
const hash = createHash('sha256').update(bytes).digest('hex');

test('verifies actual bytes and detects changes', async () => {
  assert.deepEqual(await compareDocumentBytes(bytes, hash.toUpperCase()), { computedHash: hash, matches: true });
  assert.equal((await compareDocumentBytes(new TextEncoder().encode('changed document'), hash)).matches, false);
  await assert.rejects(compareDocumentBytes(bytes, ''), /valid recorded hash/);
});

test('uses the hash and download version for the selected original or signed file', () => {
  const document = { sha256_hash: 'original', metadata: { post_sign_hash: 'signed' } };
  assert.deepEqual(getVerificationTarget(document, 'original'), { hash: 'original', query: '' });
  assert.deepEqual(getVerificationTarget(document, 'signed'), { hash: 'signed', query: '?version=signed' });
  assert.equal(getVerificationTarget({ sha256_hash: 'original' }, 'signed').hash, '');
});

test('reads stored bytes through the authorized download endpoint', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1
      ? new Response(JSON.stringify({ downloadUrl: 'https://storage.example/signed.pdf' }))
      : new Response(bytes);
  });
  const controller = new AbortController();
  const actual = await readStoredDocument('document-id', '?version=signed', controller.signal);
  assert.deepEqual(new Uint8Array(actual), bytes);
  assert.equal(calls[0].url, '/api/documents/document-id/download?version=signed&purpose=verification');
  assert.equal(calls[1].url, 'https://storage.example/signed.pdf');
  assert.equal(calls[1].options.signal, controller.signal);
  assert.equal((await compareDocumentBytes(actual, hash)).matches, true);
});

for (const status of [401, 403, 404, 500]) {
  test(`does not verify inaccessible files (HTTP ${status})`, async (t) => {
    const mock = t.mock.method(globalThis, 'fetch', async () => new Response('Denied', { status }));
    await assert.rejects(readStoredDocument('document', '', new AbortController().signal), /Unable to access/);
    assert.equal(mock.mock.callCount(), 1);
  });
}

test('does not hash a storage error response as a document', async (t) => {
  let count = 0;
  t.mock.method(globalThis, 'fetch', async () => ++count === 1
    ? new Response(JSON.stringify({ downloadUrl: 'https://storage.example/file.pdf' }))
    : new Response('Expired URL', { status: 403 }));
  await assert.rejects(readStoredDocument('document', '', new AbortController().signal), /Unable to read/);
});
