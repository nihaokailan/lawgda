import { getSupabaseAdmin } from './supabaseAdmin';

export async function logSigningAuditEvent({
  signingRequestId,
  documentId,
  eventType,
  actorType,
  actorUserId = null,
  actorEmail = null,
  details = {},
}) {
  const supabaseAdmin = getSupabaseAdmin();
  const { error } = await supabaseAdmin.from('signing_audit_events').insert([
    {
      signing_request_id: signingRequestId,
      document_id: documentId,
      event_type: eventType,
      actor_type: actorType,
      actor_user_id: actorUserId,
      actor_email: actorEmail,
      details,
    },
  ]);

  if (error) {
    throw new Error(`Unable to write signing audit event: ${error.message}`);
  }
}
