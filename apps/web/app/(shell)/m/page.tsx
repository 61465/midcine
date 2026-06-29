import { Card, PriorityBadge } from '@midcine/ui';

export default function MobilePage() {
  return (
    <div className="p-4">
      <h1 className="mb-3 text-xl font-bold">midcine — جوّال</h1>
      <p className="mb-4 text-sm text-gray-500">
        عرض مختصر للحالات الحرجة. PWA install متاح من الإعدادات.
      </p>
      <div className="space-y-2">
        <Card>
          <div className="flex items-center justify-between p-3">
            <div>
              <div className="font-semibold">محمد أحمد · CT BRAIN</div>
              <div className="text-xs text-gray-500">قبل 5 دقائق</div>
            </div>
            <PriorityBadge priority="P1" pulse />
          </div>
        </Card>
      </div>
    </div>
  );
}
