import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../lib/documentIndexing.js', import.meta.url), 'utf8');
const { parseTags, validateIndexFields, matchesIndexQuery, INDEX_LIMITS } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('parses comma-separated tags, trimming blanks and duplicates', () => {
  assert.deepEqual(parseTags(' deed of sale, land title,, deed of sale '), ['deed of sale', 'land title']);
  assert.deepEqual(parseTags(['a', ' b ', '']), ['a', 'b']);
  assert.deepEqual(parseTags(undefined), []);
});

test('rejects oversized case numbers and tag lists', () => {
  assert.equal(validateIndexFields({ caseNumber: 'Civil Case No. 1', tags: ['x'] }), '');
  assert.match(validateIndexFields({ caseNumber: 'x'.repeat(INDEX_LIMITS.caseNumber + 1) }), /Case number/);
  assert.match(validateIndexFields({ tags: Array.from({ length: INDEX_LIMITS.tags + 1 }, (_, i) => `t${i}`) }), /tags/);
  assert.match(validateIndexFields({ tags: ['y'.repeat(INDEX_LIMITS.tagLength + 1)] }), /tags/);
});

test('search matches title, case number or any tag, case-insensitively', () => {
  const row = { title: 'Deed of Sale – Santos', caseNumber: 'Civil Case No. R-DVO-26-01234', tags: ['land title', 'urgent'] };
  assert.equal(matchesIndexQuery(row, 'santos'), true);
  assert.equal(matchesIndexQuery(row, 'r-dvo-26'), true);
  assert.equal(matchesIndexQuery(row, 'URGENT'), true);
  assert.equal(matchesIndexQuery(row, 'affidavit'), false);
  assert.equal(matchesIndexQuery({ title: 'Untitled', caseNumber: null, tags: [] }, ''), true);
});
