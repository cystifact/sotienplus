import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get('__session')?.value;
  const { pathname } = request.nextUrl;

  // Public routes - no auth required
  if (pathname === '/login' || pathname.startsWith('/api/')) {
    // If already has session cookie and on login page → redirect to ledger
    if (pathname === '/login' && sessionCookie) {
      return NextResponse.redirect(new URL('/ledger', request.url));
    }
    return NextResponse.next();
  }

  // Protected routes - require session cookie
  if (!sessionCookie) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Home page → redirect to ledger (server-side, no client JS needed)
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/ledger', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon, icons, manifest, service worker
     */
    '/((?!_next/static|_next/image|favicon|icon-|apple-touch|manifest|sw\\.js|workbox).*)',
  ],
};
