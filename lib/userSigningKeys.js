import { generateSigningKeyPair, wrapPrivateKey } from './keyWrapping';

/**
 * Returns the user's signing key pair, generating and wrapping one on first
 * use. The unwrapped private key is never returned or persisted — only the
 * public key and the AES-256-wrapped private key ciphertext.
 */
export async function ensureUserSigningKey(supabaseAdmin, userId) {
  const { data: existing } = await supabaseAdmin
    .from('user_signing_keys')
    .select('public_key,wrapped_private_key')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    return { publicKeyPem: existing.public_key, wrappedPrivateKey: existing.wrapped_private_key };
  }

  const { publicKeyPem, privateKeyDer } = generateSigningKeyPair();
  const wrappedPrivateKey = await wrapPrivateKey(privateKeyDer);
  privateKeyDer.fill(0);

  const { error: insertError } = await supabaseAdmin
    .from('user_signing_keys')
    .insert({ user_id: userId, public_key: publicKeyPem, wrapped_private_key: wrappedPrivateKey });

  if (insertError) {
    // Another request likely generated the key concurrently; use that one.
    const { data: fallback, error: fallbackError } = await supabaseAdmin
      .from('user_signing_keys')
      .select('public_key,wrapped_private_key')
      .eq('user_id', userId)
      .maybeSingle();

    if (fallbackError || !fallback) {
      throw new Error(`Unable to provision signing key: ${insertError.message}`);
    }

    return { publicKeyPem: fallback.public_key, wrappedPrivateKey: fallback.wrapped_private_key };
  }

  return { publicKeyPem, wrappedPrivateKey };
}
