import { Card } from '@midcine/ui';

export default async function ReaderPage({
  params,
}: {
  params: Promise<{ studyId: string }>;
}) {
  const { studyId } = await params;
  return (
    <div className="p-6">
      <h1 className="mb-4 text-2xl font-bold">القارئ — {studyId}</h1>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card className="h-[600px] flex items-center justify-center text-gray-400">
            OHIF Viewer (سيُدمج في Sprint 2)
          </Card>
        </div>
        <div>
          <Card>
            <div className="p-4">
              <h2 className="mb-3 font-semibold">رؤى الذكاء الاصطناعي</h2>
              <p className="text-sm text-gray-500">
                ستظهر هنا نتائج NEXUS ensemble (Sprint 2).
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
