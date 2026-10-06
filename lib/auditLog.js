import { getSupabaseAdmin } from './supabaseAdmin';

export async function logDocumentAuditEvent({
  documentId,
  actorUserId = null,
  eventType,
  details = {},
}) {
  const supabaseAdmin = getSupabaseAdmin();
  const { error } = await supabaseAdmin.from('audit_logs').insert([
    {
      document_id: documentId,
      actor_user_id: actorUserId,
      event_type: eventType,
      details,
    },
  ]);

  if (error) {
    throw new Error(`Unable to write audit log event: ${error.message}`);
  }
}
