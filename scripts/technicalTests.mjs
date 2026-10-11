// Developer-led technical testing (Chapter 3.2(4) / 3.6). Exercises Lawgda's
// real hashing, verification, signing and audit-chain code and prints the
// measurements used for Objectives 5 and 7 (ISO/IEC 25010: functional
// suitability, security, performance efficiency).
//
//   npm run test:technical            # default trial counts
//   npm run test:technical -- --trials=500 --json=results.json

import { readFile, writeFile } from 'node:fs/promises';
import { createHash, generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import forge from 'node-forge';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.replace(/^--/, '').split('=');
  return [key, value ?? true];
}));
const TRIALS = Number(args.trials || 200);
const PERF_RUNS = Number(args.runs || 15);

// Load the app's ESM helpers without changing the Next.js package type.
const asDataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
async function loadHelper(path) {
  const vaultSource = await readFile(new URL('../lib/vault.js', import.meta.url), 'utf8');
  const source = (await readFile(new URL(path, import.meta.url), 'utf8'))
    .replace("'node-forge'", JSON.stringify(import.meta.resolve('node-forge')))
    .replace("'pdf-lib'", JSON.stringify(import.meta.resolve('pdf-lib')))
    .replace("'./vault'", JSON.stringify(asDataUrl(vaultSource)));
  return import(asDataUrl(source));
}

const { sha256Hex } = await loadHelper('../lib/documentHash.js');
const { classifyFileHash } = await loadHelper('../lib/publicVerification.js');
const { verifyAuditLogsChain } = await loadHelper('../lib/auditChainVerify.js');
const { addElectronicSignature } = await loadHelper('../lib/signedPdf.js');
const {
  signRsaDigestWithPrivateKey, verifyRsaDigestWithCertificate,
  wrapWithLocalKek, unwrapWithLocalKek, signWithWrappedKey, verifyWithPublicKeyPem, generateSigningKeyPair,
} = await loadHelper('../lib/keyWrapping.js');
const { isVaultConfigured, vaultEncrypt, vaultDecrypt } = await import(asDataUrl(await readFile(new URL('../lib/vault.js', import.meta.url), 'utf8')));

process.env.KEY_WRAPPING_MASTER_KEY ||= randomBytes(32).toString('base64');
// Offline sections use the local AES-256 KEK; section 6 tests the Vault KMS when configured.
const VAULT_ON = isVaultConfigured();
const savedVaultAddr = process.env.VAULT_ADDR;
delete process.env.VAULT_ADDR;

const results = { generatedAt: new Date().toISOString(), trials: TRIALS, perfRuns: PERF_RUNS, sections: {} };
const pct = (part, whole) => (whole ? (100 * part / whole) : 0);
const fmtPct = (value) => `${value.toFixed(2)}%`;
const median = (values) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; };
const randomInt = (max) => Math.floor(Math.random() * max);

async function samplePdf(pages = 3) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let page = 0; page < pages; page += 1) {
    pdf.addPage().drawText(`Lawgda test document ${randomUUID()} — page ${page + 1}`, { x: 50, y: 700, size: 12, font });
  }
  return Buffer.from(await pdf.save());
}

// ---------------------------------------------------------------------------
// 1. Tamper detection accuracy (Objective 1 — REE Rule 5 integrity)
// ---------------------------------------------------------------------------
const tamperings = {
  'single bit flipped': (bytes) => { const copy = Buffer.from(bytes); const i = randomInt(copy.length); copy[i] ^= 1 << randomInt(8); return copy; },
  'one byte appended': (bytes) => Buffer.concat([bytes, Buffer.from([randomInt(256)])]),
  'last byte removed': (bytes) => bytes.subarray(0, bytes.length - 1),
  'metadata edited (title)': async (bytes) => { const pdf = await PDFDocument.load(bytes); pdf.setTitle(`Edited ${randomUUID()}`); return Buffer.from(await pdf.save()); },
  'page added': async (bytes) => { const pdf = await PDFDocument.load(bytes); pdf.addPage(); return Buffer.from(await pdf.save()); },
};

const tamperRows = [];
let detected = 0;
let attempts = 0;
let falsePositives = 0;
for (const [label, tamper] of Object.entries(tamperings)) {
  let caught = 0;
  for (let trial = 0; trial < TRIALS; trial += 1) {
    const original = await samplePdf(1 + randomInt(3));
    const recorded = sha256Hex(original);
    // Unmodified copy must verify (false-positive check).
    if (sha256Hex(Buffer.from(original)) !== recorded) falsePositives += 1;
    const altered = await tamper(original);
    if (sha256Hex(altered) !== recorded) caught += 1;
  }
  detected += caught;
  attempts += TRIALS;
  tamperRows.push({ tampering: label, trials: TRIALS, detected: caught, accuracy: pct(caught, TRIALS) });
}
results.sections.tamperDetection = {
  rows: tamperRows,
  overallAccuracy: pct(detected, attempts),
  unmodifiedCopies: Object.keys(tamperings).length * TRIALS,
  falsePositiveRate: pct(falsePositives, Object.keys(tamperings).length * TRIALS),
};

// ---------------------------------------------------------------------------
// 2. Version classification on the public QR check (§1.5.1(10))
// ---------------------------------------------------------------------------
const original = await samplePdf(2);
const firstSigned = Buffer.concat([original, Buffer.from('%signature-1')]);
const finalSigned = Buffer.concat([firstSigned, Buffer.from('%signature-2')]);
const documentRow = {
  sha256_hash: sha256Hex(original),
  metadata: {
    post_sign_hash: sha256Hex(finalSigned),
    hash_chain: [
      { pre_sign_hash: sha256Hex(original), post_sign_hash: sha256Hex(firstSigned) },
      { pre_sign_hash: sha256Hex(firstSigned), post_sign_hash: sha256Hex(finalSigned) },
    ],
  },
};
const classificationCases = [
  ['final signed copy', finalSigned, 'authentic'],
  ['original upload', original, 'earlier_version'],
  ['intermediate signed copy', firstSigned, 'earlier_version'],
  ['altered final copy', tamperings['single bit flipped'](finalSigned), 'breach'],
];
results.sections.classification = classificationCases.map(([label, bytes, expected]) => {
  const actual = classifyFileHash(documentRow, sha256Hex(bytes)).outcome;
  return { case: label, expected, actual, pass: actual === expected };
});

// ---------------------------------------------------------------------------
// 3. Audit-chain tamper detection (Objective 2 — chain of custody)
// ---------------------------------------------------------------------------
const GENESIS = '0'.repeat(64);
function buildChain(length) {
  const documentId = randomUUID();
  const rows = [];
  let previous = GENESIS;
  const start = Date.now();
  for (let index = 0; index < length; index += 1) {
    const row = {
      id: randomUUID(), document_id: documentId, event_type: ['document_viewed', 'status_changed', 'signing_completed'][index % 3],
      actor_user_id: randomUUID(), details_text: JSON.stringify({ step: index }),
      created_at_text: new Date(start + index * 1000).toISOString().replace('T', ' ').replace('Z', '+00'),
    };
    row.previous_hash = previous;
    row.record_hash = createHash('sha256').update(previous + row.id + row.document_id + row.event_type + row.actor_user_id + row.details_text + row.created_at_text).digest('hex');
    previous = row.record_hash;
    rows.push(row);
  }
  return rows;
}
const chainAttacks = {
  'event details edited': (rows) => { rows[randomInt(rows.length)].details_text = '{"step":"forged"}'; },
  'event deleted': (rows) => { rows.splice(1 + randomInt(rows.length - 2), 1); },
  'events reordered': (rows) => { const i = 1 + randomInt(rows.length - 2); [rows[i], rows[i + 1]] = [rows[i + 1], rows[i]]; },
  'actor changed': (rows) => { rows[randomInt(rows.length)].actor_user_id = randomUUID(); },
  'forged event inserted': (rows) => { const forged = { ...rows[0], id: randomUUID(), event_type: 'signing_completed' }; rows.splice(1 + randomInt(rows.length - 1), 0, forged); },
};
let intactValid = 0;
const chainRows = Object.entries(chainAttacks).map(([label, attack]) => {
  let caught = 0;
  for (let trial = 0; trial < TRIALS; trial += 1) {
    const rows = buildChain(10 + randomInt(40));
    if (verifyAuditLogsChain(rows).valid === true) intactValid += 1;
    attack(rows);
    if (verifyAuditLogsChain(rows).valid === false) caught += 1;
  }
  return { attack: label, trials: TRIALS, detected: caught, accuracy: pct(caught, TRIALS) };
});
results.sections.auditChain = {
  rows: chainRows,
  intactChainsVerified: pct(intactValid, Object.keys(chainAttacks).length * TRIALS),
};

// ---------------------------------------------------------------------------
// 4. Signatures and key wrapping (Objectives 3 and 6)
// ---------------------------------------------------------------------------
const rsa = forge.pki.rsa.generateKeyPair(2048);
const cert = forge.pki.createCertificate();
cert.publicKey = rsa.publicKey;
cert.serialNumber = '01';
cert.validity.notBefore = new Date(Date.now() - 60000);
cert.validity.notAfter = new Date(Date.now() + 86400000);
cert.setSubject([{ name: 'commonName', value: 'Technical Test Signer' }]);
cert.setIssuer(cert.subject.attributes);
cert.sign(rsa.privateKey, forge.md.sha256.create());
const certificatePem = forge.pki.certificateToPem(cert);
const rsaDer = Buffer.from(forge.asn1.toDer(forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(rsa.privateKey))).getBytes(), 'binary');

let rsaValid = 0; let rsaForgedRejected = 0;
let edValid = 0; let edForgedRejected = 0;
let wrapsOpaque = 0; let wrapsRoundTrip = 0; let tamperedWrapsRejected = 0;
const { publicKeyPem: edPublic, privateKeyDer: edPrivate } = generateSigningKeyPair();
const edWrapped = wrapWithLocalKek(edPrivate);
for (let trial = 0; trial < TRIALS; trial += 1) {
  const digest = createHash('sha256').update(randomBytes(64)).digest();
  const otherDigest = createHash('sha256').update(randomBytes(64)).digest();

  const rsaSignature = signRsaDigestWithPrivateKey(rsaDer, digest);
  if (verifyRsaDigestWithCertificate(certificatePem, digest, rsaSignature)) rsaValid += 1;
  if (!verifyRsaDigestWithCertificate(certificatePem, otherDigest, rsaSignature)) rsaForgedRejected += 1;

  const edSignature = await signWithWrappedKey(edWrapped, digest);
  if (verifyWithPublicKeyPem(edPublic, digest, edSignature)) edValid += 1;
  if (!verifyWithPublicKeyPem(edPublic, otherDigest, edSignature)) edForgedRejected += 1;

  const wrapped = wrapWithLocalKek(rsaDer);
  if (!wrapped.includes(rsaDer.toString('base64')) && !wrapped.includes('PRIVATE KEY')) wrapsOpaque += 1;
  if (unwrapWithLocalKek(wrapped).equals(rsaDer)) wrapsRoundTrip += 1;
  const parts = wrapped.split(':');
  const ciphertext = Buffer.from(parts[3], 'base64'); ciphertext[0] ^= 1; parts[3] = ciphertext.toString('base64');
  try { unwrapWithLocalKek(parts.join(':')); } catch { tamperedWrapsRejected += 1; }
}
results.sections.cryptography = [
  { check: 'RSA (DICT .p12) signatures verify', rate: pct(rsaValid, TRIALS) },
  { check: 'RSA signature rejected for a different document', rate: pct(rsaForgedRejected, TRIALS) },
  { check: 'Ed25519 (standard) signatures verify', rate: pct(edValid, TRIALS) },
  { check: 'Ed25519 signature rejected for a different document', rate: pct(edForgedRejected, TRIALS) },
  { check: 'AES-256-GCM wrapped key stored as unreadable ciphertext', rate: pct(wrapsOpaque, TRIALS) },
  { check: 'Wrapped key unwraps to the exact original', rate: pct(wrapsRoundTrip, TRIALS) },
  { check: 'Tampered wrapped key rejected (GCM auth tag)', rate: pct(tamperedWrapsRejected, TRIALS) },
];

// ---------------------------------------------------------------------------
// 5. Performance efficiency (Objective 7 — time behaviour)
// ---------------------------------------------------------------------------
function time(fn, runs = PERF_RUNS) {
  const samples = [];
  for (let run = 0; run < runs; run += 1) {
    const start = performance.now();
    fn();
    samples.push(performance.now() - start);
  }
  return median(samples);
}
async function timeAsync(fn, runs = PERF_RUNS) {
  const samples = [];
  for (let run = 0; run < runs; run += 1) {
    const start = performance.now();
    await fn();
    samples.push(performance.now() - start);
  }
  return median(samples);
}
const perfRows = [];
for (const megabytes of [1, 5, 10]) {
  const bytes = randomBytes(megabytes * 1024 * 1024);
  perfRows.push({ operation: `SHA-256 of a ${megabytes} MB file`, medianMs: time(() => sha256Hex(bytes)) });
}
const digest = createHash('sha256').update(randomBytes(1024)).digest();
perfRows.push({ operation: 'RSA-2048 signature (DICT path)', medianMs: time(() => signRsaDigestWithPrivateKey(rsaDer, digest)) });
perfRows.push({ operation: 'Ed25519 unwrap + sign (local KEK)', medianMs: await timeAsync(() => signWithWrappedKey(edWrapped, digest)) });
const tenPagePdf = await samplePdf(10);
perfRows.push({
  operation: 'Stamp signature page onto a 10-page PDF',
  medianMs: await timeAsync(() => addElectronicSignature(tenPagePdf, { signerName: 'Test', signerEmail: 't@example.com', signedAt: new Date().toISOString(), requestId: randomUUID(), previousDocumentHash: sha256Hex(tenPagePdf) })),
});
const longChain = buildChain(500);
perfRows.push({ operation: 'Verify a 500-event audit chain', medianMs: time(() => verifyAuditLogsChain(longChain)) });
results.sections.performance = perfRows;

// ---------------------------------------------------------------------------
// 6. Key Management Server — HashiCorp Vault (Objective 6), when configured
// ---------------------------------------------------------------------------
if (VAULT_ON) {
  process.env.VAULT_ADDR = savedVaultAddr;
  const vaultRuns = Math.min(TRIALS, 20);
  let opaque = 0; let roundTrip = 0; let tamperRejected = 0;
  for (let trial = 0; trial < vaultRuns; trial += 1) {
    const keyMaterial = randomBytes(48);
    const ciphertext = await vaultEncrypt(keyMaterial);
    if (ciphertext.startsWith('vault:') && !ciphertext.includes(keyMaterial.toString('base64'))) opaque += 1;
    if ((await vaultDecrypt(ciphertext)).equals(keyMaterial)) roundTrip += 1;
    const body = Buffer.from(ciphertext.split(':')[2], 'base64'); body[body.length - 1] ^= 1;
    try { await vaultDecrypt(`vault:v1:${body.toString('base64')}`); } catch { tamperRejected += 1; }
  }
  results.sections.vault = {
    trials: vaultRuns,
    checks: [
      { check: 'Key stored only as Vault ciphertext (vault:v1:…)', rate: pct(opaque, vaultRuns) },
      { check: 'Vault unwraps to the exact original key', rate: pct(roundTrip, vaultRuns) },
      { check: 'Tampered Vault ciphertext rejected', rate: pct(tamperRejected, vaultRuns) },
    ],
  };
  const sample = randomBytes(48);
  perfRows.push({ operation: 'Vault wrap (encrypt) round trip', medianMs: await timeAsync(() => vaultEncrypt(sample), 5) });
  const sampleCiphertext = await vaultEncrypt(sample);
  perfRows.push({ operation: 'Vault unwrap (decrypt) round trip', medianMs: await timeAsync(() => vaultDecrypt(sampleCiphertext), 5) });
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const table = (headers, rows) => [
  `| ${headers.join(' | ')} |`,
  `| ${headers.map(() => '---').join(' | ')} |`,
  ...rows.map((row) => `| ${row.join(' | ')} |`),
].join('\n');

console.log(`# Lawgda technical test results\n\nGenerated ${results.generatedAt} · ${TRIALS} trials per case · median of ${PERF_RUNS} runs for timings\n`);
console.log('## 1. Tamper detection (SHA-256)\n');
console.log(table(['Tampering', 'Trials', 'Detected', 'Accuracy'], tamperRows.map((row) => [row.tampering, row.trials, row.detected, fmtPct(row.accuracy)])));
console.log(`\nOverall detection accuracy: **${fmtPct(results.sections.tamperDetection.overallAccuracy)}** · False positives on ${results.sections.tamperDetection.unmodifiedCopies} unmodified copies: **${fmtPct(results.sections.tamperDetection.falsePositiveRate)}**\n`);
console.log('## 2. Public QR check — version classification\n');
console.log(table(['File checked', 'Expected', 'Result', 'Pass'], results.sections.classification.map((row) => [row.case, row.expected, row.actual, row.pass ? '✓' : '✗'])));
console.log('\n## 3. Audit chain tamper detection\n');
console.log(table(['Attack on the log', 'Trials', 'Detected', 'Accuracy'], chainRows.map((row) => [row.attack, row.trials, row.detected, fmtPct(row.accuracy)])));
console.log(`\nIntact chains verified as valid: **${fmtPct(results.sections.auditChain.intactChainsVerified)}**\n`);
console.log('## 4. Signatures and key protection\n');
console.log(table(['Check', 'Success rate'], results.sections.cryptography.map((row) => [row.check, fmtPct(row.rate)])));
console.log('\n## 5. Performance (median time)\n');
console.log(table(['Operation', 'Median (ms)'], perfRows.map((row) => [row.operation, row.medianMs.toFixed(2)])));
if (results.sections.vault) {
  console.log('\n## 6. Key Management Server (HashiCorp Vault)\n');
  console.log(table(['Check', 'Success rate'], results.sections.vault.checks.map((row) => [row.check, fmtPct(row.rate)])));
} else {
  console.log('\n## 6. Key Management Server (HashiCorp Vault)\n\nSkipped — set VAULT_ADDR, VAULT_ROLE_ID and VAULT_SECRET_ID to include it.');
}

if (args.json) {
  await writeFile(String(args.json), JSON.stringify(results, null, 2));
  console.log(`\nSaved raw results to ${args.json}`);
}

const failures = [
  results.sections.tamperDetection.overallAccuracy < 100,
  results.sections.tamperDetection.falsePositiveRate > 0,
  results.sections.classification.some((row) => !row.pass),
  chainRows.some((row) => row.accuracy < 100),
  results.sections.auditChain.intactChainsVerified < 100,
  results.sections.cryptography.some((row) => row.rate < 100),
  results.sections.vault?.checks.some((row) => row.rate < 100),
].filter(Boolean).length;
process.exitCode = failures ? 1 : 0;
