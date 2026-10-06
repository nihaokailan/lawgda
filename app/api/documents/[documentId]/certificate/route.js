import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { loadAccessibleDocument } from '../../../../../lib/documentAccess';
import { ROLES } from '../../../../../lib/rbac';
import { requireWorkspaceMember, rbacErrorResponse } from '../../../../../lib/rbacMiddleware';

export async function POST(request, { params }) {
  const documentId = String(params?.documentId || '').trim();
  if (!documentId) {
    return NextResponse.json({ error: 'Document ID is required.' }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  let user;
  let document;
  try {
    // Certificate workflow is a Lawyer action; no admin tier may reach it.
    const context = await requireWorkspaceMember([ROLES.LAWYER]);
    ({ user } = context);
    document = await loadAccessibleDocument({ user, profile: context.profile, documentId });
  } catch (error) {
    return rbacErrorResponse(error);
  }

  const ownerId = document.owner_id ?? document.user_id;
  if (!ownerId || ownerId !== user.id) {
    return NextResponse.json({ error: 'Only the owner can apply certificate.' }, { status: 403 });
  }

  const body = await request.json();
  const certificatePath = String(body?.certificatePath || '').trim();
  const certificateHash = String(body?.certificateHash || '').trim();

  if (!certificatePath) {
    return NextResponse.json({ error: 'certificatePath is required.' }, { status: 400 });
  }

  const metadata = document.metadata && typeof document.metadata === 'object' ? document.metadata : {};
  const history = Array.isArray(document.document_history) ? document.document_history : [];
  const nowIso = new Date().toISOString();

  const nextMetadata = {
    ...metadata,
    dict_certificate: {
      path: certificatePath,
      sha256_hash: certificateHash || null,
      applied_at: nowIso,
      applied_by: user.id,
    },
  };

  const nextHistory = [
    ...history,
    {
      event: 'dict_certificate_applied',
      at: nowIso,
      by: user.id,
      certificate_path: certificatePath,
      certificate_hash: certificateHash || null,
    },
  ];

  const { error: updateError } = await supabaseAdmin
    .from('documents')
    .update({
      metadata: nextMetadata,
      document_history: nextHistory,
    })
    .eq('id', documentId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  await supabaseAdmin.from('audit_logs').insert({
    document_id: documentId,
    actor_user_id: user.id,
    event_type: 'dict_certificate_applied',
    details: {
      certificate_path: certificatePath,
      certificate_hash: certificateHash || null,
    },
  });

  return NextResponse.json({ success: true });
}
