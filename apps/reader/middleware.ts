import type { NextRequest } from 'next/server';
import { authMiddleware } from '@midcine/auth/middleware';
import { authConfig } from './src/lib/auth';

export function middleware(request: NextRequest) {
  return authMiddleware(request, {
    authConfig,
    publicPaths: ['/login', '/api/health', '/_next', '/favicon.ico'],
    allowedRoles: ['radiologist', 'tenant_admin', 'super_admin'],
  });
}

export const config = {
  matcher: ['/((?!api/health|_next/static|_next/image|favicon.ico).*)'],
};
