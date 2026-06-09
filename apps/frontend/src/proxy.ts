import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';

const ROLE_PREFIX: Record<string, string> = {
  SUPER_ADMIN:       'admin',
  ADMIN:             'admin',
  CASE_MANAGER:      'cm',
  FIELD_WORKER:      'fw',
  MEDICAL_VOLUNTEER: 'medvol',
};

export async function proxy(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/setup')
  ) {
    return NextResponse.next();
  }

  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const role = (token.role as string) ?? '';
  const prefix = ROLE_PREFIX[role];
  if (!prefix) return NextResponse.redirect(new URL('/login', req.url));

  if (pathname === '/' || pathname === '/dashboard') {
    return NextResponse.redirect(new URL(`/${prefix}/dashboard`, req.url));
  }

  const otherPrefixes = Object.values(ROLE_PREFIX).filter((p) => p !== prefix);
  if (otherPrefixes.some((p) => pathname.startsWith(`/${p}/`))) {
    return NextResponse.redirect(new URL(`/${prefix}/dashboard`, req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|uploads).*)'],
};
