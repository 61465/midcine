import Link from 'next/link';
import {
  ListChecks,
  ScanEye,
  Heart,
  User,
  Sparkles,
  Send,
  Settings,
  Smartphone,
  ArrowLeft,
  Zap,
  Shield,
  Award,
  Activity,
} from 'lucide-react';

const routes = [
  {
    href: '/worklist',
    title: 'قائمة العمل',
    desc: 'حالات المشفى بترتيب الأولوية · فلاتر · اقتراحات AI',
    icon: ListChecks,
  },
  {
    href: '/worklist',
    title: 'القارئ',
    desc: 'DICOM viewer + NEXUS Ensemble + محرّر تقرير + توقيع + WhatsApp',
    icon: ScanEye,
  },
  {
    href: '/anatomy',
    title: 'أطلس الأمراض',
    desc: '21 حالة مرضية بصرية — قلب/رئتين/دماغ/كليتين + مكتبات مجانية',
    icon: Heart,
  },
  {
    href: '/worklist',
    title: 'ملف المريض',
    desc: 'الجدول الزمني · حساسية/أدوية · متابعة تطوّر الحالة',
    icon: User,
  },
  {
    href: '/insights',
    title: 'الرؤى',
    desc: 'KPIs المشفى الفعلية · متوسط زمن الـ AI · معدل الإجماع',
    icon: Sparkles,
  },
  {
    href: '/connect',
    title: 'الاتصال',
    desc: 'رسائل WhatsApp المُرسلة إلى الأطباء والمرضى',
    icon: Send,
  },
  {
    href: '/console',
    title: 'الإعدادات',
    desc: 'التكاملات (Orthanc/HL7/FHIR/WhatsApp) · سجل التدقيق · الأمن',
    icon: Settings,
  },
  {
    href: '/m',
    title: 'الجوّال',
    desc: 'PWA للحالات الحرجة · P1/P2 · push notifications',
    icon: Smartphone,
  },
];

const trustPoints = [
  { icon: Zap, title: 'ذكاء ensemble', desc: '46 وكيل NEXUS-AI بالتوازي' },
  { icon: Shield, title: 'أمن edge-first', desc: 'DICOM لا يغادر المشفى' },
  { icon: Activity, title: 'FHIR R4', desc: 'تكامل EMR/HIS جاهز' },
  { icon: Award, title: 'RTL أصلي', desc: 'صمّم للطبيب العربي' },
];

const stats = [
  { value: '46', suffix: 'وكيل', label: 'nexus-ai agents' },
  { value: '15', suffix: 'خدمة', label: 'microservices' },
  { value: '<15', suffix: 'ثانية', label: 'ensemble P95' },
  { value: '99%', suffix: '', label: 'uptime target' },
];

export default function Home() {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Floating gold orb */}
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-[500px] w-[500px] rounded-full opacity-40 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(197,160,89,0.25), transparent 70%)' }}
        />
        <div
          className="pointer-events-none absolute -bottom-24 -left-24 h-[400px] w-[400px] rounded-full opacity-30 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(21,48,91,0.25), transparent 70%)' }}
        />

        <div className="relative mx-auto max-w-6xl px-6 py-16 lg:py-24">
          <div className="border-gold-200 bg-gold-100/60 text-gold-500 mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold">
            <Sparkles className="animate-badge-pulse h-3.5 w-3.5" />
            <span>الجيل التالي · RIS/PACS عربي</span>
          </div>

          <h1 className="text-brand-800 text-4xl font-black leading-tight md:text-6xl">
            <span>منصّة الإشعاع </span>
            <span className="text-gradient-gold">الفاخرة</span>
            <br />
            <span>للطبيب العربي</span>
          </h1>

          <p className="text-muted-foreground mt-6 max-w-2xl text-base leading-loose md:text-lg">
            تطبيق واحد بـ 7 مسارات، عقل ensemble من 46 وكيل NEXUS-AI، وأمن edge-first لا يغادر
            مشفاك. صُمّمت midcine لتتفوّق بالاختلاف، لا بالتقليد.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/worklist" className="btn-luxury">
              <span>ابدأ قائمة العمل</span>
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <Link
              href="/anatomy"
              className="border-border text-brand-800 hover:border-brand-800 hover:bg-brand-800 inline-flex items-center gap-2 rounded-xl border-2 bg-transparent px-6 py-3 font-bold transition hover:-translate-y-0.5 hover:text-white"
            >
              <Heart className="h-4 w-4" />
              <span>مختبر التشريح</span>
            </Link>
          </div>
        </div>

        {/* Stats bar under hero */}
        <div className="border-border/60 relative border-y bg-white/60 py-6 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-8 px-6 lg:gap-16">
            {stats.map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-brand-800 text-2xl font-black md:text-3xl">
                  {s.value}
                  {s.suffix && <span className="text-gold-400 ml-1 text-lg">{s.suffix}</span>}
                </div>
                <div className="ltr-only text-muted-foreground mt-0.5 text-[11px] font-medium uppercase tracking-widest">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust dark bar */}
      <section className="stats-bar-dark grid grid-cols-2 gap-6 px-6 py-10 md:grid-cols-4">
        {trustPoints.map((t) => {
          const Icon = t.icon;
          return (
            <div
              key={t.title}
              className="flex items-center gap-4 rounded-xl p-2 transition hover:bg-white/5"
            >
              <div className="border-gold-400/20 bg-gold-400/10 text-gold-400 flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl border">
                <Icon className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">{t.title}</h3>
                <p className="text-brand-400 mt-0.5 text-xs">{t.desc}</p>
              </div>
            </div>
          );
        })}
      </section>

      {/* Routes as luxury cards */}
      <section className="mx-auto max-w-6xl px-6 py-16 lg:py-24">
        <div className="mb-10 text-center">
          <div className="section-label mb-4 justify-center">
            <span>modules</span>
          </div>
          <h2 className="text-brand-800 text-3xl font-black md:text-4xl">
            كل ما يحتاجه قسم الإشعاع
          </h2>
          <p className="text-muted-foreground mx-auto mt-3 max-w-xl text-sm md:text-base">
            8 مسارات مركّزة، تجربة موحّدة، ⌘K palette للتنقّل بين أي منها في ثوانٍ.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {routes.map((r) => {
            const Icon = r.icon;
            return (
              <Link key={r.href} href={r.href} className="card-luxury group">
                <div className="bg-gradient-navy text-gold-400 group-hover:bg-gradient-gold group-hover:text-brand-800 mb-4 flex h-12 w-12 items-center justify-center rounded-xl transition">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-brand-800 mb-2 text-base font-bold">{r.title}</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">{r.desc}</p>
                <div className="ltr-only text-gold-400 mt-3 font-mono text-[10px] opacity-70">
                  {r.href}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Conversion banner */}
      <section className="mx-auto max-w-6xl px-6 pb-16">
        <div className="from-brand-800 via-brand-700 to-brand-900 shadow-navy relative overflow-hidden rounded-3xl bg-gradient-to-br p-10 text-white md:p-16">
          <div
            className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full opacity-40 blur-3xl"
            style={{ background: 'radial-gradient(circle, rgba(197,160,89,0.2), transparent 60%)' }}
          />
          <div className="via-gold-400 pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-transparent to-transparent" />

          <div className="relative flex flex-wrap items-center justify-between gap-8">
            <div className="max-w-lg">
              <div className="section-label text-gold-400 mb-4">
                <span>الفلسفة</span>
              </div>
              <h2 className="text-2xl font-black leading-relaxed md:text-3xl">
                نتفوّق بالاختلاف،
                <br />
                لا بالتقليد.
              </h2>
              <p className="text-brand-300 mt-4 text-sm leading-loose md:text-base">
                6 مبادئ تحكم كل قرار: NEXUS = العقل، أمن لا يقيّد الإبداع، لا تقليد، ensemble في كل
                طبقة، استغلال ما تتجنّبه الأنظمة الكبيرة، وويب أولاً.
              </p>
            </div>

            <div className="flex flex-wrap gap-4">
              {[
                { n: '90', l: 'يوم للـ MVP' },
                { n: '$150', l: 'شهرياً لعشرة مراكز' },
                { n: '7', l: 'مسار موحّد' },
              ].map((m) => (
                <div
                  key={m.l}
                  className="hover:border-gold-400/30 hover:bg-gold-400/10 min-w-[140px] rounded-2xl border border-white/10 bg-white/5 px-8 py-6 text-center transition"
                >
                  <div className="text-gradient-gold text-3xl font-black md:text-4xl">{m.n}</div>
                  <div className="text-brand-400 mt-2 text-xs">{m.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
