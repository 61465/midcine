import { Card } from '@midcine/ui';

export default function ConnectPage() {
  return (
    <div className="p-6">
      <h1 className="mb-4 text-2xl font-bold">الاتصال</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <div className="p-4">
            <h2 className="mb-2 font-semibold">إرسال WhatsApp</h2>
            <p className="text-sm text-gray-500">باقة تقرير لطبيب معالج (Sprint 5).</p>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <h2 className="mb-2 font-semibold">QR لطبيب خارجي</h2>
            <p className="text-sm text-gray-500">رابط magic مؤقّت بـ HMAC token.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
