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
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (!profile || ![ROLES.ADMINISTRATOR, ROLES.LAWYER].includes(profile.role)) {
    return NextResponse.json({ error: 'Only Admin or Lawyer can resend signing requests.' }, { status: 403 });
  }

  const { data: signingRequest, error: requestError } = await supabase
    .from('signing_requests')
    .select('id,document_id,status,signer_email,requested_by')
    .eq('id', requestId)
    .single();

  if (requestError || !signingRequest) {
    return NextResponse.json({ error: 'Signing request not found.' }, { status: 404 });
  }

  if (profile.role !== ROLES.ADMINISTRATOR && signingRequest.requested_by !== user.id) {
    return NextResponse.json({ error: 'Only the request owner or admin can resend this request.' }, { status: 403 });
  }

  if (['signed', 'revoked', 'expired'].includes(signingRequest.status)) {
    return NextResponse.json({ error: 'Cannot resend a completed, revoked, or expired request.' }, { status: 400 });
  }

  await logSigningAuditEvent({
    signingRequestId: signingRequest.id,
    documentId: signingRequest.document_id,
    eventType: 'invitation_sent',
    actorType: 'internal_user',
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    details: {
      signer_email: signingRequest.signer_email,
      resend: true,
    },
  });

  return NextResponse.json({ success: true });
}
