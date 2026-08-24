'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../lib/supabase/server';
import { getSupabaseAdmin } from '../../lib/supabaseAdmin';

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function ensureDocumentOwner(documentId: string) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error('Unauthorized');
  }

  const { data: doc, error: docError } = await supabase
    .from('documents')
    .select('id,owner_id,user_id,case_id')
    .eq('id', documentId)
    .single();

  if (docError || !doc) {
    throw new Error('Document not found.');
  }

  const ownerId = doc.owner_id ?? doc.user_id;
  if (!ownerId || ownerId !== user.id) {
    throw new Error('Only document owners can manage signers.');
  }

  return { supabase, actorUser: user, document: doc };
}

async function resolveTargetUserId(_supabase: ReturnType<typeof createSupabaseServerClient>, input: string) {
  const value = input.trim();
  if (!value) {
    throw new Error('Target user is required.');
  }

  if (isUuid(value)) {
    return value;
  }

  const normalizedEmail = value.toLowerCase();
  const supabaseAdmin = getSupabaseAdmin();
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('user_id,email')
    .ilike('email', normalizedEmail)
    .limit(1)
    .single();

  if (error || !profile?.user_id) {
    throw new Error('User not found for that email/ID.');
  }

  return profile.user_id;
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
  const { supabase, actorUser, document } = await ensureDocumentOwner(documentId);
  const resolvedTargetUserId = await resolveTargetUserId(supabase, targetUserId);

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
  const { supabase, actorUser, document } = await ensureDocumentOwner(documentId);
  const resolvedTargetUserId = await resolveTargetUserId(supabase, targetUserId);

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
