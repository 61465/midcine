import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { verifySessionToken } from './server';
import type { AuthConfig, Role } from './types';

interface MiddlewareOptions {
  authConfig: AuthConfig;
  publicPaths?: string[];
  allowedRoles?: Role[];
  loginPath?: string;
}

export async function authMiddleware(
  request: NextRequest,
  opts: MiddlewareOptions,
): Promise<NextResponse> {
  const { authConfig, publicPaths = [], allowedRoles, loginPath = '/login' } = opts;
  const { pathname } = request.nextUrl;

  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get('midcine_session')?.value;
  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = loginPath;
    url.searchParams.set('return_to', pathname);
    return NextResponse.redirect(url);
  }

  try {
    const session = await verifySessionToken(token, authConfig);

    if (allowedRoles && !allowedRoles.includes(session.role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const response = NextResponse.next();
    response.headers.set('x-midcine-user-id', session.userId);
    response.headers.set('x-midcine-tenant-id', session.tenantId);
    response.headers.set('x-midcine-role', session.role);
    return response;
  } catch {
    const url = request.nextUrl.clone();
    url.pathname = loginPath;
    return NextResponse.redirect(url);
  }
}
