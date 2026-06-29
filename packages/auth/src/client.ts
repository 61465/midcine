'use client';
import { UserManager, WebStorageStateStore, type UserManagerSettings } from 'oidc-client-ts';
import type { AuthConfig, UserSession } from './types';

let _userManager: UserManager | null = null;

export function initAuthClient(config: AuthConfig): UserManager {
  if (_userManager) return _userManager;

  const settings: UserManagerSettings = {
    authority: config.issuer,
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: (config.scopes ?? ['openid', 'profile', 'email', 'urn:midcine:tenant']).join(' '),
    automaticSilentRenew: true,
    userStore: new WebStorageStateStore({ store: window.localStorage }),
  };

  _userManager = new UserManager(settings);
  return _userManager;
}

export function getAuthClient(): UserManager {
  if (!_userManager) throw new Error('Auth client not initialized — call initAuthClient first');
  return _userManager;
}

export async function getSession(): Promise<UserSession | null> {
  const user = await getAuthClient().getUser();
  if (!user || user.expired) return null;
  return mapUserToSession(user);
}

export async function login(returnUrl?: string): Promise<void> {
  await getAuthClient().signinRedirect({ state: { returnUrl } });
}

export async function logout(): Promise<void> {
  await getAuthClient().signoutRedirect();
}

function mapUserToSession(user: import('oidc-client-ts').User): UserSession {
  const profile = user.profile as Record<string, unknown>;
  return {
    userId: String(profile.sub ?? ''),
    tenantId: String(profile['urn:midcine:tenant'] ?? ''),
    email: String(profile.email ?? ''),
    displayName: String(profile.name ?? profile.preferred_username ?? ''),
    role: (profile['urn:midcine:role'] as UserSession['role']) ?? 'radiologist',
    permissions: (profile['urn:midcine:permissions'] as string[]) ?? [],
    expiresAt: user.expires_at ?? 0,
    issuedAt: Math.floor(Date.now() / 1000),
  };
}
