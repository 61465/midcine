import { Card } from '@midcine/ui';

export default async function PatientPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  return (
    <div className="p-6">
      <h1 className="mb-4 text-2xl font-bold">ملف المريض — {patientId}</h1>
      <Card>
        <div className="p-4 text-gray-500">
          الجدول الزمني + المرفقات + الطلبات (Sprint 5).
        </div>
      </Card>
    </div>
  );
}
