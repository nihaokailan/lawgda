/**
 * Documents owned by someone else that belong in this user's Documents list
 * and dashboard: a document_permissions grant, or a signing request sent to
 * their email. Documents of another firm are never returned to a firm member;
 * a user without a firm sees any document they are asked to sign.
 */
export async function loadDocumentsSharedWithUser(supabaseAdmin, userId, orgId, email = null, role = null) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const canSign = role === 'lawyer' || role === 'normal';
  const [{ data: grants }, { data: signingRows }] = await Promise.all([
    supabaseAdmin.from('document_permissions').select('document_id').eq('user_id', userId),
    normalizedEmail && canSign
      ? supabaseAdmin.from('signing_requests').select('document_id').eq('signer_email', normalizedEmail).neq('status', 'revoked')
      : Promise.resolve({ data: [] }),
  ]);

  const grantIds = new Set((grants || []).map((grant) => grant.document_id).filter(Boolean));
  const signerIds = new Set((signingRows || []).map((row) => row.document_id).filter(Boolean));
  const ids = [...new Set([...grantIds, ...signerIds])];
  if (ids.length === 0) {
    return [];
  }

  const { data: documents } = await supabaseAdmin.from('documents').select('*').in('id', ids);
  return (documents || []).filter((document) => !document.org_id
    || document.org_id === orgId
    || (!orgId && signerIds.has(document.id)));
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
