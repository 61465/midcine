'use client';

import { useCallback, useEffect, useState } from 'react';
import { MESSAGES, type MessageKey } from './messages';

export type Locale = 'ar' | 'en';
export const defaultLocale: Locale = 'ar';

const STORAGE_KEY = 'midcine.locale';
const EVENT_NAME = 'midcine:locale-change';

function readLocale(): Locale {
  if (typeof window === 'undefined') return defaultLocale;
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved === 'en' ? 'en' : 'ar';
}

function applyToDom(locale: Locale) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
}

export function useLocale() {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);

  // Sync from storage on mount
  useEffect(() => {
    const initial = readLocale();
    setLocaleState(initial);
    applyToDom(initial);
    function onChange() {
      const next = readLocale();
      setLocaleState(next);
      applyToDom(next);
    }
    window.addEventListener(EVENT_NAME, onChange);
    return () => window.removeEventListener(EVENT_NAME, onChange);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, next);
    applyToDom(next);
    setLocaleState(next);
    window.dispatchEvent(new Event(EVENT_NAME));
  }, []);

  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string>): string => {
      const msg = MESSAGES[locale][key] ?? MESSAGES[defaultLocale][key] ?? key;
      if (!vars) return msg;
      return Object.entries(vars).reduce(
        (s, [k, v]) => s.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), v),
        msg,
      );
    },
    [locale],
  );

  return { locale, setLocale, t, dir: locale === 'ar' ? 'rtl' : 'ltr' };
}
