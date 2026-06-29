import type { Metadata, Viewport } from 'next';
import '@midcine/ui/styles';

export const metadata: Metadata = {
  title: 'midcine Mobile',
  description: 'تنبيهات + قراءة سريعة + توقيع',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#0284c7',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen bg-background">{children}</body>
    </html>
  );
}
