import { NextResponse } from 'next/server';
import { ROLES } from '../../../../../lib/rbac';
import { requireWorkspaceMember, rbacErrorResponse } from '../../../../../lib/rbacMiddleware';
import { getSupabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { logSigningAuditEvent } from '../../../../../lib/signingAudit';

export async function POST(_request, { params }) {
  const requestId = params?.requestId;
  const supabase = getSupabaseAdmin();

  let user;
  let profile;
  try {
    ({ user, profile } = await requireWorkspaceMember([ROLES.ADMIN, ROLES.LAWYER]));
  } catch (error) {
    return rbacErrorResponse(error);
  }

  const { data: signingRequest, error: requestError } = await supabase
    .from('signing_requests')
    .select('id,document_id,status,signer_email,requested_by')
    .eq('id', requestId)
    .single();

  if (requestError || !signingRequest) {
    return NextResponse.json({ error: 'Signing request not found.' }, { status: 404 });
  }

  // Organization isolation: the request's document must belong to the caller's firm.
  const { data: requestDocument } = await supabase
    .from('documents')
    .select('org_id')
    .eq('id', signingRequest.document_id)
    .maybeSingle();
  const crossOrg = profile.role === ROLES.ADMIN
    ? requestDocument?.org_id !== profile.org_id
    : Boolean(requestDocument?.org_id) && requestDocument.org_id !== profile.org_id;
  if (crossOrg) {
    return NextResponse.json({ error: 'Signing request not found.' }, { status: 404 });
  }

  if (profile.role !== ROLES.ADMIN && signingRequest.requested_by !== user.id) {
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
