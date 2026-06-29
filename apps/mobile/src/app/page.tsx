import { Card, CardHeader, CardTitle, CardContent } from '@midcine/ui';

export default function MobileHome() {
  return (
    <main className="p-4">
      <h1 className="mb-4 text-xl font-bold">midcine Mobile</h1>
      <Card>
        <CardHeader>
          <CardTitle>تنبيهات الحالات الحرجة</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">لا توجد تنبيهات.</p>
        </CardContent>
      </Card>
    </main>
  );
}
