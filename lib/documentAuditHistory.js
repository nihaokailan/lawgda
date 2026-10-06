import { verifyAuditLogsChain, verifySigningAuditChain } from './auditChainVerify';

// Read every page: verifying a truncated history could hide a broken tail.
async function readAuditTable(supabase, table, documentId) {
  const rows = [];
  const pageSize = 500;
  const fields = 'id,document_id,event_type,created_at,created_at_text:created_at::text,actor_user_id,details,details_text:details::text,previous_hash,record_hash'
    + (table === 'signing_audit_events' ? ',signing_request_id,actor_type,actor_email' : '');
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from(table).select(fields)
      .eq('document_id', documentId)
      .order('created_at', { ascending: true }).order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error || !data) throw new Error('Unable to load complete audit history.');
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}

export async function loadDocumentAuditHistory(supabase, documentId) {
  const [documentRows, signingRows] = await Promise.all([
    readAuditTable(supabase, 'audit_logs', documentId),
    readAuditTable(supabase, 'signing_audit_events', documentId),
  ]);
  const documentChain = verifyAuditLogsChain(documentRows);
  const signingChain = verifySigningAuditChain(signingRows);
  const events = [...documentRows, ...signingRows].sort((a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime() || a.id.localeCompare(b.id));
  const valid = documentChain.valid === false || signingChain.valid === false ? false
    : !events.length || documentChain.valid === null || signingChain.valid === null ? null : true;
  return { events, valid, documentChain, signingChain };
}
