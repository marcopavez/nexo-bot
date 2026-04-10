import { NextRequest, NextResponse } from 'next/server';

async function computeSessionToken(secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode('nexo-admin-session-v1')
  );
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow login page and auth endpoints through unconditionally
  if (pathname === '/admin/login' || pathname === '/api/admin/auth' || pathname === '/api/admin/logout') {
    return NextResponse.next();
  }

  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Admin panel not configured' }, { status: 503 });
    }
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  const token = request.cookies.get('admin_token')?.value;
  const expectedToken = await computeSessionToken(adminSecret);
  if (token !== expectedToken) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = new URL('/admin/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
