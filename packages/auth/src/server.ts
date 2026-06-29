import { jwtVerify, createRemoteJWKSet } from 'jose';
import { UserSessionSchema, type UserSession, type AuthConfig } from './types';

let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

export function getJwks(config: AuthConfig) {
  if (!_jwks) {
    _jwks = createRemoteJWKSet(new URL(`${config.issuer}/oauth/v2/keys`));
  }
  return _jwks;
}

export async function verifySessionToken(
  token: string,
  config: AuthConfig,
): Promise<UserSession> {
  const { payload } = await jwtVerify(token, getJwks(config), {
    issuer: config.issuer,
    audience: config.clientId,
  });

  return UserSessionSchema.parse({
    userId: payload.sub,
    tenantId: payload['urn:midcine:tenant'],
    email: payload.email,
    displayName: payload.name ?? payload.preferred_username,
    role: payload['urn:midcine:role'],
    permissions: payload['urn:midcine:permissions'] ?? [],
    expiresAt: payload.exp,
    issuedAt: payload.iat,
  });
}
