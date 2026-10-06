import { hashSigningToken } from './signingTokens';
import { getSupabaseAdmin } from './supabaseAdmin';
import { findStaffEmails } from './staffSigners';

export async function resolveSigningRequestByToken(rawToken) {
  const supabaseAdmin = getSupabaseAdmin();
  const tokenHash = hashSigningToken(rawToken);
  const { data: request, error } = await supabaseAdmin
    .from('signing_requests')
    .select('id,document_id,requested_by,internal_signer_id,signer_name,signer_email,signing_order,enforce_sequential,status,token_reference,expires_at,viewed_at,signed_at,revoked_at,created_at')
    .eq('token_hash', tokenHash)
    .single();

  if (error || !request) {
    return { request: null, reason: 'invalid_token' };
  }

  if (request.status === 'revoked' || request.revoked_at) {
    return { request, reason: 'revoked' };
  }

  if (request.status === 'signed' || request.signed_at) {
    return { request, reason: 'already_completed' };
  }

  // Links issued before an account was made Staff must stop working too.
  const [staffMatch] = await findStaffEmails(supabaseAdmin, [request.signer_email]);
  if (staffMatch) {
    return { request, reason: 'staff_not_allowed' };
  }

  const { data: document } = await supabaseAdmin
    .from('documents')
    .select('metadata')
    .eq('id', request.document_id)
    .maybeSingle();
  const metadata = document?.metadata && typeof document.metadata === 'object' && !Array.isArray(document.metadata)
    ? document.metadata
    : {};
  const hashChain = Array.isArray(metadata.hash_chain) ? metadata.hash_chain : [];
  const completedRequestIds = new Set(
    hashChain
      .map((entry) => entry && typeof entry === 'object' ? entry.signing_request_id : null)
      .filter(Boolean)
  );

  if (completedRequestIds.has(request.id)) {
    return { request: { ...request, status: 'signed' }, reason: 'already_completed' };
  }

  const now = Date.now();
  if (new Date(request.expires_at).getTime() <= now) {
    if (request.status !== 'expired') {
      await supabaseAdmin
        .from('signing_requests')
        .update({ status: 'expired' })
        .eq('id', request.id);
    }
    return { request: { ...request, status: 'expired' }, reason: 'expired' };
  }

  const { data: earlierPending, error: orderError } = await supabaseAdmin
    .from('signing_requests')
    .select('id')
    .eq('document_id', request.document_id)
    .lt('signing_order', request.signing_order)
    .in('status', ['pending', 'viewed'])
    .limit(1);

  const hasUnsignedEarlierRequest = (earlierPending ?? []).some((earlierRequest) => !completedRequestIds.has(earlierRequest.id));
  if (!orderError && hasUnsignedEarlierRequest) {
    return { request, reason: 'not_your_turn' };
  }

  return { request, reason: null };
}
