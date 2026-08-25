import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { PWARegistrar } from './_components/pwa-registrar';

// Global root layout — kept intentionally minimal so pages control their own
// chrome. The Reading Room takes over the full viewport. The landing page,
// atlas, and share links each render their own headers.

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'midcine — radiology reports in 15 seconds',
  description:
    'Voice-driven radiology reporting for the solo radiologist. Local-first, physician-signed.',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, title: 'midcine', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  themeColor: '#0891b2',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-[#0A0E14] font-sans text-slate-200 antialiased">
        <PWARegistrar />
        <div
          role="banner"
          className="sticky top-0 z-[100] w-full bg-amber-500 px-3 py-1.5 text-center text-[11px] font-bold tracking-wide text-slate-950 shadow-md"
        >
          ⚠ DEMO / FICTIONAL DATA — All patients, IDs, and clinical text are
          synthetic. DICOM pixels are anonymized fixtures. No real PHI.
        </div>
        {children}
      </body>
    </html>
  );
}
