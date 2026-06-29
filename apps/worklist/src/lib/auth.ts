import type { AuthConfig } from '@midcine/auth';

export const authConfig: AuthConfig = {
  issuer: process.env.NEXT_PUBLIC_ZITADEL_ISSUER ?? 'http://localhost:8080',
  clientId: process.env.NEXT_PUBLIC_ZITADEL_CLIENT_ID ?? 'midcine-worklist',
  redirectUri:
    typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '',
  scopes: ['openid', 'profile', 'email', 'urn:midcine:tenant', 'urn:midcine:role'],
  cookieDomain: process.env.NEXT_PUBLIC_APP_DOMAIN
    ? `.${process.env.NEXT_PUBLIC_APP_DOMAIN}`
    : undefined,
};
