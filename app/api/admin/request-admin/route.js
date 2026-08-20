import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../../lib/supabase/server';

export async function POST(request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const organizationName = String(body?.organizationName ?? '').trim();
  const justification = String(body?.justification ?? '').trim();

  if (!organizationName) {
    return NextResponse.json({ error: 'Organization name is required.' }, { status: 400 });
  }

  const payload = {
    user_id: user.id,
    email: user.email ?? null,
    requested_org_name: organizationName,
    admin_request_note: justification || null,
    admin_request_status: 'pending',
    admin_requested_at: new Date().toISOString(),
  };

  const { error: updateError } = await supabase
    .from('profiles')
    .upsert(payload, { onConflict: 'user_id' });

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
