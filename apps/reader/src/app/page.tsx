import { Card, CardHeader, CardTitle, CardContent } from '@midcine/ui';

export default function ReaderHome() {
  return (
    <main className="container mx-auto p-6">
      <h1 className="mb-6 text-2xl font-bold">midcine Reader</h1>
      <Card>
        <CardHeader>
          <CardTitle>افتح حالة من Worklist</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            هذا الـ skeleton لتطبيق Reader. الـ workflow الرئيسي يبدأ من <code>/study/[uid]</code>.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
