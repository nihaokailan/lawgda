import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../../lib/supabase/server';

export async function POST(request) {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  const redirectUrl = new URL('/signin', request.url);
  return NextResponse.redirect(redirectUrl);
}
