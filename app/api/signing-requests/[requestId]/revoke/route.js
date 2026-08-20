import { NextResponse } from 'next/server';
import { ROLES } from '../../../../../lib/roles';
import { logSigningAuditEvent } from '../../../../../lib/signingAudit';
import { createSupabaseServerClient } from '../../../../../lib/supabase/server';

export async function POST(_request, { params }) {
  const requestId = params?.requestId;
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (!profile || ![ROLES.ADMINISTRATOR, ROLES.LAWYER].includes(profile.role)) {
    return NextResponse.json({ error: 'Only Admin or Lawyer can revoke signing requests.' }, { status: 403 });
  }

  const { data: signingRequest, error: requestError } = await supabase
    .from('signing_requests')
    .select('id,document_id,requested_by,status')
    .eq('id', requestId)
    .single();

  if (requestError || !signingRequest) {
    return NextResponse.json({ error: 'Signing request not found.' }, { status: 404 });
  }

  if (profile.role !== ROLES.ADMINISTRATOR && signingRequest.requested_by !== user.id) {
    return NextResponse.json({ error: 'Only the request owner or admin can revoke this request.' }, { status: 403 });
  }

  if (signingRequest.status === 'signed') {
    return NextResponse.json({ error: 'Signed requests cannot be revoked.' }, { status: 400 });
  }

  const { error: revokeError } = await supabase
    .from('signing_requests')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('id', requestId);

  if (revokeError) {
    return NextResponse.json({ error: revokeError.message }, { status: 400 });
  }

  await logSigningAuditEvent({
    signingRequestId: requestId,
    documentId: signingRequest.document_id,
    eventType: 'request_revoked',
    actorType: 'internal_user',
    actorUserId: user.id,
    actorEmail: user.email ?? null,
  });

  return NextResponse.json({ success: true });
}
