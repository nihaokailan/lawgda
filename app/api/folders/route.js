import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../lib/supabase/server';
import { ROLES } from '../../../lib/roles';

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
  const parentId = searchParams.get('parentId');

  let folderQuery = supabase
    .from('folders')
    .select('id,name,parent_id,created_at,documents(count)')
    .eq('org_id', actor.profile.org_id)
    .order('name', { ascending: true });

  if (parentId) {
    folderQuery = folderQuery.eq('parent_id', parentId);
  } else {
    folderQuery = folderQuery.is('parent_id', null);
  }

  const { data: folders, error: foldersError } = await folderQuery;

  if (foldersError) {
    return NextResponse.json({ error: foldersError.message }, { status: 400 });
  }

  const breadcrumbs = [{ id: null, name: 'Root' }];

  if (parentId) {
    const { data: chainData, error: chainError } = await supabase.rpc('get_folder_breadcrumbs', {
      p_folder_id: parentId,
    });

    if (!chainError && Array.isArray(chainData)) {
      chainData.forEach((item) => {
        breadcrumbs.push({ id: item.id, name: item.name });
      });
    }
  }

  return NextResponse.json({
    folders: (folders || []).map((folder) => ({
      ...folder,
      document_count: folder.documents?.[0]?.count || 0,
    })),
    breadcrumbs,
  });
}

export async function POST(request) {
  const supabase = createSupabaseServerClient();
  const actor = await getCurrentUserProfile(supabase);
  if (actor.error) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  if (![ROLES.ADMIN, ROLES.LAWYER, ROLES.STAFF].includes(actor.profile.role)) {
    return NextResponse.json({ error: 'You are not allowed to create folders.' }, { status: 403 });
  }

  const body = await request.json();
  const name = String(body?.name ?? '').trim();
  const parentId = body?.parentId ? String(body.parentId) : null;

  if (!name) {
    return NextResponse.json({ error: 'Folder name is required.' }, { status: 400 });
  }

  if (parentId) {
    const { data: parentFolder, error: parentError } = await supabase
      .from('folders')
      .select('id,org_id')
      .eq('id', parentId)
      .single();

    if (parentError || !parentFolder || parentFolder.org_id !== actor.profile.org_id) {
      return NextResponse.json({ error: 'Invalid parent folder.' }, { status: 400 });
    }
  }

  const { data, error } = await supabase
    .from('folders')
    .insert([
      {
        org_id: actor.profile.org_id,
        parent_id: parentId,
        name,
        created_by: actor.user.id,
      },
    ])
    .select('id,name,parent_id,created_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ folder: data });
}
