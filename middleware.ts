import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from './lib/supabase/middleware';

const protectedRoutes = ['/dashboard', '/cases', '/upload', '/profile', '/admin'];
const authRoutes = ['/signin', '/login'];

function startsWithAny(pathname: string, routes: string[]) {
  return routes.some((route) => pathname.startsWith(route));
}

export async function middleware(request: NextRequest) {
  const { supabase, response } = updateSession(request as unknown as Parameters<typeof updateSession>[0]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isProtected = startsWithAny(pathname, protectedRoutes);
  const isAuthRoute = startsWithAny(pathname, authRoutes);

  if (isProtected && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (isAuthRoute && user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/dashboard';
    redirectUrl.searchParams.delete('from');
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: ['/dashboard/:path*', '/cases/:path*', '/upload/:path*', '/profile/:path*', '/admin/:path*', '/signin', '/login'],
};
