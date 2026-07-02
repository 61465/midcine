'use client';

import { useLocale } from '../../lib/i18n';

export function LocaleFooter() {
  const { locale } = useLocale();
  const line =
    locale === 'ar'
      ? 'نظام معلومات إشعاعي عربي · Cloud-Native · Edge-first'
      : 'Arabic-native RIS/PACS · Cloud-Native · Edge-first';
  return (
    <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
      <span className="text-brand-300">© {new Date().getFullYear()} midcine</span>
      <span>{line}</span>
      <span className="ltr-only text-gold-400">v3 · pre-alpha</span>
    </div>
  );
}
