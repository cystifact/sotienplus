export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

export async function POST(_request: NextRequest) {
  const res = NextResponse.json({ success: true });
  const isProduction = process.env.NODE_ENV === 'production';

  res.cookies.set('__session', '', {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });

  return res;
}
