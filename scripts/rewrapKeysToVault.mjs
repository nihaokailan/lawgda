// One-time migration: moves every signing key that is still wrapped with the
// local KEY_WRAPPING_MASTER_KEY ("v1:…") into the HashiCorp Vault KMS
// ("vault:v1:…"). Each key is unwrapped locally, re-wrapped by Vault, checked
// by unwrapping it again through Vault, and only then saved.
//
//   npm run kms:rewrap              # preview: counts only, changes nothing
//   npm run kms:rewrap -- --apply   # re-wrap and save
//
// Needs in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// KEY_WRAPPING_MASTER_KEY (the old key) and VAULT_ADDR / VAULT_ROLE_ID / VAULT_SECRET_ID.

import { readFile } from 'node:fs/promises';

const apply = process.argv.includes('--apply');
const asDataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const vaultSource = await readFile(new URL('../lib/vault.js', import.meta.url), 'utf8');
const keyWrappingSource = (await readFile(new URL('../lib/keyWrapping.js', import.meta.url), 'utf8'))
  .replace("'./vault'", JSON.stringify(asDataUrl(vaultSource)));
const { unwrapWithLocalKek } = await import(asDataUrl(keyWrappingSource));
const { isVaultConfigured, vaultEncrypt, vaultDecrypt } = await import(asDataUrl(vaultSource));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
for (const [name, value] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL: supabaseUrl, SUPABASE_SERVICE_ROLE_KEY: serviceKey, KEY_WRAPPING_MASTER_KEY: process.env.KEY_WRAPPING_MASTER_KEY })) {
  if (!value) {
    console.error(`Missing ${name} in the environment.`);
    process.exit(1);
  }
}
if (!isVaultConfigured()) {
  console.error('Missing VAULT_ADDR / VAULT_ROLE_ID / VAULT_SECRET_ID in the environment.');
  process.exit(1);
}

const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };

async function rest(path, init = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers: { ...headers, ...init.headers } });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const tables = [
  { table: 'user_signing_keys', idColumn: 'user_id' },
  { table: 'external_signer_keys', idColumn: 'signer_email' },
  { table: 'signing_request_certificates', idColumn: 'signing_request_id' },
];

let total = 0;
let moved = 0;
let failed = 0;

for (const { table, idColumn } of tables) {
  const rows = await rest(`${table}?select=${idColumn},wrapped_private_key&wrapped_private_key=like.v1:*`);
  total += rows.length;
  console.log(`${table}: ${rows.length} key(s) still wrapped with the local master key`);
  if (!apply) continue;

  for (const row of rows) {
    const id = row[idColumn];
    let plaintext;
    try {
      plaintext = unwrapWithLocalKek(row.wrapped_private_key);
      const vaultWrapped = await vaultEncrypt(plaintext);
      const check = await vaultDecrypt(vaultWrapped);
      if (!check.equals(plaintext)) throw new Error('Vault round-trip check failed');
      check.fill(0);
      // Only replace the exact value we read, so a concurrent change is never overwritten.
      const updated = await rest(
        `${table}?${idColumn}=eq.${encodeURIComponent(id)}&wrapped_private_key=eq.${encodeURIComponent(row.wrapped_private_key)}`,
        { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ wrapped_private_key: vaultWrapped }) }
      );
      if (!updated?.length) throw new Error('row changed or disappeared during migration');
      moved += 1;
    } catch (error) {
      failed += 1;
      console.error(`  ✗ ${table} ${id}: ${error instanceof Error ? error.message : error}`);
    } finally {
      plaintext?.fill(0);
    }
  }
}

if (!apply) {
  console.log(`\nPreview only: ${total} key(s) would be moved into Vault. Run with --apply to do it.`);
} else {
  console.log(`\nMoved ${moved} of ${total} key(s) into Vault${failed ? `, ${failed} failed (see above)` : ''}.`);
  if (!failed) console.log('All keys are now protected by the Vault KMS. KEY_WRAPPING_MASTER_KEY can be removed from Vercel.');
  process.exitCode = failed ? 1 : 0;
}
