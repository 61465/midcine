'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  BarChart3,
  Clock,
  FileText,
  Sparkles,
  AlertTriangle,
  TrendingUp,
} from 'lucide-react';
import { fetchAuditRecent, fetchStudies, type AuditEntry, type Study } from '../../lib/studies';

interface Stats {
  totalStudies: number;
  signedToday: number;
  avgTurnaroundMin: number | null;
  impressionsGenerated: number;
  criticalAlerts: number;
  minutesSaved: number;
  byModality: Record<string, number>;
  byPriority: Record<string, number>;
  last7Days: { date: string; count: number }[];
}

function summarize(studies: Study[], audit: AuditEntry[]): Stats {
  const now = Date.now();
  const day = 24 * 3600 * 1000;

  const byModality: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  for (const s of studies) {
    byModality[s.modality] = (byModality[s.modality] ?? 0) + 1;
    byPriority[s.priority] = (byPriority[s.priority] ?? 0) + 1;
  }

  const signedToday = studies.filter(
    (s) => s.status === 'signed' && new Date(s.study_date).getTime() > now - day,
  ).length;

  const impressionsGenerated = audit.filter((e) => e.action === 'ai.impression_generated').length;
  const criticalAlerts = audit.filter((e) => e.action === 'ai.critical_alert').length;

  // Turnaround: study_date → signed audit
  const signedEvents = audit.filter((e) => e.action === 'report.signed');
  let ttSum = 0;
  let ttCount = 0;
  for (const ev of signedEvents) {
    const s = studies.find((x) => x.study_uid === ev.target?.id);
    if (!s) continue;
    const dt = new Date(ev.ts).getTime() - new Date(s.study_date).getTime();
    if (dt > 0 && dt < 30 * day) {
      ttSum += dt;
      ttCount += 1;
    }
  }
  const avgTurnaroundMin = ttCount > 0 ? Math.round(ttSum / ttCount / 60_000) : null;

  const last7Days = Array.from({ length: 7 }).map((_, i) => {
    const t = now - (6 - i) * day;
    const dstart = new Date(t).toISOString().slice(0, 10);
    const count = studies.filter((s) => s.study_date?.startsWith(dstart)).length;
    return { date: dstart.slice(5), count };
  });

  // Rough estimate: Rad AI marketing says ~60 min/shift saved with impressions
  // We attribute 3 min per generated impression as conservative floor.
  const minutesSaved = impressionsGenerated * 3;

  return {
    totalStudies: studies.length,
    signedToday,
    avgTurnaroundMin,
    impressionsGenerated,
    criticalAlerts,
    minutesSaved,
    byModality,
    byPriority,
    last7Days,
  };
}

export default function AnalyticsPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    (async () => {
      const [studies, audit] = await Promise.all([
        fetchStudies('default'),
        fetchAuditRecent('default', 500),
      ]);
      setStats(summarize(studies, audit));
    })();
  }, []);

  return (
    <div className="min-h-screen bg-[#0A0E14] text-slate-200">
      <header className="border-b border-slate-800 bg-slate-950 px-6 py-3">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <Link
            href="/room"
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-cyan-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Reading room
          </Link>
          <div className="h-4 w-px bg-slate-800" />
          <BarChart3 className="h-4 w-4 text-cyan-400" />
          <span className="text-sm font-bold">Analytics</span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-6">
        {!stats ? (
          <div className="text-center text-sm text-slate-500">Loading…</div>
        ) : (
          <div className="space-y-6">
            {/* KPI cards */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi
                icon={<FileText className="h-4 w-4" />}
                label="Total studies"
                value={stats.totalStudies.toLocaleString()}
                color="cyan"
              />
              <Kpi
                icon={<Clock className="h-4 w-4" />}
                label="Avg turnaround"
                value={stats.avgTurnaroundMin != null ? `${stats.avgTurnaroundMin} min` : '—'}
                sub="acquired → signed"
                color="emerald"
              />
              <Kpi
                icon={<Sparkles className="h-4 w-4" />}
                label="AI impressions"
                value={stats.impressionsGenerated.toString()}
                sub={`~${stats.minutesSaved} min saved`}
                color="fuchsia"
              />
              <Kpi
                icon={<AlertTriangle className="h-4 w-4" />}
                label="Critical alerts"
                value={stats.criticalAlerts.toString()}
                color="rose"
              />
            </div>

            {/* Volume last 7 days */}
            <section className="rounded-lg border border-slate-800 bg-slate-950 p-4">
              <h2 className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-500">
                <TrendingUp className="h-3 w-3" /> Volume — last 7 days
              </h2>
              <div className="flex items-end gap-1 h-32">
                {stats.last7Days.map((d) => {
                  const max = Math.max(...stats.last7Days.map((x) => x.count), 1);
                  const h = Math.round((d.count / max) * 100);
                  return (
                    <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                      <div
                        className="w-full rounded-t bg-cyan-500/60 hover:bg-cyan-500 transition"
                        style={{ height: `${h}%` }}
                        title={`${d.date}: ${d.count}`}
                      />
                      <div className="text-[9px] font-mono text-slate-500">{d.date}</div>
                      <div className="text-[10px] font-bold">{d.count}</div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Modality + Priority */}
            <div className="grid gap-4 md:grid-cols-2">
              <section className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                <h2 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-slate-500">
                  By modality
                </h2>
                {Object.entries(stats.byModality)
                  .sort(([, a], [, b]) => b - a)
                  .map(([mod, n]) => {
                    const max = Math.max(...Object.values(stats.byModality));
                    return (
                      <div key={mod} className="mb-1.5 flex items-center gap-2 text-xs">
                        <span className="w-10 font-mono text-slate-400">{mod}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded bg-slate-800">
                          <div
                            className="h-full bg-cyan-500"
                            style={{ width: `${(n / max) * 100}%` }}
                          />
                        </div>
                        <span className="w-8 text-right font-bold">{n}</span>
                      </div>
                    );
                  })}
              </section>

              <section className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                <h2 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-slate-500">
                  By priority
                </h2>
                {(['P1', 'P2', 'P3', 'P4', 'P5'] as const).map((p) => {
                  const n = stats.byPriority[p] ?? 0;
                  const max = Math.max(...Object.values(stats.byPriority), 1);
                  const color =
                    p === 'P1'
                      ? 'bg-rose-500'
                      : p === 'P2'
                        ? 'bg-orange-500'
                        : p === 'P3'
                          ? 'bg-cyan-500'
                          : 'bg-slate-600';
                  return (
                    <div key={p} className="mb-1.5 flex items-center gap-2 text-xs">
                      <span className="w-10 font-mono text-slate-400">{p}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded bg-slate-800">
                        <div className={`h-full ${color}`} style={{ width: `${(n / max) * 100}%` }} />
                      </div>
                      <span className="w-8 text-right font-bold">{n}</span>
                    </div>
                  );
                })}
              </section>
            </div>

            {/* Business note */}
            <section className="rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/5 p-4 text-xs">
              <div className="mb-2 flex items-center gap-2 font-bold text-fuchsia-300">
                <TrendingUp className="h-3 w-3" />
                Business
              </div>
              <div className="text-slate-300">
                Based on Rad AI marketing (60 min/shift saved), midcine's ~
                <span className="font-bold text-fuchsia-300">{stats.minutesSaved}</span> minutes
                saved via AI Impression alone equal roughly{' '}
                <span className="font-bold text-fuchsia-300">
                  {Math.round((stats.minutesSaved / 60) * 100) / 100}
                </span>{' '}
                additional billing hours. At Saudi radiologist median rate (~150 SAR/h) that's a
                floor value of{' '}
                <span className="font-bold text-fuchsia-300">
                  {Math.round((stats.minutesSaved / 60) * 150).toLocaleString()} SAR
                </span>{' '}
                — well past the $79/mo subscription.
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: 'cyan' | 'emerald' | 'fuchsia' | 'rose';
}) {
  const bg: Record<string, string> = {
    cyan: 'border-cyan-500/30 bg-cyan-500/5 text-cyan-300',
    emerald: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300',
    fuchsia: 'border-fuchsia-500/30 bg-fuchsia-500/5 text-fuchsia-300',
    rose: 'border-rose-500/30 bg-rose-500/5 text-rose-300',
  };
  return (
    <div className={`rounded-lg border p-4 ${bg[color]}`}>
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest opacity-80">
        {icon} {label}
      </div>
      <div className="text-2xl font-black">{value}</div>
      {sub && <div className="mt-0.5 text-[10px] opacity-70">{sub}</div>}
    </div>
  );
}
