import { createMiddlewareSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';

export async function middleware(req) {
  const res = NextResponse.next();
  const supabase = createMiddlewareSupabaseClient({ req, res });
  const { data: { session } } = await supabase.auth.getSession();
  const token = req.nextUrl.pathname;
  const protectedRoutes = ['/dashboard', '/cases', '/upload'];

  if (protectedRoutes.some((route) => token.startsWith(route))) {
    if (!session) {
      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = '/signin';
      redirectUrl.searchParams.set('from', token);
      return NextResponse.redirect(redirectUrl);
    }
  }

  return res;
}

export const config = {
  matcher: ['/dashboard', '/cases', '/upload'],
};
