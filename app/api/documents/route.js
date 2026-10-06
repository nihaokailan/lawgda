import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../lib/supabase/server';
import { listUserStorageFiles } from '../../../lib/listUserStorageFiles';
import { ROLES } from '../../../lib/rbac';
import { requireWorkspaceMember } from '../../../lib/rbacMiddleware';

// Admins never read document data; Default Admin is not a firm member.
async function getCurrentUserProfile(roles) {
  try {
    const { user, profile } = await requireWorkspaceMember(roles);
    return { user, profile };
  } catch (error) {
    return { error: error.message, status: error.status ?? 500 };
  }
}

async function ensureStorageBackfillForUser(supabase, userId) {
  const storageBuckets = ['secure_docs', 'evidence', 'org-documents'];

  for (const bucket of storageBuckets) {
    const storageItems = await listUserStorageFiles(supabase, bucket, userId);
    for (const item of storageItems ?? []) {
      if (!item.name || item.name.endsWith('/')) continue;

      const path = item.path;
      const title = path.split('/').pop() || path;
      const ownerHint = path.split('/')[0];
      const ownerId = /^\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b$/i.test(ownerHint)
        ? ownerHint
        : userId;

      const { data: existingRows } = await supabase
        .from('documents')
        .select('id')
        .eq('path', path)
        .limit(1);

      if ((existingRows ?? []).length > 0) continue;

      const candidates = [
        {
          owner_id: ownerId,
          user_id: ownerId,
          uploaded_by: ownerId,
          bucket,
          path,
          file_path: path,
          title,
          status: 'Drafting',
          created_at: item.updated_at ?? item.created_at ?? new Date().toISOString(),
        },
        {
          owner_id: ownerId,
          user_id: ownerId,
          uploaded_by: ownerId,
          bucket,
          path,
          file_path: path,
          title,
          status: 'Drafting',
          created_at: item.updated_at ?? item.created_at ?? new Date().toISOString(),
        },
      ];

      for (const candidate of candidates) {
        const { error } = await supabase.from('documents').insert([candidate]);
        if (!error) break;
      }
    }
  }
}

export async function GET(request) {
  const supabase = createSupabaseServerClient();
  const actor = await getCurrentUserProfile([ROLES.LAWYER, ROLES.STAFF, ROLES.NORMAL]);
  if (actor.error) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  await ensureStorageBackfillForUser(supabase, actor.user.id);

  const { searchParams } = new URL(request.url);
  const folderId = searchParams.get('parentId');

  let query = supabase
    .from('documents')
    .select('id,owner_id,user_id,uploaded_by,title,path,file_path,bucket,status,created_at')
    .or(`owner_id.eq.${actor.user.id},user_id.eq.${actor.user.id},uploaded_by.eq.${actor.user.id}`)
    .order('created_at', { ascending: false });

  if (folderId) {
    query = query.eq('folder_id', folderId);
  } else {
    query = query.is('folder_id', null);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const storageBuckets = ['secure_docs', 'evidence', 'org-documents'];
  const storageFallbacks = [];

  for (const bucket of storageBuckets) {
    const storageItems = await listUserStorageFiles(supabase, bucket, actor.user.id);
    (storageItems ?? []).forEach((item) => {
      if (!item.name || item.name.endsWith('/')) {
        return;
      }

      storageFallbacks.push({
        id: `${bucket}:${item.path}`,
        title: item.name.split('/').pop() || item.name,
        bucket,
        path: item.path,
        file_path: item.path,
        status: 'Drafting',
        created_at: item.updated_at ?? item.created_at ?? new Date().toISOString(),
        owner_id: actor.user.id,
        user_id: actor.user.id,
        uploaded_by: actor.user.id,
      });
    });
  }

  const dedupedDocuments = [...(data || []), ...storageFallbacks].filter((record, index, list) => {
    const key = String(record.id ?? `${record.bucket ?? 'storage'}:${record.storage_path ?? record.path ?? record.name ?? ''}`);
    return key && list.findIndex((item) => {
      const otherKey = String(item.id ?? `${item.bucket ?? 'storage'}:${item.storage_path ?? item.path ?? item.name ?? ''}`);
      return otherKey === key;
    }) === index;
  });

  return NextResponse.json({ documents: dedupedDocuments });
}

export async function POST(request) {
  const supabase = createSupabaseServerClient();
  const actor = await getCurrentUserProfile([ROLES.LAWYER, ROLES.STAFF]);
  if (actor.error) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  const body = await request.json();
  const folderId = body?.folderId ? String(body.folderId) : null;
  const name = String(body?.name ?? '').trim();
  const bucket = String(body?.bucket ?? '').trim();
  const storagePath = String(body?.storagePath ?? '').trim();
  const mimeType = String(body?.mimeType ?? 'application/octet-stream');
  const sizeBytes = Number(body?.sizeBytes ?? 0);

  if (!name || !bucket || !storagePath) {
    return NextResponse.json({ error: 'Missing required document fields.' }, { status: 400 });
  }

  if (actor.profile.org_id && !storagePath.startsWith(`${actor.profile.org_id}/`)) {
    return NextResponse.json({ error: 'Storage path does not match your organization scope.' }, { status: 403 });
  }

  if (folderId) {
    const { data: folder, error: folderError } = await supabase
      .from('folders')
      .select('id,org_id')
      .eq('id', folderId)
      .single();

    if (folderError || !folder || folder.org_id !== actor.profile.org_id) {
      return NextResponse.json({ error: 'Invalid target folder.' }, { status: 400 });
    }
  }

  const { data, error } = await supabase
    .from('documents')
    .insert([
      {
        org_id: actor.profile.org_id,
        folder_id: folderId,
        name,
        mime_type: mimeType,
        size_bytes: Math.max(0, Math.floor(sizeBytes)),
        bucket,
        storage_path: storagePath,
        uploaded_by: actor.user.id,
      },
    ])
    .select('id,folder_id,name,mime_type,size_bytes,bucket,storage_path,created_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ document: data });
}
