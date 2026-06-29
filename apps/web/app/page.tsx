import Link from 'next/link';

const routes = [
  { href: '/worklist', title: 'قائمة العمل', desc: 'الحالات في انتظار القراءة' },
  { href: '/reader/demo', title: 'القارئ', desc: 'عرض OHIF + AI Insights' },
  { href: '/patient/demo', title: 'ملف المريض', desc: 'الجدول الزمني + المرفقات' },
  { href: '/insights', title: 'الرؤى', desc: 'مقارنة نماذج NEXUS' },
  { href: '/connect', title: 'الاتصال', desc: 'WhatsApp + QR أطباء خارجيون' },
  { href: '/console', title: 'وحدة التحكم', desc: 'المستخدمون + الإعدادات' },
  { href: '/m', title: 'الجوّال', desc: 'PWA مختصرة' },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="mb-2 text-3xl font-bold">midcine — منصة الإشعاع</h1>
      <p className="mb-8 text-gray-600">
        تطبيق واحد، 7 مسارات. (مبدأ #6: ويب أولاً)
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {routes.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="block rounded-lg border border-gray-200 bg-white p-4 transition hover:border-brand-400 hover:shadow-sm"
          >
            <div className="font-semibold">{r.title}</div>
            <div className="text-sm text-gray-500">{r.desc}</div>
            <div className="ltr-only mt-1 text-xs text-gray-400">{r.href}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
