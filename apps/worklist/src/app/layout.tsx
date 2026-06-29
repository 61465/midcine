import type { Metadata } from 'next';
import { CommandPaletteProvider, CommandPalette } from '@midcine/command-palette';
import '@midcine/ui/styles';

export const metadata: Metadata = {
  title: 'midcine — Worklist',
  description: 'فرز الحالات الإشعاعية حسب الأولوية',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen bg-background">
        <CommandPaletteProvider>
          {children}
          <CommandPalette />
        </CommandPaletteProvider>
      </body>
    </html>
  );
}
