// Referring physicians directory — stored in localStorage.
// The radiologist manages this list themselves; it's their personal address book.

export interface Referrer {
  id: string;
  name: string;
  phone: string; // WhatsApp number in E.164 format
  specialty?: string;
  favorite?: boolean;
}

const STORAGE_KEY = 'midcine.referrers.v1';

function safeParse(raw: string | null): Referrer[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadReferrers(): Referrer[] {
  if (typeof window === 'undefined') return [];
  return safeParse(window.localStorage.getItem(STORAGE_KEY));
}

export function saveReferrers(list: Referrer[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  window.dispatchEvent(new Event('midcine:referrers-updated'));
}

export function addReferrer(r: Omit<Referrer, 'id'>): Referrer {
  const list = loadReferrers();
  const created: Referrer = {
    ...r,
    id: `ref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  };
  list.push(created);
  saveReferrers(list);
  return created;
}

export function updateReferrer(id: string, patch: Partial<Referrer>): void {
  const list = loadReferrers().map((r) => (r.id === id ? { ...r, ...patch } : r));
  saveReferrers(list);
}

export function removeReferrer(id: string): void {
  saveReferrers(loadReferrers().filter((r) => r.id !== id));
}

// Track last-used per case so the composer can default to the same referrers
const RECENT_KEY = 'midcine.recentReferrerIds.v1';

export function getRecentReferrerIds(): string[] {
  if (typeof window === 'undefined') return [];
  return safeParse(window.localStorage.getItem(RECENT_KEY)) as unknown as string[];
}

export function setRecentReferrerIds(ids: string[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(RECENT_KEY, JSON.stringify(ids));
}
