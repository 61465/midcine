import { Card, CardHeader, CardTitle, CardContent } from '@midcine/ui';

export default function InsightsHome() {
  return (
    <main className="container mx-auto p-6">
      <h1 className="mb-6 text-2xl font-bold">midcine AI Insights</h1>
      <Card>
        <CardHeader>
          <CardTitle>تفاصيل قرارات الذكاء الاصطناعي</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            عرض النماذج، الـ confidence، الـ disagreements، والاستشهادات لكل دراسة.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
