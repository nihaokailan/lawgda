// This runs on the server with an admin client because the legacy documents
// and document_permissions RLS policies reference each other recursively.
// Every query must be scoped to the authenticated user before returning rows.
export async function listVerificationDocuments(admin, userId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId || '')) {
    throw new Error('A valid authenticated user is required.');
  }
  const { data: permissions, error: permissionError } = await admin
    .from('document_permissions').select('document_id').eq('user_id', userId);
  if (permissionError) throw new Error('Unable to check document permissions.');

  const fields = 'id,title,filename,sha256_hash,metadata,status,created_at';
  const { data: owned, error: ownedError } = await admin.from('documents')
    .select(fields)
    .or(`owner_id.eq.${userId},and(owner_id.is.null,user_id.eq.${userId}),uploaded_by.eq.${userId}`)
    .order('created_at', { ascending: false });
  if (ownedError) throw new Error('Unable to load your documents.');

  const documents = new Map((owned || []).map(document => [document.id, document]));
  const ids = [...new Set((permissions || []).map(permission => permission.document_id))];
  // Keep the URL bounded for accounts with many shared documents.
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data: shared, error: sharedError } = await admin.from('documents')
      .select(fields).in('id', ids.slice(offset, offset + 100));
    if (sharedError) throw new Error('Unable to load shared documents.');
    for (const document of shared || []) documents.set(document.id, document);
  }
  return [...documents.values()].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
}
