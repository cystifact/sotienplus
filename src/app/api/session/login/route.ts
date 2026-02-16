export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import '@/lib/firebase-admin';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';

const SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export async function POST(request: NextRequest) {
  try {
    const { idToken } = await request.json();
    if (!idToken) {
      return NextResponse.json({ error: 'Missing idToken' }, { status: 400 });
    }

    const expiresIn = SESSION_MAX_AGE_MS;
    const adminAuth = getAdminAuth();
    const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn });

    const res = NextResponse.json({ success: true });

    res.cookies.set('__session', sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: Math.floor(expiresIn / 1000),
      path: '/',
    });

    return res;
  } catch (error: any) {
    console.error('[SessionLogin] Error:', error?.message);
    return NextResponse.json(
      { error: 'Đăng nhập thất bại' },
      { status: 500 }
    );
  }
}
