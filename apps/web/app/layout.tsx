import type { Metadata } from 'next';
import { IBM_Plex_Sans_Arabic } from 'next/font/google';
import { AppSwitcher } from '@midcine/ui';
import './globals.css';

const ibmPlexArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-ibm-plex-arabic',
});

export const metadata: Metadata = {
  title: 'midcine — منصة الإشعاع الذكية',
  description: 'Arabic Cloud-Native RIS/PACS with NEXUS-AI ensemble brain',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={ibmPlexArabic.variable}>
      <body className="font-sans">
        <div className="flex h-screen flex-col">
          <header className="border-b border-gray-200 bg-white px-4 py-2">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold text-brand-600">midcine</span>
                <AppSwitcher />
              </div>
              <button
                type="button"
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                aria-label="افتح لوحة الأوامر (Ctrl+K)"
              >
                <span className="ltr-only inline-block">⌘K</span>
                <span className="mx-2">·</span>
                <span>ابحث</span>
              </button>
            </div>
          </header>
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
