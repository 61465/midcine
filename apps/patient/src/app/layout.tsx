import type { Metadata } from 'next';
import '@midcine/ui/styles';

export const metadata: Metadata = {
  title: 'midcine — Patient',
  description: 'ملف المريض الشامل',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen bg-background">{children}</body>
    </html>
  );
}
