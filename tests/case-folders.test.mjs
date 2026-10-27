import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const asDataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const indexingSource = await readFile(new URL('../lib/documentIndexing.js', import.meta.url), 'utf8');
const caseSource = (await readFile(new URL('../lib/caseFolders.js', import.meta.url), 'utf8'))
  .replace("'./documentIndexing'", JSON.stringify(asDataUrl(indexingSource)));
const { validateCaseFields, canManageCase, caseErrorResponse } = await import(asDataUrl(caseSource));
const labelSource = await readFile(new URL('../lib/auditEventLabel.js', import.meta.url), 'utf8');
const { auditEventLabel } = await import(asDataUrl(labelSource));

test('requires a case title and limits title and case number length', () => {
  assert.equal(validateCaseFields({ title: 'People v. Santos', caseNumber: 'Civil Case No. 1' }), '');
  assert.equal(validateCaseFields({ title: 'People v. Santos' }), '');
  assert.match(validateCaseFields({ title: '   ' }), /title is required/);
  assert.match(validateCaseFields({ title: 'x'.repeat(201) }), /at most 200/);
  assert.match(validateCaseFields({ title: 'ok', caseNumber: 'x'.repeat(81) }), /Case number/);
});

test('only Lawyers and Staff of the case firm can manage a case', () => {
  const caseRow = { org_id: 'firm-a' };
  assert.equal(canManageCase({ role: 'lawyer', org_id: 'firm-a' }, caseRow), true);
  assert.equal(canManageCase({ role: 'staff', org_id: 'firm-a' }, caseRow), true);
  assert.equal(canManageCase({ role: 'lawyer', org_id: 'firm-b' }, caseRow), false);
  assert.equal(canManageCase({ role: 'admin', org_id: 'firm-a' }, caseRow), false);
  assert.equal(canManageCase({ role: 'normal', org_id: null }, caseRow), false);
  assert.equal(canManageCase({ role: 'lawyer', org_id: null }, { org_id: null }), false);
});

test('shows known case errors to the user and hides unexpected ones', () => {
  assert.deepEqual(
    caseErrorResponse('This document is already in a case folder. Remove it from that case first.'),
    { status: 409, error: 'This document is already in a case folder. Remove it from that case first.' }
  );
  assert.equal(caseErrorResponse('Filed documents are locked and cannot be moved into a case folder.').status, 409);
  assert.equal(caseErrorResponse('Document not found in this case.').status, 404);
  assert.deepEqual(caseErrorResponse('relation "x" does not exist'), { status: 400, error: 'Unable to save the changes.' });
});

test('labels case folder events in the audit trail', () => {
  assert.equal(auditEventLabel({ event_type: 'added_to_case', details: { case_title: 'People v. Santos' } }), 'Added to case folder People v. Santos');
  assert.equal(auditEventLabel({ event_type: 'removed_from_case', details: {} }), 'Removed from case folder');
});

test('documents opened from a folder go back to that folder', async () => {
  const originSource = await readFile(new URL('../lib/documentOrigin.js', import.meta.url), 'utf8');
  const { documentOriginLabel } = await import(asDataUrl(originSource));
  assert.equal(documentOriginLabel('/cases/0c9f4b7e-1d2a-4f3b-9c8d-7e6f5a4b3c2d'), 'Back to folder');
  assert.equal(documentOriginLabel('/cases'), 'Back to Documents');
  assert.equal(documentOriginLabel('/dashboard'), 'Back to Dashboard');
  assert.equal(documentOriginLabel('/cases/not-a-folder'), null);
  assert.equal(documentOriginLabel('https://evil.example/cases/0c9f4b7e-1d2a-4f3b-9c8d-7e6f5a4b3c2d'), null);
});
