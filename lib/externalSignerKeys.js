import { generateSigningKeyPair, wrapPrivateKey } from './keyWrapping';

/**
 * Same purpose as userSigningKeys.js but for external (non-account) signers,
 * keyed by their verified email address instead of a Supabase auth user id.
 * Gives every "standard signature" signer a persistent AES-wrapped Ed25519
 * signing identity managed by the system (the "AES KMS" system-level signing
 * referenced for Option B).
 */
export async function ensureExternalSignerKey(supabaseAdmin, signerEmail) {
  const normalizedEmail = String(signerEmail || '').trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error('A signer email is required to provision a signing key.');
  }

  const { data: existing } = await supabaseAdmin
    .from('external_signer_keys')
    .select('public_key,wrapped_private_key')
    .eq('signer_email', normalizedEmail)
    .maybeSingle();

  if (existing) {
    return { publicKeyPem: existing.public_key, wrappedPrivateKey: existing.wrapped_private_key };
  }

  const { publicKeyPem, privateKeyDer } = generateSigningKeyPair();
  const wrappedPrivateKey = wrapPrivateKey(privateKeyDer);

  const { error: insertError } = await supabaseAdmin
    .from('external_signer_keys')
    .insert({ signer_email: normalizedEmail, public_key: publicKeyPem, wrapped_private_key: wrappedPrivateKey });

  if (insertError) {
    const { data: fallback, error: fallbackError } = await supabaseAdmin
      .from('external_signer_keys')
      .select('public_key,wrapped_private_key')
      .eq('signer_email', normalizedEmail)
      .maybeSingle();

    if (fallbackError || !fallback) {
      throw new Error(`Unable to provision signing key: ${insertError.message}`);
    }

    return { publicKeyPem: fallback.public_key, wrappedPrivateKey: fallback.wrapped_private_key };
  }

  return { publicKeyPem, wrappedPrivateKey };
}
