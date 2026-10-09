import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../lib/publicVerification.js', import.meta.url), 'utf8');
const { classifyFileHash } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const h = (character) => character.repeat(64);
const document = {
  sha256_hash: h('a'),
  metadata: {
    post_sign_hash: h('c'),
    hash_chain: [
      { pre_sign_hash: h('a'), post_sign_hash: h('b') },
      { pre_sign_hash: h('b'), post_sign_hash: h('c') },
    ],
  },
};

test('final signed copy is authentic', () => {
  assert.deepEqual(classifyFileHash(document, h('c')), { outcome: 'authentic', matchedVersion: 'final_signed', expectedHash: h('c') });
});

test('original and intermediate copies are genuine but not final', () => {
  assert.equal(classifyFileHash(document, h('a')).matchedVersion, 'original_upload');
  assert.equal(classifyFileHash(document, h('b')).outcome, 'earlier_version');
  assert.equal(classifyFileHash(document, h('B')).outcome, 'earlier_version', 'hash comparison is case-insensitive');
});

test('any other hash is an integrity breach', () => {
  assert.equal(classifyFileHash(document, h('d')).outcome, 'breach');
});

test('unsigned documents only match their original upload', () => {
  const draft = { sha256_hash: h('a'), metadata: {} };
  assert.equal(classifyFileHash(draft, h('a')).outcome, 'earlier_version');
  assert.equal(classifyFileHash(draft, h('e')).outcome, 'breach');
});
