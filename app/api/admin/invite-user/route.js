import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import { ROLES } from '../../../../lib/roles';
import { createSupabaseServerClient } from '../../../../lib/supabase/server';

const ALLOWED_ROLES = [ROLES.LAWYER, ROLES.STAFF];

function buildTemporaryPassword() {
  return `Lawgda!${Math.random().toString(36).slice(2)}${Date.now().toString(36).slice(-4)}`;
}

export async function POST(request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role,org_id')
    .eq('user_id', user.id)
    .single();

  if (profileError || profile?.role !== ROLES.ADMIN) {
    return NextResponse.json({ error: 'Only admins can provision users.' }, { status: 403 });
  }

  if (!profile.org_id) {
    return NextResponse.json({ error: 'Admin account is missing an organization assignment.' }, { status: 400 });
  }

  const body = await request.json();
  const email = String(body?.email ?? '').trim().toLowerCase();
  const fullName = String(body?.fullName ?? '').trim();
  const role = String(body?.role ?? '').trim();

  if (!email || !ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Email and role (lawyer or staff) are required.' }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const temporaryPassword = buildTemporaryPassword();

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    data: {
      full_name: fullName,
      invited_by: user.id,
      org_id: profile.org_id,
    },
  });

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 400 });
  }

  const invitedUserId = created?.user?.id ?? null;

  if (invitedUserId) {
    const { error: profileUpsertError } = await supabaseAdmin.from('profiles').upsert(
      {
        user_id: invitedUserId,
        email,
        full_name: fullName || null,
        role,
        org_id: profile.org_id,
        admin_request_status: 'none',
      },
      { onConflict: 'user_id' }
    );

    if (profileUpsertError) {
      return NextResponse.json({ error: profileUpsertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    success: true,
    temporaryPassword,
    message: 'User provisioned. Share the temporary password securely and ask them to change it on first login.',
  });
}
