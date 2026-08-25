'use client';

import { useEffect } from 'react';

export function PWARegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((e) => console.warn('[PWA] SW register failed:', e));
  }, []);
  return null;
}
