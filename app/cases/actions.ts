'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../lib/supabase/server';
import { getSupabaseAdmin } from '../../lib/supabaseAdmin';
import { ROLES } from '../../lib/rbac';
import { requireWorkspaceMember } from '../../lib/rbacMiddleware';
import { loadAccessibleDocument } from '../../lib/documentAccess';

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function ensureDocumentOwner(documentId: string) {
  const supabase = createSupabaseServerClient();
  const { user, profile } = await requireWorkspaceMember([ROLES.LAWYER, ROLES.STAFF]);

  const doc = await loadAccessibleDocument({ user, profile, documentId });
  const ownerId = doc.owner_id ?? doc.user_id;
  if (!ownerId || ownerId !== user.id) {
    throw new Error('Only document owners can manage signers.');
  }

  return { supabase, actorUser: user, actorProfile: profile, document: doc };
}

// Grants may only target active Lawyers/Staff of the actor's own organization,
// so permissions can never leak a document across firms or to an Admin.
async function resolveTargetUserId(actorOrgId: string, input: string) {
  const value = input.trim();
  if (!value) {
    throw new Error('Target user is required.');
  }

  const supabaseAdmin = getSupabaseAdmin();
  let query = supabaseAdmin
    .from('profiles')
    .select('user_id')
    .eq('org_id', actorOrgId)
    .in('role', [ROLES.LAWYER, ROLES.STAFF])
    .eq('is_active', true);

  query = isUuid(value) ? query.eq('user_id', value) : query.ilike('email', value.toLowerCase());
  const { data: profile } = await query.limit(1).maybeSingle();

  if (!profile?.user_id) {
    throw new Error('User not found in your organization.');
  }

  return profile.user_id as string;
}

async function writeAuditLog(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  payload: {
    documentId: string;
    actorUserId: string;
    eventType: string;
    details: Record<string, unknown>;
  }
) {
  await supabase.from('audit_logs').insert({
    document_id: payload.documentId,
    actor_user_id: payload.actorUserId,
    event_type: payload.eventType,
    details: payload.details,
  });
}

export async function addSigner(documentId: string, targetUserId: string) {
  const { supabase, actorUser, actorProfile, document } = await ensureDocumentOwner(documentId);
  const resolvedTargetUserId = await resolveTargetUserId(actorProfile.org_id, targetUserId);

  const { error } = await supabase
    .from('document_permissions')
    .upsert(
      {
        document_id: documentId,
        user_id: resolvedTargetUserId,
        role: 'signer',
      },
      { onConflict: 'document_id,user_id' }
    );

  if (error) {
    throw new Error(error.message);
  }

  await writeAuditLog(supabase, {
    documentId,
    actorUserId: actorUser.id,
    eventType: 'signer_added',
    details: {
      action: 'signer_added',
      target_user_id: resolvedTargetUserId,
      role: 'signer',
    },
  });

  revalidatePath(`/cases/${document.case_id}`);
  return { ok: true, targetUserId: resolvedTargetUserId };
}

export async function removeSigner(documentId: string, targetUserId: string) {
  const { supabase, actorUser, actorProfile, document } = await ensureDocumentOwner(documentId);
  const resolvedTargetUserId = await resolveTargetUserId(actorProfile.org_id, targetUserId);

  const { error } = await supabase
    .from('document_permissions')
    .delete()
    .eq('document_id', documentId)
    .eq('user_id', resolvedTargetUserId)
    .neq('role', 'owner');

  if (error) {
    throw new Error(error.message);
  }

  await writeAuditLog(supabase, {
    documentId,
    actorUserId: actorUser.id,
    eventType: 'signer_removed',
    details: {
      action: 'signer_removed',
      target_user_id: resolvedTargetUserId,
    },
  });

  revalidatePath(`/cases/${document.case_id}`);
  return { ok: true, targetUserId: resolvedTargetUserId };
}
