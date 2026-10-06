import { getSupabaseAdmin } from './supabaseAdmin';
import { logDocumentAuditEvent } from './auditLog';

// Mirrors the transition matrix enforced by the DB trigger in
// 015_file_completed_documents.sql — kept here too so invalid transitions
// are skipped quietly instead of round-tripping to a DB error.
const VALID_TRANSITIONS = {
  Drafting: ['Pending', 'Signed', 'Filed'],
  Pending: ['Signed', 'Filed'],
  Signed: ['Filed'],
};

/**
 * Atomically moves a document from its current status to `toStatus` (only if
 * that transition is valid and the row hasn't already moved), and records the
 * change as a `status_changed` audit event. Safe to call speculatively —
 * no-ops if the document is already at or past the target status.
 */
export async function transitionDocumentStatus({
  documentId,
  toStatus,
  actorUserId = null,
  reason,
  extraDetails = {},
}) {
  const supabaseAdmin = getSupabaseAdmin();

  const { data: current, error: fetchError } = await supabaseAdmin
    .from('documents')
    .select('status')
    .eq('id', documentId)
    .maybeSingle();

  if (fetchError || !current) {
    return { transitioned: false, fromStatus: null, toStatus, error: fetchError?.message || 'Document not found' };
  }

  const fromStatus = current.status;

  if (fromStatus === toStatus) {
    return { transitioned: false, fromStatus, toStatus };
  }

  const allowedTargets = VALID_TRANSITIONS[fromStatus] || [];
  if (!allowedTargets.includes(toStatus)) {
    return { transitioned: false, fromStatus, toStatus };
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('documents')
    .update({ status: toStatus })
    .eq('id', documentId)
    .eq('status', fromStatus)
    .select('id')
    .maybeSingle();

  if (updateError || !updated) {
    return { transitioned: false, fromStatus, toStatus, error: updateError?.message || 'Document status changed concurrently' };
  }

  await logDocumentAuditEvent({
    documentId,
    actorUserId,
    eventType: 'status_changed',
    details: { from: fromStatus, to: toStatus, reason, ...extraDetails },
  });

  return { transitioned: true, fromStatus, toStatus };
}
