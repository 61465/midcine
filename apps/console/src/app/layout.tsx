import '@midcine/ui/styles';
export const metadata = { title: 'midcine — Console' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen bg-background">{children}</body>
    </html>
  );
}
