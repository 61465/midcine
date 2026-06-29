import { Card, CardHeader, CardTitle, CardContent } from '@midcine/ui';

export default function PatientHome() {
  return (
    <main className="container mx-auto p-6">
      <h1 className="mb-6 text-2xl font-bold">midcine Patient</h1>
      <Card>
        <CardHeader>
          <CardTitle>افتح ملف مريض</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">/patient/[id]</p>
        </CardContent>
      </Card>
    </main>
  );
}
