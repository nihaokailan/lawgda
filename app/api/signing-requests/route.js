import { NextResponse } from 'next/server';
import { generateSigningToken, hashSigningToken } from '../../../lib/signingTokens';
import { logSigningAuditEvent } from '../../../lib/signingAudit';
import { transitionDocumentStatus } from '../../../lib/documentLifecycle';
import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { ROLES } from '../../../lib/rbac';
import { loadAccessibleDocument } from '../../../lib/documentAccess';
import { requireWorkspaceMember, rbacErrorResponse } from '../../../lib/rbacMiddleware';
import { findStaffEmails, STAFF_SIGNER_MESSAGE } from '../../../lib/staffSigners';
import { sendSigningInvitationEmail } from '../../../lib/email';
import { grantLawyerSignerAccess } from '../../../lib/sharedDocuments';
import { getPublicSiteUrl } from '../../../lib/siteUrl';

function addDays(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export async function GET(request) {
  const supabaseAdmin = getSupabaseAdmin();
  let context;
  try {
    context = await requireWorkspaceMember([ROLES.LAWYER, ROLES.STAFF, ROLES.NORMAL]);
  } catch (error) {
    return rbacErrorResponse(error);
  }

  const url = new URL(request.url);
  const documentId = String(url.searchParams.get('documentId') || '').trim();
  if (!documentId) {
    return NextResponse.json({ error: 'documentId is required.' }, { status: 400 });
  }

  try {
    await loadAccessibleDocument({ user: context.user, profile: context.profile, documentId });
  } catch (error) {
    return rbacErrorResponse(error);
  }

  const { data, error } = await supabaseAdmin
    .from('signing_requests')
    .select('id,document_id,signer_name,signer_email,signing_order,status,created_at,signed_at,viewed_at,revoked_at,internal_signer_id,pre_sign_hash,post_sign_hash,signed_file_path')
    .eq('document_id', documentId)
    .order('signing_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ signingRequests: data || [] });
}

export async function POST(request) {
  const supabaseAdmin = getSupabaseAdmin();
  let user;
  let profile;
  try {
    ({ user, profile } = await requireWorkspaceMember([ROLES.LAWYER, ROLES.STAFF]));
  } catch (error) {
    return rbacErrorResponse(error);
  }

  // Resolve before anything is saved: an invitation must never link to localhost.
  let baseUrl;
  try {
    baseUrl = getPublicSiteUrl(request);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const body = await request.json();
  const documentId = String(body?.documentId ?? '').trim();
  const signerType = String(body?.signerType ?? 'external').trim();
  let signerName = String(body?.signerName ?? '').trim();
  let signerEmail = String(body?.signerEmail ?? '').trim().toLowerCase();
  const internalSignerId = body?.internalSignerId ? String(body.internalSignerId) : null;
  const signingOrder = Number(body?.signingOrder ?? 1);
  const enforceSequential = Boolean(body?.enforceSequential);
  const expiresInDays = Number(body?.expiresInDays ?? 7);

  if (!documentId || !signerName || !signerEmail || !Number.isInteger(signingOrder) || signingOrder < 1) {
    return NextResponse.json({ error: 'Invalid signing request payload.' }, { status: 400 });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signerEmail)) {
    return NextResponse.json({ error: 'Enter a valid signer email address.' }, { status: 400 });
  }

  if (signerType === 'internal' && !internalSignerId) {
    return NextResponse.json({ error: 'Internal signer ID is required for internal signers.' }, { status: 400 });
  }

  let document;
  try {
    document = await loadAccessibleDocument({ user, profile, documentId });
  } catch (error) {
    return rbacErrorResponse(error);
  }

  // A document permission lets a Lawyer sign, not issue signing requests.
  if ((document.owner_id ?? document.user_id) !== user.id) {
    return NextResponse.json({ error: 'Only the document owner can request signatures.' }, { status: 403 });
  }

  if (signerType === 'internal') {
    // Internal signers must be firm members of the requester's own organization.
    const { data: internalProfile, error: internalProfileError } = await supabaseAdmin
      .from('profiles')
      .select('full_name,email')
      .eq('user_id', internalSignerId)
      .eq('org_id', profile.org_id)
      .eq('role', ROLES.LAWYER)
      .eq('is_active', true)
      .maybeSingle();

    if (internalProfileError || !internalProfile?.email) {
      return NextResponse.json({ error: 'Internal signer profile not found.' }, { status: 400 });
    }

    signerName = internalProfile.full_name || internalProfile.email;
    signerEmail = String(internalProfile.email).toLowerCase();
  }

  // Backstop for the pre-flight check: never issue a link to a Staff account.
  const [staffMatch] = await findStaffEmails(supabaseAdmin, [signerEmail]);
  if (staffMatch) {
    return NextResponse.json({ error: `${STAFF_SIGNER_MESSAGE} (${staffMatch})`, staffEmails: [staffMatch] }, { status: 422 });
  }

  const token = generateSigningToken();
  const tokenHash = hashSigningToken(token);

  const payload = {
    document_id: documentId,
    requested_by: user.id,
    internal_signer_id: signerType === 'internal' ? internalSignerId : null,
    signer_name: signerName,
    signer_email: signerEmail,
    signing_order: signingOrder,
    enforce_sequential: enforceSequential,
    token_hash: tokenHash,
    expires_at: addDays(Math.min(Math.max(expiresInDays, 1), 30)),
    status: 'pending',
  };

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('signing_requests')
    .insert([payload])
    .select('id,token_reference,expires_at')
    .single();

  if (insertError || !inserted) {
    return NextResponse.json({ error: insertError?.message ?? 'Unable to create signing request.' }, { status: 400 });
  }

  // A Lawyer assigned as signer sees the document in their own list and dashboard.
  await grantLawyerSignerAccess(supabaseAdmin, { documentId, orgId: profile.org_id, signerEmail });

  const signingLink = `${baseUrl}/sign/${encodeURIComponent(token)}`;

  const { data: earlierRequests } = await supabaseAdmin
    .from('signing_requests')
    .select('id')
    .eq('document_id', documentId)
    .lt('signing_order', signingOrder)
    .in('status', ['pending', 'viewed'])
    .limit(1);
  const invitationDeferred = enforceSequential && (earlierRequests ?? []).length > 0;

  await logSigningAuditEvent({
    signingRequestId: inserted.id,
    documentId,
    eventType: 'request_created',
    actorType: 'internal_user',
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    details: {
      signer_type: signerType,
      signer_name: signerName,
      signer_email: signerEmail,
      signing_order: signingOrder,
      enforce_sequential: enforceSequential,
      token_reference: inserted.token_reference,
      expires_at: inserted.expires_at,
    },
  });

  const emailResult = invitationDeferred
    ? { ok: true, reason: 'Invitation will be sent when the previous signer completes.' }
    : await sendSigningInvitationEmail({
      to: signerEmail,
      signerName,
      documentName: document.filename || document.title || 'Document',
      signingLink,
    });

  await logSigningAuditEvent({
    signingRequestId: inserted.id,
    documentId,
    eventType: 'invitation_sent',
    actorType: 'internal_user',
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    details: {
      signer_email: signerEmail,
      signing_link: signingLink,
      email_status: invitationDeferred ? 'deferred' : emailResult.ok ? 'sent' : 'failed',
      email_message: emailResult.reason ?? 'sent',
    },
  });

  const { data: existingDoc } = await supabaseAdmin
    .from('documents')
    .select('document_history')
    .eq('id', documentId)
    .single();

  const history = Array.isArray(existingDoc?.document_history) ? existingDoc.document_history : [];
  history.push({
    event: 'signing_request_created',
    at: new Date().toISOString(),
    by: user.id,
    signer_email: signerEmail,
    signing_order: signingOrder,
  });

  await supabaseAdmin
    .from('documents')
    .update({ document_history: history })
    .eq('id', documentId);

  await transitionDocumentStatus({
    documentId,
    toStatus: 'Pending',
    actorUserId: user.id,
    reason: 'signing_request_sent',
    extraDetails: { signer_email: signerEmail },
  });

  return NextResponse.json({
    success: true,
    emailSent: emailResult.ok,
    emailError: emailResult.ok ? null : emailResult.reason,
    invitationDeferred,
    signingRequest: inserted,
    signingLink,
  });
}
