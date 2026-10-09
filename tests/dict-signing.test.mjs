import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import forge from 'node-forge';

// Load the app's ESM helpers without changing the Next.js package type.
async function loadHelper(path) {
  const source = (await readFile(new URL(path, import.meta.url), 'utf8'))
    .replace("'node-forge'", JSON.stringify(import.meta.resolve('node-forge')))
    .replace("'pdf-lib'", JSON.stringify(import.meta.resolve('pdf-lib')));
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
const { extractKeyAndCertFromP12 } = await loadHelper('../lib/pkcs12.js');
const { signRsaDigestWithPrivateKey, verifyRsaDigestWithCertificate, LEGACY_RSA_SIGNATURE_SCHEME } = await loadHelper('../lib/keyWrapping.js');
const { createHash, createPrivateKey, sign: nodeSign, verify: nodeVerify } = await import('node:crypto');
const keys = forge.pki.rsa.generateKeyPair(2048);
function certificate(pair, name, { notBefore = new Date(Date.now() - 60000), notAfter = new Date(Date.now() + 86400000) } = {}) {
  const cert = forge.pki.createCertificate();
  cert.publicKey = pair.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = notBefore;
  cert.validity.notAfter = notAfter;
  cert.setSubject([{ name: 'commonName', value: name }]);
  cert.setIssuer(cert.subject.attributes);
  cert.sign(pair.privateKey, forge.md.sha256.create());
  return cert;
}
const leaf = certificate(keys, 'Test signer');
const unrelated = certificate(forge.pki.rsa.generateKeyPair(2048), 'Other certificate');
function bundle(certs, password) {
  return forge.util.encode64(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(keys.privateKey, certs, password, { algorithm: '3des' })).getBytes());
}
for (const password of ['test-passphrase', null]) {
  test(`extracts and signs with ${password ? 'encrypted' : 'unencrypted'} key bags`, () => {
    const extracted = extractKeyAndCertFromP12(bundle([leaf], password), password);
    const digest = Buffer.alloc(32, 42);
    const signature = signRsaDigestWithPrivateKey(extracted.privateKeyDer, digest);
    assert.equal(verifyRsaDigestWithCertificate(extracted.certificatePem, digest, signature), true);
    assert.equal(verifyRsaDigestWithCertificate(extracted.certificatePem, Buffer.alloc(32), signature), false);
  });
}
test('signature is standard PKCS#1 v1.5 over the document SHA-256 (verifiable without Lawgda)', () => {
  const extracted = extractKeyAndCertFromP12(bundle([leaf], 'secret'), 'secret');
  const documentBytes = Buffer.from('%PDF-1.7 example document');
  const digest = createHash('sha256').update(documentBytes).digest();
  const signature = signRsaDigestWithPrivateKey(extracted.privateKeyDer, digest);
  // Same check `openssl dgst -sha256 -verify` performs on the original file.
  assert.equal(nodeVerify('sha256', documentBytes, extracted.certificatePem, Buffer.from(signature, 'base64')), true);
});

test('signatures made with the legacy double-hash scheme still verify when tagged legacy', () => {
  const digest = Buffer.alloc(32, 7);
  const privateKey = createPrivateKey(forge.pki.privateKeyToPem(keys.privateKey));
  const legacySignature = nodeSign('sha256', digest, privateKey).toString('base64');
  const certificatePem = forge.pki.certificateToPem(leaf);
  assert.equal(verifyRsaDigestWithCertificate(certificatePem, digest, legacySignature, LEGACY_RSA_SIGNATURE_SCHEME), true);
  assert.equal(verifyRsaDigestWithCertificate(certificatePem, digest, legacySignature), false);
});

test('rejects expired and not-yet-valid certificates', () => {
  const expired = certificate(keys, 'Test signer', { notBefore: new Date('2020-01-01'), notAfter: new Date('2021-01-01') });
  const future = certificate(keys, 'Test signer', { notBefore: new Date(Date.now() + 86400000), notAfter: new Date(Date.now() + 2 * 86400000) });
  assert.throws(() => extractKeyAndCertFromP12(bundle([expired], 'secret'), 'secret'), /expired/);
  assert.throws(() => extractKeyAndCertFromP12(bundle([future], 'secret'), 'secret'), /not valid until/);
});

test('matches the signer certificate when another certificate is first', () => {
  assert.equal(extractKeyAndCertFromP12(bundle([unrelated, leaf], 'secret'), 'secret').subjectCn, 'Test signer');
});
test('rejects mismatched certificates', () => {
  assert.throws(() => extractKeyAndCertFromP12(bundle([unrelated], 'secret'), 'secret'), /matching/);
});
test('rejects wrong passwords and invalid files', () => {
  assert.throws(() => extractKeyAndCertFromP12(bundle([leaf], 'secret'), 'wrong'), /passphrase/);
  assert.throws(() => extractKeyAndCertFromP12('invalid', 'secret'), /not a valid/);
});

test('preview details contain public identity fields only', () => {
  const { details } = extractKeyAndCertFromP12(bundle([leaf], 'secret'), 'secret');
  assert.deepEqual(Object.keys(details).sort(), ['holderName', 'issuer', 'issuerDn', 'serialNumber', 'subject', 'validFrom', 'validTo'].sort());
  assert.equal(details.holderName, 'Test signer');
  assert.equal(details.issuer, 'Test signer');
  assert.equal(details.serialNumber, '01');
});

test('PDF displays public certificate details without embedding the bundle or private key', async () => {
  const { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } = await import('pdf-lib');
  const { addElectronicSignature } = await loadHelper('../lib/signedPdf.js');
  const p12Base64 = bundle([leaf], 'secret');
  const extracted = extractKeyAndCertFromP12(p12Base64, 'secret');
  const original = await PDFDocument.create();
  original.addPage();
  const { pdfBytes } = await addElectronicSignature(await original.save(), {
    signerName: 'Untrusted typed name', signerEmail: 'test@example.com',
    signedAt: '2026-09-22T00:00:00Z', requestId: 'test-request',
    certificateSubjectCn: extracted.details.holderName, certificateDetails: extracted.details,
    // Even extraneous credential fields must never be serialized into the PDF.
    p12Base64, privateKeyDer: extracted.privateKeyDer,
  });
  const pdf = await PDFDocument.load(pdfBytes);
  assert.equal(pdf.catalog.get(PDFName.of('Names')), undefined);
  const decoded = pdf.context.enumerateIndirectObjects().filter(([, object]) => object instanceof PDFRawStream)
    .map(([, stream]) => Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1')).join('\n');
  for (const text of ['Digitally signed by', 'Test signer', 'Certificate ID: 01', 'Issuer: Test signer']) {
    assert.ok(decoded.includes(Buffer.from(text).toString('hex').toUpperCase()), text);
  }
  assert.ok(!decoded.includes(Buffer.from('Untrusted typed name').toString('hex').toUpperCase()));
  assert.ok(!Buffer.from(pdfBytes).includes(extracted.privateKeyDer));
  assert.ok(!Buffer.from(pdfBytes).includes(Buffer.from(p12Base64, 'base64')));
  assert.ok(!decoded.includes('PRIVATE KEY'));
});

test('successive signatures share a page without overlap and overflow safely', async () => {
  const { PDFDocument, PDFName } = await import('pdf-lib');
  const { addElectronicSignature } = await loadHelper('../lib/signedPdf.js');
  const original = await PDFDocument.create();
  original.addPage();
  let bytes = await original.save();
  let index;
  let bottom;
  for (let count = 0; count < 7; count++) {
    const result = await addElectronicSignature(bytes, {
      signerName: `Signer ${count}`, signerEmail: 'test@example.com',
      signedAt: '2026-09-22T00:00:00Z', requestId: 'test-request',
      certificateSubjectCn: count % 2 ? 'Certificate signer' : undefined,
      certificateDetails: { issuer: 'Test issuer', serialNumber: '01' },
      signaturePageIndex: index, signatureCount: count,
    });
    const pdf = await PDFDocument.load(result.pdfBytes);
    const nextBottom = pdf.getPage(result.signaturePageIndex).node.get(PDFName.of('LawgdaSignatureBottom')).asNumber();
    if (count === 1) assert.equal(result.signaturePageIndex, index, 'second signer stays on first signature page');
    if (index === result.signaturePageIndex) assert.ok(nextBottom < bottom - 12, 'blocks do not overlap');
    assert.ok(nextBottom >= 108, 'audit QR area stays clear');
    bytes = result.pdfBytes;
    index = result.signaturePageIndex;
    bottom = nextBottom;
  }
  assert.ok(index > 1, 'full pages overflow');
  assert.ok(index < 7, 'signatures share pages');
});
