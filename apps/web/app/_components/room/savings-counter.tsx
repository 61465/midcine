'use client';

import { useEffect, useState } from 'react';
import { Clock, TrendingUp } from 'lucide-react';

const STORAGE_KEY = 'midcine.stats.v1';
const MINUTES_PER_MANUAL_REPORT = 15;
const MINUTES_PER_MIDCINE_REPORT = 1.5;

interface Stats {
  reports: { ts: number; wasSigned: boolean }[];
  weekStart: number;
}

function currentWeekStart(): number {
  const d = new Date();
  const diff = d.getDay() === 0 ? 6 : d.getDay() - 1;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function load(): Stats {
  if (typeof window === 'undefined') return { reports: [], weekStart: currentWeekStart() };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { reports: [], weekStart: currentWeekStart() };
    const parsed = JSON.parse(raw) as Stats;
    if (parsed.weekStart !== currentWeekStart()) {
      return { reports: [], weekStart: currentWeekStart() };
    }
    return parsed;
  } catch {
    return { reports: [], weekStart: currentWeekStart() };
  }
}

function save(stats: Stats): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
}

export function recordSignedReport(): void {
  const stats = load();
  stats.reports.push({ ts: Date.now(), wasSigned: true });
  save(stats);
  window.dispatchEvent(new Event('midcine:stats-updated'));
}

export function SavingsCounter({ compact = false }: { compact?: boolean }) {
  const [stats, setStats] = useState<Stats>({ reports: [], weekStart: currentWeekStart() });

  useEffect(() => {
    setStats(load());
    const handler = () => setStats(load());
    window.addEventListener('midcine:stats-updated', handler);
    return () => window.removeEventListener('midcine:stats-updated', handler);
  }, []);

  const signed = stats.reports.filter((r) => r.wasSigned).length;
  const minutesSaved = signed * (MINUTES_PER_MANUAL_REPORT - MINUTES_PER_MIDCINE_REPORT);
  const hoursSaved = minutesSaved / 60;

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 rounded-full bg-slate-800/60 px-2.5 py-1 text-[10px] text-slate-300">
        <Clock className="h-3 w-3 text-cyan-400" />
        <span className="font-mono">
          {hoursSaved >= 1 ? `${hoursSaved.toFixed(1)}h` : `${Math.round(minutesSaved)}m`}
        </span>
        <span className="text-slate-500">saved</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-widest text-slate-500">
        <TrendingUp className="h-3 w-3" />
        This week
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-black text-cyan-400">
          {hoursSaved >= 1 ? hoursSaved.toFixed(1) : Math.round(minutesSaved)}
        </span>
        <span className="text-xs text-slate-400">
          {hoursSaved >= 1 ? 'hours saved' : 'minutes saved'}
        </span>
      </div>
      <div className="mt-2 text-[10px] text-slate-500">
        {signed} reports signed · vs {(signed * MINUTES_PER_MANUAL_REPORT).toFixed(0)} min manual
      </div>
    </div>
  );
}
