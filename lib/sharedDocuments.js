/**
 * Documents another firm member assigned to this user (a document_permissions
 * grant, e.g. as a signer) — owned by someone else, but belonging in this
 * user's Documents list and dashboard. Documents from other organizations
 * are never returned.
 */
export async function loadDocumentsSharedWithUser(supabaseAdmin, userId, orgId) {
  const { data: grants } = await supabaseAdmin
    .from('document_permissions')
    .select('document_id')
    .eq('user_id', userId);

  const ids = [...new Set((grants || []).map((grant) => grant.document_id).filter(Boolean))];
  if (ids.length === 0) {
    return [];
  }

  const { data: documents } = await supabaseAdmin.from('documents').select('*').in('id', ids);
  return (documents || []).filter((document) => !document.org_id || document.org_id === orgId);
}

/**
 * When a signing request targets the email of an active Lawyer in the same
 * firm, grant that Lawyer access so the document shows up for them.
 */
export async function grantLawyerSignerAccess(supabaseAdmin, { documentId, orgId, signerEmail }) {
  const email = String(signerEmail ?? '').trim().toLowerCase();
  if (!email || !orgId) {
    return null;
  }

  const { data: lawyer } = await supabaseAdmin
    .from('profiles')
    .select('user_id')
    .eq('org_id', orgId)
    .eq('role', 'lawyer')
    .eq('is_active', true)
    .eq('email', email)
    .maybeSingle();

  if (!lawyer) {
    return null;
  }

  await supabaseAdmin
    .from('document_permissions')
    .upsert({ document_id: documentId, user_id: lawyer.user_id, role: 'signer' }, { onConflict: 'document_id,user_id' });

  return lawyer.user_id;
}
