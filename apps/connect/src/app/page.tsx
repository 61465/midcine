import { Card, CardHeader, CardTitle, CardContent } from '@midcine/ui';

export default function ConnectHome() {
  return (
    <main className="container mx-auto p-6">
      <h1 className="mb-6 text-2xl font-bold">midcine Connect</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>WhatsApp</CardTitle>
          </CardHeader>
          <CardContent>إرسال تقارير لأطباء معالجين عبر واتساب.</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>QR</CardTitle>
          </CardHeader>
          <CardContent>إنشاء روابط مؤقتة للأطباء الخارجيين.</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Cross-Hospital</CardTitle>
          </CardHeader>
          <CardContent>بحث + طلب consent + P2P transfer.</CardContent>
        </Card>
      </div>
    </main>
  );
}
