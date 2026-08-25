'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Search,
  AlertTriangle,
  FileText,
  Download,
  Loader2,
  User,
  LogOut,
  ArrowLeft,
} from 'lucide-react';
import { fetchStudies, type Study } from '../../lib/studies';

const PRIORITY_COLOR: Record<string, string> = {
  P1: 'bg-rose-500 text-white',
  P2: 'bg-orange-500 text-white',
  P3: 'bg-cyan-500 text-slate-950',
  P4: 'bg-slate-500 text-white',
  P5: 'bg-slate-700 text-slate-300',
};

interface Section {
  key: string;
  title_ar: string;
  content_ar: string;
}

interface Report {
  study_uid: string;
  sections: Section[];
  signed_by?: string | null;
  signed_at?: string | null;
}

export default function ReferrerDashboard() {
  const [name, setName] = useState<string | null>(null);
  const [, setPhone] = useState('');
  const [studies, setStudies] = useState<Study[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalReport, setModalReport] = useState<Report | null>(null);
  const [modalStudy, setModalStudy] = useState<Study | null>(null);
  const [filters, setFilters] = useState({ modality: '', dateRange: 'all', search: '' });

  useEffect(() => {
    const savedName = localStorage.getItem('midcine.referrerName') || null;
    const savedPhone = localStorage.getItem('midcine.referrerPhone') || '';
    setName(savedName);
    setPhone(savedPhone);
    if (savedName) void refresh();
    const interval = setInterval(() => savedName && void refresh(), 30_000);
    return () => clearInterval(interval);
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      const all = await fetchStudies();
      setStudies(all);
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    if (!name) return [];
    const nameLower = name.toLowerCase();
    return studies.filter((s) => {
      const matchesReferrer = (s.referrer ?? '').toLowerCase().includes(nameLower);
      if (!matchesReferrer) return false;
      if (filters.modality && s.modality !== filters.modality) return false;
      if (filters.dateRange !== 'all') {
        const days = filters.dateRange === '7d' ? 7 : 30;
        const cutoff = Date.now() - days * 86400000;
        if (new Date(s.study_date).getTime() < cutoff) return false;
      }
      if (filters.search) {
        const q = filters.search.toLowerCase();
        if (!s.patient_name.toLowerCase().includes(q) && !s.patient_id.toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [studies, filters, name]);

  const stats = useMemo(
    () => ({
      total: filtered.length,
      urgent: filtered.filter((s) => s.priority === 'P1' || s.priority === 'P2').length,
      signed: filtered.filter((s) => s.status === 'signed').length,
      awaiting: filtered.filter((s) => s.status !== 'signed').length,
    }),
    [filtered],
  );

  async function openReport(s: Study) {
    setModalStudy(s);
    setModalReport(null);
    try {
      const r = await fetch(`/api/mcp/reports/${encodeURIComponent(s.study_uid)}`);
      if (r.ok) {
        const d = await r.json();
        setModalReport(d);
      }
    } catch {}
  }

  async function download(kind: 'pdf' | 'sr', uid: string, patient: string) {
    try {
      const r = await fetch(`/api/mcp/reports/${encodeURIComponent(uid)}/${kind}`);
      if (!r.ok) return;
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${patient.replace(/\s+/g, '_')}_${uid.slice(-8)}.${kind === 'pdf' ? 'pdf' : 'dcm'}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
  }

  if (!name) {
    return (
      <div className="min-h-screen bg-[#0A0E14] p-6 text-slate-200">
        <div className="mx-auto mt-16 max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-8">
          <div className="mb-6 flex items-center gap-2">
            <User className="h-5 w-5 text-cyan-400" />
            <h1 className="text-lg font-bold">Referring Physician Portal</h1>
          </div>
          <p className="mb-5 text-xs text-slate-400">
            Enter your details once to see reports the radiologist has assigned to you. Reports
            refresh every 30 seconds.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const el = e.currentTarget as HTMLFormElement;
              const n = (el.elements.namedItem('name') as HTMLInputElement).value.trim();
              const p = (el.elements.namedItem('phone') as HTMLInputElement).value.trim();
              if (!n) return;
              localStorage.setItem('midcine.referrerName', n);
              localStorage.setItem('midcine.referrerPhone', p);
              setName(n);
              setPhone(p);
              void refresh();
            }}
            className="space-y-3"
          >
            <label className="block text-[11px]">
              <span className="text-slate-400">Full name (as radiologist wrote it)</span>
              <input
                name="name"
                type="text"
                placeholder="Dr. Ahmed / ER · Ortho clinic · ..."
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-2 text-slate-200 focus:border-cyan-500 focus:outline-none"
                autoFocus
                required
              />
              <span className="mt-0.5 block text-[9px] text-slate-600">
                Must match the "Referrer" field on the study exactly (case-insensitive)
              </span>
            </label>
            <label className="block text-[11px]">
              <span className="text-slate-400">Phone (for WhatsApp delivery)</span>
              <input
                name="phone"
                type="tel"
                placeholder="+9665..."
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-2 text-slate-200 focus:border-cyan-500 focus:outline-none"
              />
            </label>
            <button
              type="submit"
              className="w-full rounded bg-cyan-500 py-2 text-sm font-bold text-slate-950 hover:bg-cyan-400"
            >
              Enter portal
            </button>
          </form>
          <div className="mt-4 text-center">
            <Link href="/" className="text-[10px] text-slate-500 hover:text-slate-300">
              ← Back to home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0E14] text-slate-200">
      <header className="border-b border-slate-800 bg-slate-950 px-6 py-3">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-cyan-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Home
          </Link>
          <div className="h-4 w-px bg-slate-800" />
          <User className="h-4 w-4 text-cyan-400" />
          <span className="text-sm font-bold">Referring Portal · Dr. {name}</span>
          <div className="ml-auto flex items-center gap-3 text-[10px]">
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded bg-slate-800 px-2 py-1 hover:bg-slate-700"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem('midcine.referrerName');
                localStorage.removeItem('midcine.referrerPhone');
                setName(null);
              }}
              className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 hover:bg-slate-700"
              title="Sign out"
            >
              <LogOut className="h-3 w-3" />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-6">
        {/* KPI cards */}
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Assigned" value={stats.total} color="cyan" />
          <Kpi label="Urgent (P1/P2)" value={stats.urgent} color="rose" icon={<AlertTriangle className="h-3 w-3" />} />
          <Kpi label="Signed" value={stats.signed} color="emerald" />
          <Kpi label="Awaiting sign" value={stats.awaiting} color="amber" />
        </div>

        {/* Filter bar */}
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 p-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search patient name / MRN"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="w-full rounded border border-slate-700 bg-slate-900 py-1.5 pl-7 pr-2 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
            />
          </div>
          <select
            value={filters.modality}
            onChange={(e) => setFilters({ ...filters, modality: e.target.value })}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200"
          >
            <option value="">All modalities</option>
            {['CT', 'MR', 'CR', 'DR', 'US', 'MG', 'NM', 'PT'].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <select
            value={filters.dateRange}
            onChange={(e) => setFilters({ ...filters, dateRange: e.target.value })}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200"
          >
            <option value="all">All time</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
        </div>

        {/* Table */}
        {loading && studies.length === 0 ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-12 text-center">
            <FileText className="mx-auto mb-3 h-8 w-8 text-slate-600" />
            <div className="text-sm font-bold text-slate-300">No reports assigned yet</div>
            <div className="mt-1 text-xs text-slate-500">
              Ask the radiologist to add <span className="font-mono text-cyan-400">Dr. {name}</span>{' '}
              as referrer on new studies. This page auto-refreshes every 30 seconds.
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950">
            <table className="w-full text-xs">
              <thead className="bg-slate-900 text-[10px] uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Patient</th>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Modality</th>
                  <th className="px-3 py-2 text-left">Priority</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.study_uid} className="border-t border-slate-900 hover:bg-slate-900/50">
                    <td className="px-3 py-2">
                      <div className="font-bold text-slate-200">{s.patient_name}</div>
                      <div className="text-[10px] text-slate-500">{s.patient_id}</div>
                    </td>
                    <td className="px-3 py-2 text-slate-400">
                      {new Date(s.study_date).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 text-cyan-400">
                      {s.modality} · {s.body_part}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-bold ${PRIORITY_COLOR[s.priority] ?? 'bg-slate-700 text-slate-300'}`}
                      >
                        {s.priority}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          s.status === 'signed'
                            ? 'text-emerald-400'
                            : s.status === 'read'
                              ? 'text-cyan-400'
                              : 'text-amber-400'
                        }
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openReport(s)}
                          className="flex items-center gap-1 rounded bg-cyan-500/20 px-2 py-0.5 text-[10px] text-cyan-300 hover:bg-cyan-500/40"
                        >
                          <FileText className="h-3 w-3" />
                          Report
                        </button>
                        <button
                          type="button"
                          onClick={() => download('pdf', s.study_uid, s.patient_name)}
                          className="flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-slate-700"
                          title="PDF"
                        >
                          <Download className="h-3 w-3" />
                          PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => download('sr', s.study_uid, s.patient_name)}
                          className="flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-slate-700"
                          title="DICOM SR"
                        >
                          <Download className="h-3 w-3" />
                          SR
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Report modal */}
      {modalStudy && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => {
            setModalStudy(null);
            setModalReport(null);
          }}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 border-b border-slate-800 pb-3">
              <div className="text-xs text-slate-500">
                {modalStudy.modality} · {modalStudy.body_part} ·{' '}
                {new Date(modalStudy.study_date).toLocaleDateString()}
              </div>
              <div className="text-lg font-bold">{modalStudy.patient_name}</div>
              <div className="mt-1 text-[10px] text-slate-500">MRN {modalStudy.patient_id}</div>
              {modalStudy.symptoms && (
                <div className="mt-2 rounded bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">
                  <span className="font-bold">Symptoms:</span> {modalStudy.symptoms}
                </div>
              )}
            </div>
            {!modalReport ? (
              <div className="py-8 text-center">
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-cyan-400" />
                <div className="mt-2 text-[11px] text-slate-500">Loading report…</div>
              </div>
            ) : (
              <div className="space-y-4">
                {modalReport.sections.map((sec) => (
                  <div key={sec.key}>
                    <h3 className="mb-1 text-[10px] font-bold uppercase tracking-widest text-cyan-400">
                      {sec.key.charAt(0).toUpperCase() + sec.key.slice(1)}
                    </h3>
                    <div dir="auto" className="whitespace-pre-wrap text-sm text-slate-200">
                      {sec.content_ar}
                    </div>
                  </div>
                ))}
                {modalReport.signed_at && (
                  <div className="border-t border-slate-800 pt-3 text-[10px] text-slate-500">
                    Signed by <span className="font-bold text-slate-300">{modalReport.signed_by}</span>{' '}
                    · {new Date(modalReport.signed_at).toLocaleString()}
                  </div>
                )}
              </div>
            )}
            <div className="mt-4 flex justify-between gap-2 border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => download('pdf', modalStudy.study_uid, modalStudy.patient_name)}
                className="flex items-center gap-1 rounded bg-cyan-500/20 px-3 py-1.5 text-[11px] font-bold text-cyan-300 hover:bg-cyan-500/40"
              >
                <Download className="h-3 w-3" />
                Download PDF
              </button>
              <button
                type="button"
                onClick={() => {
                  setModalStudy(null);
                  setModalReport(null);
                }}
                className="rounded border border-slate-700 px-3 py-1.5 text-[11px] text-slate-300 hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: 'cyan' | 'rose' | 'emerald' | 'amber';
  icon?: React.ReactNode;
}) {
  const bg: Record<string, string> = {
    cyan: 'border-cyan-500/30 bg-cyan-500/5 text-cyan-300',
    rose: 'border-rose-500/30 bg-rose-500/5 text-rose-300',
    emerald: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300',
    amber: 'border-amber-500/30 bg-amber-500/5 text-amber-300',
  };
  return (
    <div className={`rounded-lg border p-3 ${bg[color]}`}>
      <div className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest opacity-80">
        {icon} {label}
      </div>
      <div className="text-xl font-black">{value}</div>
    </div>
  );
}
