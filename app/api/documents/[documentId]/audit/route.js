import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../../../lib/supabase/server';

export async function GET(_request, { params }) {
  const documentId = String(params?.documentId || '').trim();
  if (!documentId) {
    return NextResponse.json({ error: 'Document ID is required.' }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: document, error: docError } = await supabase
    .from('documents')
    .select('id,user_id,owner_id')
    .eq('id', documentId)
    .single();

  if (docError || !document) {
    return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  }

  const ownerId = document.owner_id ?? document.user_id;
  let allowed = ownerId === user.id;

  if (!allowed) {
    const { data: permission } = await supabase
      .from('document_permissions')
      .select('id')
      .eq('document_id', documentId)
      .eq('user_id', user.id)
      .maybeSingle();

    allowed = Boolean(permission);
  }

  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const [signingAuditResult, auditResult] = await Promise.all([
    supabase
      .from('signing_audit_events')
      .select('id,event_type,created_at,actor_user_id,details')
      .eq('document_id', documentId)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('audit_logs')
      .select('id,event_type,created_at,actor_user_id,details')
      .eq('document_id', documentId)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const auditTrail = [
    ...(signingAuditResult.data || []),
    ...(auditResult.data || []),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return NextResponse.json({ auditTrail });
}
