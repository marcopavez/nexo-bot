import { createHmac } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Derives an opaque session token from the admin secret.
 * The raw secret never leaves the server — the cookie holds only this HMAC digest.
 * Rotating ADMIN_SECRET automatically invalidates all sessions.
 */
function computeSessionToken(secret: string): string {
  return createHmac('sha256', secret).update('nexo-admin-session-v1').digest('hex');
}

export async function POST(request: NextRequest) {
  const { secret } = (await request.json()) as { secret: string };
  const adminSecret = process.env.ADMIN_SECRET;

  if (!adminSecret || secret !== adminSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set('admin_token', computeSessionToken(adminSecret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  });

  return response;
}
