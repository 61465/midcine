'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Shield, Search, RefreshCw, User, FileText, AlertTriangle } from 'lucide-react';
import { fetchAuditRecent, type AuditEntry } from '../../lib/studies';

const ACTION_ICONS: Record<string, { icon: any; color: string }> = {
  'study.created': { icon: FileText, color: 'text-cyan-400' },
  'study.deleted': { icon: FileText, color: 'text-rose-400' },
  'study.dicom_uploaded': { icon: FileText, color: 'text-emerald-400' },
  'study.zip_extracted': { icon: FileText, color: 'text-emerald-400' },
  'report.signed': { icon: Shield, color: 'text-amber-400' },
  'report.sent': { icon: FileText, color: 'text-fuchsia-400' },
  'ai.impression_generated': { icon: FileText, color: 'text-cyan-400' },
  'ai.critical_alert': { icon: AlertTriangle, color: 'text-rose-400' },
  'ai.compare_generated': { icon: FileText, color: 'text-fuchsia-400' },
  'patient.upserted': { icon: User, color: 'text-cyan-400' },
  'waitlist.joined': { icon: User, color: 'text-emerald-400' },
};

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await fetchAuditRecent('default', 500);
      setEntries(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const uniqueActions = useMemo(() => {
    return Array.from(new Set(entries.map((e) => e.action))).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return entries.filter((e) => {
      if (actionFilter && e.action !== actionFilter) return false;
      if (!ql) return true;
      return (
        e.action.toLowerCase().includes(ql) ||
        JSON.stringify(e.target ?? {}).toLowerCase().includes(ql) ||
        JSON.stringify(e.meta ?? {}).toLowerCase().includes(ql) ||
        (e.actor?.id ?? '').toLowerCase().includes(ql)
      );
    });
  }, [entries, q, actionFilter]);

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
          <Shield className="h-4 w-4 text-cyan-400" />
          <span className="text-sm font-bold">Audit log</span>
          <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-400">
            {filtered.length} / {entries.length}
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            className="ml-auto flex items-center gap-1 rounded bg-slate-800 px-3 py-1 text-xs hover:bg-slate-700"
          >
            <RefreshCw className={loading ? 'h-3 w-3 animate-spin' : 'h-3 w-3'} />
            Refresh
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search action, target, actor, meta…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-950 py-1.5 pl-7 pr-2 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
            />
          </div>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"
          >
            <option value="">All actions ({entries.length})</option>
            {uniqueActions.map((a) => (
              <option key={a} value={a}>
                {a} ({entries.filter((e) => e.action === a).length})
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
          <table className="w-full text-xs">
            <thead className="bg-slate-900 text-[10px] uppercase tracking-widest text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Timestamp</th>
                <th className="px-3 py-2 text-left">Action</th>
                <th className="px-3 py-2 text-left">Actor</th>
                <th className="px-3 py-2 text-left">Target</th>
                <th className="px-3 py-2 text-left">Meta</th>
                <th className="px-3 py-2 text-right">OK</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    No audit entries match this filter.
                  </td>
                </tr>
              )}
              {filtered.map((e, i) => {
                const info = ACTION_ICONS[e.action] ?? {
                  icon: FileText,
                  color: 'text-slate-400',
                };
                const Icon = info.icon;
                return (
                  <tr
                    key={i}
                    className={
                      'border-t border-slate-900 ' +
                      (e.action.startsWith('ai.critical') ? 'bg-rose-500/5' : '')
                    }
                  >
                    <td className="px-3 py-1.5 font-mono text-[10px] text-slate-500">
                      {new Date(e.ts).toLocaleString()}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className={`inline-flex items-center gap-1.5 font-bold ${info.color}`}>
                        <Icon className="h-3 w-3" />
                        {e.action}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-slate-400">{e.actor?.id ?? e.actor?.type ?? '—'}</td>
                    <td className="px-3 py-1.5 font-mono text-[10px] text-slate-400">
                      {e.target ? `${e.target.type}:${e.target.id}` : '—'}
                    </td>
                    <td className="max-w-xs truncate px-3 py-1.5 font-mono text-[10px] text-slate-500">
                      {e.meta ? JSON.stringify(e.meta) : '—'}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {e.ok ? (
                        <span className="text-emerald-400">✓</span>
                      ) : (
                        <span className="text-rose-400">✗</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-[10px] text-slate-500">
          Audit log is append-only in <code className="rounded bg-slate-800 px-1">data/audit/</code>{' '}
          on the bridge. Retention is unlimited by default — configure rotation via env{' '}
          <code className="rounded bg-slate-800 px-1">MIDCINE_AUDIT_RETENTION_DAYS</code>. Every AI
          call, sign, send, upload, delete, and login is recorded here.
        </div>
      </main>
    </div>
  );
}
