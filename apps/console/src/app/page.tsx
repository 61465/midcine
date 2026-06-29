import { Card, CardHeader, CardTitle, CardContent } from '@midcine/ui';

export default function ConsoleHome() {
  return (
    <main className="container mx-auto p-6">
      <h1 className="mb-6 text-2xl font-bold">midcine Console</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">المستخدمون</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">—</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">دراسات اليوم</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">—</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">دقة AI</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">—</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Turnaround P95</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">—</CardContent>
        </Card>
      </div>
    </main>
  );
}
