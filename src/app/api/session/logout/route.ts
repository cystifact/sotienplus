export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  const res = NextResponse.json({ success: true });

  // Clear the session cookie
  res.cookies.set('__session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });

  // Revoke refresh tokens to invalidate all sessions for this user
  try {
    const cookieHeader = (request.headers.get('cookie') || '').toString();
    const sessionCookie = cookieHeader
      .split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith('__session='))
      ?.split('=')[1];

    if (sessionCookie) {
      const adminAuth = getAdminAuth();
      const decoded = await adminAuth.verifySessionCookie(sessionCookie);
      await adminAuth.revokeRefreshTokens(decoded.uid);
    }
  } catch (_error) {
    // If session verification fails, the cookie is already invalid -- just clear it
  }

  return res;
}
