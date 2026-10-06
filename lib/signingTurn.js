/**
 * For each document, whether the given signer (by email) is waiting on
 * someone earlier or can sign now. Mirrors the ordering rule enforced when a
 * signing link is opened (lib/signingValidation.js), so the Documents list
 * only calls something "pending" for a signer when it is actually their turn.
 *
 * Returns Map<documentId, { state: 'sign' | 'waiting', requestId }>.
 */
export async function loadMySigningTurns(supabaseAdmin, email, documentIds) {
  const turns = new Map();
  const normalizedEmail = String(email ?? '').trim().toLowerCase();
  const ids = [...new Set((documentIds || []).filter(Boolean))];
  if (!normalizedEmail || ids.length === 0) {
    return turns;
  }

  const { data: requests } = await supabaseAdmin
    .from('signing_requests')
    .select('id,document_id,signer_email,signing_order,status,expires_at')
    .in('document_id', ids)
    .in('status', ['pending', 'viewed']);

  const byDocument = new Map();
  for (const request of requests || []) {
    if (!byDocument.has(request.document_id)) byDocument.set(request.document_id, []);
    byDocument.get(request.document_id).push(request);
  }

  for (const [documentId, open] of byDocument) {
    const mine = open.find((request) => String(request.signer_email).toLowerCase() === normalizedEmail
      && new Date(request.expires_at).getTime() > Date.now());
    if (!mine) continue;
    const blocked = open.some((request) => request.signing_order < mine.signing_order);
    turns.set(documentId, { state: blocked ? 'waiting' : 'sign', requestId: mine.id });
  }

  return turns;
}

export const SIGNING_TURN_LABELS = {
  sign: 'Pending your signature',
  waiting: 'Waiting for other signers',
};
