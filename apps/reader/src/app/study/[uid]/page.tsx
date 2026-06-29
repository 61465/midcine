import { LoadingOverlay } from '@midcine/ui';

interface PageProps {
  params: Promise<{ uid: string }>;
}

export default async function StudyReader({ params }: PageProps) {
  const { uid } = await params;

  return (
    <div className="flex h-screen flex-col">
      {/* Top bar: study info + nav */}
      <header className="border-b bg-card px-4 py-2">
        <h1 className="text-sm font-semibold">دراسة {uid}</h1>
      </header>

      {/* 3-column layout: viewer | AI insights | report editor */}
      <div className="grid flex-1 grid-cols-12 gap-2 p-2">
        <section className="col-span-7 rounded-lg border bg-black">
          {/* OHIF iframe lands here in Sprint 5 */}
          <LoadingOverlay message="جارٍ تحميل العارض..." />
        </section>

        <section className="col-span-2 rounded-lg border bg-card p-3">
          <h2 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
            رؤى الذكاء الاصطناعي
          </h2>
          <p className="text-xs text-muted-foreground">— لا توجد نتائج بعد —</p>
        </section>

        <section className="col-span-3 rounded-lg border bg-card p-3">
          <h2 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
            محرّر التقرير
          </h2>
          <textarea
            className="h-full w-full resize-none rounded border bg-background p-2 text-sm font-report"
            placeholder="ابدأ كتابة التقرير، أو اضغط 'AI suggest'..."
          />
        </section>
      </div>
    </div>
  );
}
