import { Card, CardHeader, CardTitle, CardContent } from '@midcine/ui';

export default function WorklistHome() {
  return (
    <main className="container mx-auto p-6">
      <h1 className="mb-6 text-2xl font-bold">قائمة الأعمال — midcine Worklist</h1>
      <Card>
        <CardHeader>
          <CardTitle>مرحباً</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            هذا الـ skeleton لتطبيق Worklist. ابنِ عليه في Sprint 3.
          </p>
          <p className="mt-2 text-sm">
            اضغط <kbd className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">⌘ K</kbd>{' '}
            لفتح command palette.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
