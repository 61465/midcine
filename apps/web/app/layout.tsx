import type { Metadata } from 'next';
import { Tajawal } from 'next/font/google';
import Link from 'next/link';
import { Search, Sparkles } from 'lucide-react';
import { MidcineAppSwitcher } from './_components/midcine-app-switcher';
import { LocaleSync } from './_components/locale-sync';
import { LocaleToggle } from './_components/locale-toggle';
import './globals.css';

const tajawal = Tajawal({
  subsets: ['arabic', 'latin'],
  weight: ['300', '400', '500', '700', '900'],
  display: 'swap',
  variable: '--font-tajawal',
});

export const metadata: Metadata = {
  title: 'midcine — منصة الإشعاع الفاخرة',
  description: 'Arabic Cloud-Native RIS/PACS · NEXUS-AI ensemble · Edge-first security',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={tajawal.variable}>
      <body className="font-sans">
        <LocaleSync />
        <div className="bg-background flex min-h-screen flex-col">
          {/* Fixed luxury header */}
          <header className="panel-glass sticky top-0 z-50">
            <div className="flex h-[68px] items-center justify-between px-6">
              {/* Logo + brand */}
              <div className="flex items-center gap-4">
                <Link href="/" className="group flex items-center gap-3">
                  <div className="bg-gradient-navy relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl">
                    {/* Gold rotating shimmer */}
                    <div
                      className="animate-gold-spin absolute inset-[-50%]"
                      style={{
                        background:
                          'conic-gradient(transparent, rgba(197,160,89,0.4), transparent 30%)',
                      }}
                    />
                    <Sparkles className="text-gold-400 relative z-10 h-5 w-5" />
                  </div>
                  <span className="text-brand-800 text-xl font-black tracking-tight">midcine</span>
                </Link>
                <MidcineAppSwitcher />
              </div>

              {/* Actions cluster */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="text-brand-800 hover:bg-gold-100 hover:text-gold-500 flex h-9 w-9 items-center justify-center rounded-full transition"
                  aria-label="بحث"
                >
                  <Search className="h-4 w-4" />
                </button>
                <LocaleToggle />
                <button
                  type="button"
                  className="btn-luxury px-4 py-2 text-xs"
                  aria-label="افتح لوحة الأوامر (Ctrl+K)"
                >
                  <span className="ltr-only">⌘K</span>
                  <span>أوامر</span>
                </button>
              </div>
            </div>
          </header>

          {/* Main scrollable area */}
          <main className="flex-1">{children}</main>

          {/* Luxury dark footer */}
          <footer className="bg-brand-900 text-brand-400 mt-auto px-6 py-8 text-xs">
            <div
              className="pointer-events-none absolute inset-x-0 h-px"
              style={{
                background:
                  'linear-gradient(90deg, transparent, rgba(197,160,89,0.3), transparent)',
              }}
            />
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
              <span className="text-brand-300">© {new Date().getFullYear()} midcine</span>
              <span>نظام معلومات إشعاعي عربي · Cloud-Native · Edge-first</span>
              <span className="ltr-only text-gold-400">v3 · pre-alpha</span>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
