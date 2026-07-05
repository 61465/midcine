import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-[#0A0E14] font-sans text-slate-200 antialiased">{children}</body>
    </html>
  );
}
