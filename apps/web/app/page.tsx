import Link from 'next/link';
import { Sparkles, Mic, Send, Zap, ArrowRight, Check, Shield, Clock, Settings } from 'lucide-react';

const features = [
  {
    icon: Mic,
    title: 'Voice-to-report',
    tag: 'Voice',
    desc: 'Hold space and dictate. Live transcription in Arabic or English.',
  },
  {
    icon: Sparkles,
    title: 'Draft in 15 seconds',
    tag: 'AI',
    desc: '4 AI agents read the study and draft the report. You edit and sign.',
  },
  {
    icon: Send,
    title: 'Auto-delivery',
    tag: 'Delivery',
    desc: 'Signed → PDF + DICOM SR straight to the referrer via WhatsApp.',
  },
];

const includes = [
  'Unlimited reports',
  'Voice dictation (Whisper)',
  'Customizable templates',
  'WhatsApp auto-delivery',
  'Visual atlas of 21 pathologies',
  'Runs locally — your data stays with you',
];

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0A0E14] text-slate-200" dir="ltr">
      <nav className="border-b border-slate-800/50 bg-slate-950/40 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-gradient-to-br from-cyan-500 to-cyan-700 text-white">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <span className="text-sm font-black text-slate-200">midcine</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <Link href="/anatomy" className="hover:text-cyan-300">
              Atlas
            </Link>
            <Link href="/settings" className="flex items-center gap-1 hover:text-cyan-300">
              <Settings className="h-3 w-3" />
              Settings
            </Link>
            <Link
              href="/room"
              className="rounded-full bg-cyan-500 px-3 py-1 font-bold text-slate-950 hover:bg-cyan-400"
            >
              Open Room
            </Link>
          </div>
        </div>
      </nav>

      <section className="relative overflow-hidden border-b border-slate-800">
        <div
          className="pointer-events-none absolute -right-40 -top-40 h-[500px] w-[500px] rounded-full opacity-40 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.15), transparent 70%)' }}
        />
        <div
          className="pointer-events-none absolute -bottom-40 -left-40 h-[400px] w-[400px] rounded-full opacity-30 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.1), transparent 70%)' }}
        />

        <div className="relative mx-auto max-w-5xl px-6 py-24">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-300">
            <Sparkles className="h-3 w-3" />
            For the radiologist who wants to leave work at 5pm
          </div>

          <h1 className="text-5xl font-black leading-tight text-slate-100 md:text-6xl">
            Radiology reports
            <br />
            <span className="bg-gradient-to-r from-cyan-400 to-amber-400 bg-clip-text text-transparent">
              in 15 seconds
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-400">
            midcine reads the study, drafts the report, sends it. You edit, sign, move on. The hours
            you save? Yours.
          </p>

          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href="/room"
              className="group inline-flex items-center gap-2 rounded-full bg-cyan-500 px-6 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-400"
            >
              Open reading room
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/anatomy"
              className="inline-flex items-center gap-2 rounded-full border border-slate-700 px-6 py-3 text-sm font-medium text-slate-300 hover:border-cyan-500 hover:text-cyan-300"
            >
              Pathology atlas
            </Link>
          </div>

          <div className="mt-16 flex flex-wrap items-center gap-6 text-xs text-slate-500">
            <div className="flex items-center gap-1.5">
              <Shield className="h-3 w-3 text-emerald-400" />
              Local-first — your data never leaves your machine
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3 w-3 text-amber-400" />
              Save 5–7 hours per week
            </div>
            <div className="flex items-center gap-1.5">
              <Zap className="h-3 w-3 text-cyan-400" />
              Works alongside your existing PACS
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-800 py-24">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mb-12 text-center">
            <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-cyan-400">
              Three moves. Every case.
            </div>
            <h2 className="text-3xl font-black text-slate-100 md:text-4xl">
              Built for the read, not the meeting
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 p-6 transition hover:border-cyan-500/40"
                >
                  <div className="absolute right-4 top-4 text-[9px] font-bold uppercase tracking-widest text-slate-600">
                    {f.tag}
                  </div>
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-amber-500/20 text-cyan-300">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-slate-100">{f.title}</h3>
                  <p className="text-sm leading-relaxed text-slate-400">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-b border-slate-800 py-24">
        <div className="mx-auto max-w-3xl px-6">
          <div className="mb-8 text-center">
            <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-cyan-400">
              Pricing
            </div>
            <h2 className="text-3xl font-black text-slate-100 md:text-4xl">
              One plan. Everything.
            </h2>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-slate-900 to-slate-950 p-8">
            <div
              className="pointer-events-none absolute inset-0 opacity-30"
              style={{
                background:
                  'radial-gradient(circle at top right, rgba(34,211,238,0.15), transparent 60%)',
              }}
            />
            <div className="relative">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-cyan-300">
                midcine Pro
              </div>
              <div className="mb-1 flex items-baseline gap-2">
                <span className="text-6xl font-black text-slate-100">$79</span>
                <span className="text-slate-500">/month</span>
              </div>
              <div className="mb-6 text-xs text-slate-500">
                14-day free trial · no card required
              </div>

              <ul className="mb-8 space-y-2">
                {includes.map((line) => (
                  <li key={line} className="flex items-center gap-2 text-sm text-slate-300">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-400">
                      <Check className="h-3 w-3" />
                    </div>
                    {line}
                  </li>
                ))}
              </ul>

              <Link
                href="/room"
                className="block rounded-full bg-cyan-500 py-3 text-center text-sm font-bold text-slate-950 hover:bg-cyan-400"
              >
                Start free trial
              </Link>

              <p className="mt-4 text-center text-[10px] text-slate-500">
                You control every word. Reports are drafts. You sign them.
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-5xl px-6 py-8 text-center text-[10px] text-slate-600">
        © {new Date().getFullYear()} midcine · Local-first · Physician-signed · Not a diagnostic
        device
      </footer>
    </div>
  );
}
