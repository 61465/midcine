'use client';

import { useEffect } from 'react';

export function LocaleSync() {
  useEffect(() => {
    const saved = window.localStorage.getItem('midcine.locale');
    const loc: 'ar' | 'en' = saved === 'en' ? 'en' : 'ar';
    document.documentElement.lang = loc;
    document.documentElement.dir = loc === 'ar' ? 'rtl' : 'ltr';
  }, []);
  return null;
}
