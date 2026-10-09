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

/**
 * Same as logDocumentAuditEvent, but skips the write if an identical event
 * (same type and same `match` detail values) was already recorded within
 * `windowMs`. Used where one user action loads a file more than once (e.g. a
 * preview plus the browser-side hash), so the trail shows one event, not two.
 */
export async function logDocumentAuditEventOnce({ windowMs = 5 * 60 * 1000, match = {}, ...event }) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data: recent } = await supabaseAdmin
    .from('audit_logs')
    .select('id')
    .eq('document_id', event.documentId)
    .eq('event_type', event.eventType)
    .gte('created_at', new Date(Date.now() - windowMs).toISOString())
    .contains('details', match)
    .limit(1);

  if (recent?.length) return;
  await logDocumentAuditEvent(event);
}
