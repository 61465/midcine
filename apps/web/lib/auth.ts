// Local auth + trial state. Single-user, stored in localStorage.
// Real Stripe / server-side auth comes when we're ready to charge — for now
// this covers the "sign in / start trial / see days remaining" UX.

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: number;
  trialEndsAt: number;
  plan: 'trial' | 'pro' | 'expired';
}

const USER_KEY = 'midcine.user.v1';
const TRIAL_DAYS = 14;

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function currentUser(): User | null {
  if (typeof window === 'undefined') return null;
  const u = safeParse<User>(window.localStorage.getItem(USER_KEY));
  if (!u) return null;
  // Auto-flip to expired when trial runs out
  if (u.plan === 'trial' && Date.now() > u.trialEndsAt) {
    u.plan = 'expired';
  }
  return u;
}

export function signup(email: string, name: string, password: string): User {
  // Password hashing intentionally NOT done client-side. When we add a real
  // server, /auth/signup will hash + persist. For now we just derive a stable
  // ID from the email so re-signup gives back the same user.
  void password;
  const now = Date.now();
  const id = `user_${btoa(email.toLowerCase()).slice(0, 12)}`;
  const trialEndsAt = now + TRIAL_DAYS * 24 * 3600 * 1000;
  const user: User = {
    id,
    email: email.toLowerCase().trim(),
    name: name.trim(),
    createdAt: now,
    trialEndsAt,
    plan: 'trial',
  };
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  window.dispatchEvent(new Event('midcine:auth-changed'));
  return user;
}

export function login(email: string, password: string): User | null {
  // Same-machine "login" — checks that a previous signup exists with this email.
  void password;
  const existing = currentUser();
  if (existing && existing.email === email.toLowerCase().trim()) {
    window.dispatchEvent(new Event('midcine:auth-changed'));
    return existing;
  }
  return null;
}

export function logout(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event('midcine:auth-changed'));
}

export function daysRemainingInTrial(): number {
  const u = currentUser();
  if (!u || u.plan !== 'trial') return 0;
  const ms = u.trialEndsAt - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 3600 * 1000)));
}

export function upgradeToPro(): void {
  const u = currentUser();
  if (!u) return;
  u.plan = 'pro';
  window.localStorage.setItem(USER_KEY, JSON.stringify(u));
  window.dispatchEvent(new Event('midcine:auth-changed'));
}
