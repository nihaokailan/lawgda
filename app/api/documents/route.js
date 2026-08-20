import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../lib/supabase/server';

async function getCurrentUserProfile(supabase) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: 'Unauthorized', status: 401 };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('user_id,role,org_id')
    .eq('user_id', user.id)
    .single();

  if (profileError || !profile) {
    return { error: 'Profile not found.', status: 403 };
  }

  if (!profile.org_id) {
    return { error: 'No organization assigned to your account.', status: 403 };
  }

  return { user, profile };
}

export async function GET(request) {
  const supabase = createSupabaseServerClient();
  const actor = await getCurrentUserProfile(supabase);
  if (actor.error) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  const { searchParams } = new URL(request.url);
  const folderId = searchParams.get('parentId');

  let query = supabase
    .from('documents')
    .select('id,folder_id,name,mime_type,size_bytes,bucket,storage_path,created_at')
    .eq('org_id', actor.profile.org_id)
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

  return NextResponse.json({ documents: data || [] });
}

export async function POST(request) {
  const supabase = createSupabaseServerClient();
  const actor = await getCurrentUserProfile(supabase);
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

  if (!storagePath.startsWith(`${actor.profile.org_id}/`)) {
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
