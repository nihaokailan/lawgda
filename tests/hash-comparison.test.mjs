import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// The diff count shown under a mismatch ("N of 64 characters differ").
const source = await readFile(new URL('../app/components/HashComparison.tsx', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('function countDifferences'), source.indexOf('/**', source.indexOf('function countDifferences')));
const countDifferences = new Function(`${body.replace(/: string/g, '')}; return countDifferences;`)();

test('counts the characters that differ between two hashes', () => {
  const a = 'a'.repeat(64);
  assert.equal(countDifferences(a, a), 0);
  assert.equal(countDifferences(a, `b${'a'.repeat(63)}`), 1);
  assert.equal(countDifferences(a, 'b'.repeat(64)), 64);
  assert.equal(countDifferences('abc', 'abcd'), 1);
});
