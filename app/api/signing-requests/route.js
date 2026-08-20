import { NextResponse } from 'next/server';
import { ROLES } from '../../../lib/roles';
import { generateSigningToken, hashSigningToken } from '../../../lib/signingTokens';
import { logSigningAuditEvent } from '../../../lib/signingAudit';
import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { createSupabaseServerClient } from '../../../lib/supabase/server';

function addDays(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export async function GET(request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const documentId = String(url.searchParams.get('documentId') || '').trim();
  if (!documentId) {
    return NextResponse.json({ error: 'documentId is required.' }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  const { data: document, error: docError } = await supabase
    .from('documents')
    .select('id,user_id')
    .eq('id', documentId)
    .single();

  if (docError || !document) {
    return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  }

  const isPrivileged = profile && [ROLES.ADMINISTRATOR, ROLES.LAWYER].includes(profile.role);
  if (!isPrivileged && document.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('signing_requests')
    .select('id,document_id,signer_name,signer_email,signing_order,status,created_at,signed_at,viewed_at,revoked_at,internal_signer_id')
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
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('role,full_name')
    .eq('user_id', user.id)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Missing user profile.' }, { status: 403 });
  }

  if (![ROLES.ADMINISTRATOR, ROLES.LAWYER, ROLES.STAFF].includes(profile.role)) {
    return NextResponse.json({ error: 'Only Admin, Lawyer, or Staff can create signing requests.' }, { status: 403 });
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

  if (signerType === 'internal' && !internalSignerId) {
    return NextResponse.json({ error: 'Internal signer ID is required for internal signers.' }, { status: 400 });
  }

  if (signerType === 'internal') {
    const { data: internalProfile, error: internalProfileError } = await supabase
      .from('user_profiles')
      .select('full_name,email')
      .eq('user_id', internalSignerId)
      .single();

    if (internalProfileError || !internalProfile?.email) {
      return NextResponse.json({ error: 'Internal signer profile not found.' }, { status: 400 });
    }

    signerName = internalProfile.full_name || internalProfile.email;
    signerEmail = String(internalProfile.email).toLowerCase();
  }

  const { data: document, error: documentError } = await supabase
    .from('documents')
    .select('id,user_id,filename,sha256_hash,path,bucket')
    .eq('id', documentId)
    .single();

  if (documentError || !document) {
    return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  }

  if (profile.role !== ROLES.ADMINISTRATOR && document.user_id !== user.id) {
    return NextResponse.json({ error: 'You are not allowed to create signing requests for this document.' }, { status: 403 });
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

  const { data: inserted, error: insertError } = await supabase
    .from('signing_requests')
    .insert([payload])
    .select('id,token_reference,expires_at')
    .single();

  if (insertError || !inserted) {
    return NextResponse.json({ error: insertError?.message ?? 'Unable to create signing request.' }, { status: 400 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const signingLink = `${baseUrl}/sign/${encodeURIComponent(token)}`;

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

  return NextResponse.json({
    success: true,
    signingRequest: inserted,
    signingLink,
  });
}
