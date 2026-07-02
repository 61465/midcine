'use client';

import { Languages } from 'lucide-react';
import { useLocale } from '../../lib/i18n';

export function LocaleToggle() {
  const { locale, setLocale } = useLocale();
  return (
    <div className="border-border inline-flex items-center gap-0.5 rounded-full border bg-white p-0.5">
      <Languages className="mx-1 h-3 w-3 text-slate-400" />
      <button
        type="button"
        onClick={() => setLocale('ar')}
        aria-pressed={locale === 'ar'}
        className={
          'rounded-full px-2.5 py-0.5 text-[10px] font-bold transition ' +
          (locale === 'ar' ? 'bg-brand-800 text-white' : 'text-slate-600 hover:bg-slate-100')
        }
      >
        عربي
      </button>
      <button
        type="button"
        onClick={() => setLocale('en')}
        aria-pressed={locale === 'en'}
        className={
          'rounded-full px-2.5 py-0.5 text-[10px] font-bold transition ' +
          (locale === 'en' ? 'bg-brand-800 text-white' : 'text-slate-600 hover:bg-slate-100')
        }
      >
        EN
      </button>
    </div>
  );
}
