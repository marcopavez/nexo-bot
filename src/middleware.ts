import { createHmac } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

function computeSessionToken(secret: string): string {
  return createHmac('sha256', secret).update('nexo-admin-session-v1').digest('hex');
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow login page and auth endpoints through unconditionally
  if (pathname === '/admin/login' || pathname === '/api/admin/auth' || pathname === '/api/admin/logout') {
    return NextResponse.next();
  }

  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    // No secret configured — deny by default to prevent accidental data exposure.
    // Set ADMIN_SECRET in your environment variables to enable the admin panel.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Admin panel not configured' }, { status: 503 });
    }
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  const token = request.cookies.get('admin_token')?.value;
  const expectedToken = computeSessionToken(adminSecret);
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
