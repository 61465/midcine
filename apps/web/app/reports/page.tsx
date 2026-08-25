'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  BookOpen,
  Search,
  FileText,
  Sparkles,
  Library,
  Filter,
  Paperclip,
  FolderTree,
  ClipboardList,
} from 'lucide-react';
import { fetchStudies, type Study } from '../../lib/studies';
import { SmartReportDialog } from '../_components/room/smart-report-dialog';
import { PatientReportDialog } from '../_components/room/patient-report-dialog';
import { NewBlankReportDialog } from '../_components/room/new-blank-report-dialog';

interface LibraryStats {
  count: number;
  extracted_ok: number;
  modalities: { modality: string; count: number }[];
}

interface TemplateBrowseItem {
  id: string;
  modality: string;
  region: string;
  sub_region?: string;
  condition: string;
  is_normal: boolean;
  filename: string;
  text_ok?: boolean;
}

type Tab = 'studies' | 'templates';

export default function ReportsPage() {
  const [studies, setStudies] = useState<Study[]>([]);
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [modality, setModality] = useState('');
  const [openStudy, setOpenStudy] = useState<Study | null>(null);
  const [attachStudy, setAttachStudy] = useState<Study | null>(null);
  const [openBlank, setOpenBlank] = useState(false);
  const [openNewBlankDialog, setOpenNewBlankDialog] = useState(false);
  const [tab, setTab] = useState<Tab>('studies');
  const [templates, setTemplates] = useState<TemplateBrowseItem[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesErr, setTemplatesErr] = useState<string | null>(null);
  const [tplModality, setTplModality] = useState('');
  const [tplRegion, setTplRegion] = useState('');
  const [tplQuery, setTplQuery] = useState('');
  const [tplPickerFor, setTplPickerFor] = useState<TemplateBrowseItem | null>(null);
  const [preselectedTemplateId, setPreselectedTemplateId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, r] = await Promise.all([
          fetchStudies(),
          fetch('/api/mcp/templates/index').then((x) => x.json()),
        ]);
        if (cancelled) return;
        setStudies(s);
        if (r?.ok) setStats(r);
      } catch (e) {
        if (!cancelled) setErr(String((e as Error).message ?? e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch templates when switching to the Templates tab OR when filters change
  useEffect(() => {
    if (tab !== 'templates') return;
    let cancelled = false;
    (async () => {
      setTemplatesLoading(true);
      setTemplatesErr(null);
      try {
        const params = new URLSearchParams();
        if (tplQuery.trim()) params.set('q', tplQuery.trim());
        if (tplModality) params.set('modality', tplModality);
        if (tplRegion) params.set('body_part', tplRegion);
        params.set('limit', '60');
        const path = tplQuery.trim()
          ? `/api/mcp/templates/search?${params.toString()}`
          : `/api/mcp/templates/browse?${new URLSearchParams({
              modality: tplModality,
              region: tplRegion,
            }).toString()}`;
        const r = await fetch(path);
        const j = await r.json();
        if (cancelled) return;
        if (!j?.ok) throw new Error(j?.error ?? 'template fetch failed');
        setTemplates(j.items ?? []);
      } catch (e) {
        if (!cancelled) setTemplatesErr(String((e as Error).message ?? e));
      } finally {
        if (!cancelled) setTemplatesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, tplModality, tplRegion, tplQuery]);

  const templatesGrouped = useMemo(() => {
    const map = new Map<string, TemplateBrowseItem[]>();
    for (const t of templates) {
      const key = `${t.modality} · ${t.region || '—'}`;
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [templates]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return studies.filter((s) => {
      if (modality && (s.modality || '').toUpperCase() !== modality.toUpperCase())
        return false;
      if (!query) return true;
      return [
        s.patient_name,
        s.patient_id,
        s.body_part,
        s.modality,
        s.symptoms,
        s.clinical_history,
        s.description,
      ]
        .filter(Boolean)
        .some((f) => (f || '').toLowerCase().includes(query));
    });
  }, [studies, q, modality]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* header */}
      <div className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="rounded p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
              aria-label="Home"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <BookOpen className="h-5 w-5 text-cyan-400" />
            <div>
              <div className="text-sm font-bold text-slate-100">
                Reports
              </div>
              <div className="text-[10px] text-slate-500">
                Generate focused radiology reports from 1200+ curated templates. English output, on-demand Arabic translation.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/room"
              className="rounded bg-slate-800 px-3 py-1.5 text-[11px] text-slate-300 hover:bg-slate-700"
            >
              Reading Room
            </Link>
            <button
              type="button"
              onClick={() => setOpenNewBlankDialog(true)}
              className="flex items-center gap-1 rounded-lg bg-gradient-to-r from-fuchsia-500 to-cyan-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:from-fuchsia-400 hover:to-cyan-400"
              title="Upload reference reports → AI extracts info + drafts a critical-only report in the same style"
            >
              <Sparkles className="h-3.5 w-3.5" />
              New blank report
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-5">
        {/* tabs */}
        <div className="mb-4 flex items-center gap-1 border-b border-slate-800">
          <TabButton
            active={tab === 'studies'}
            onClick={() => setTab('studies')}
            icon={<ClipboardList className="h-3.5 w-3.5" />}
            label="Studies"
            hint="Generate a report for one of your imaging studies"
          />
          <TabButton
            active={tab === 'templates'}
            onClick={() => setTab('templates')}
            icon={<FolderTree className="h-3.5 w-3.5" />}
            label={`Templates${stats ? ` · ${stats.count}` : ''}`}
            hint="Browse the raw 1200+ template library"
          />
        </div>

        {/* library stats */}
        {stats && tab === 'studies' && (
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            <StatCard label="Total templates" value={stats.count} tone="cyan" />
            <StatCard label="Extracted OK" value={stats.extracted_ok} tone="emerald" />
            {stats.modalities.map((m) => (
              <StatCard
                key={m.modality}
                label={m.modality}
                value={m.count}
                tone="fuchsia"
                onClick={() => setModality(m.modality)}
              />
            ))}
          </div>
        )}

        {tab === 'studies' && (<>
        {/* filters + start-blank */}
        <div className="mb-4 flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3 md:flex-row md:items-center">
          <div className="flex flex-1 items-center gap-2 rounded border border-slate-700 bg-slate-950 px-2">
            <Search className="h-3.5 w-3.5 text-slate-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search patient / body part / symptoms…"
              className="flex-1 bg-transparent py-2 text-xs text-slate-200 focus:outline-none"
              dir="auto"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-slate-500" />
            <select
              value={modality}
              onChange={(e) => setModality(e.target.value)}
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
            >
              <option value="">All modalities</option>
              <option value="MRI">MRI</option>
              <option value="CT">CT</option>
              <option value="US">US</option>
              <option value="X-Ray">X-Ray</option>
              <option value="IR">IR</option>
              <option value="Isotope">Isotope</option>
            </select>
            {(q || modality) && (
              <button
                type="button"
                onClick={() => {
                  setQ('');
                  setModality('');
                }}
                className="rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-400 hover:bg-slate-700"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* results */}
        {loading && (
          <div className="rounded border border-slate-800 bg-slate-900/40 p-6 text-center text-slate-500">
            Loading studies…
          </div>
        )}
        {err && (
          <div className="rounded border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">
            {err}
          </div>
        )}
        {!loading && !err && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {filtered.length === 0 && (
              <div className="col-span-full rounded border border-slate-800 bg-slate-900/40 p-6 text-center text-sm text-slate-500">
                No studies match. Try “New blank report” for a standalone template report.
              </div>
            )}
            {filtered.map((s) => (
              <div
                key={s.study_uid}
                className="flex flex-col items-start gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-left transition hover:border-cyan-500/40 hover:bg-slate-800/50"
              >
                <div className="flex w-full items-center justify-between">
                  <span className="rounded bg-cyan-500/15 px-2 py-0.5 text-[10px] font-bold text-cyan-300">
                    {s.modality || '?'}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {s.study_date?.slice(0, 10)}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-slate-100" dir="auto">
                    {s.patient_name || '(unnamed)'}
                  </div>
                  <div className="truncate text-[11px] text-slate-500">
                    {s.body_part || '—'} · {s.patient_id}
                  </div>
                </div>
                {s.symptoms && (
                  <div className="line-clamp-2 text-[11px] text-slate-400" dir="auto">
                    {s.symptoms}
                  </div>
                )}
                <div className="mt-auto flex w-full items-center justify-between pt-1 text-[10px]">
                  <span
                    className={
                      'rounded px-1.5 py-0.5 ' +
                      (s.status === 'signed'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-slate-800 text-slate-400')
                    }
                  >
                    {s.status || 'draft'}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAttachStudy(s);
                      }}
                      className="flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-slate-300 hover:bg-slate-700 hover:text-cyan-300"
                      title="Attach patient-brought report"
                    >
                      <Paperclip className="h-3 w-3" /> Attach
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenStudy(s)}
                      className="flex items-center gap-1 text-cyan-300 hover:text-cyan-200"
                    >
                      <FileText className="h-3 w-3" /> Open report →
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        </>)}

        {tab === 'templates' && (
          <TemplatesTab
            items={templates}
            grouped={templatesGrouped}
            loading={templatesLoading}
            err={templatesErr}
            modality={tplModality}
            region={tplRegion}
            query={tplQuery}
            onModality={setTplModality}
            onRegion={setTplRegion}
            onQuery={setTplQuery}
            stats={stats}
            onPick={(t) => setTplPickerFor(t)}
          />
        )}

        {/* footer note */}
        <div className="mt-6 flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-[11px] text-slate-400">
          <Library className="mt-0.5 h-4 w-4 text-cyan-400" />
          <div>
            Every generated report is written in English by default and can be
            translated to Arabic on demand. Reports strip normal-baseline sentences and
            keep only the abnormal / pathologic findings — as requested by the
            supervising physician.
          </div>
        </div>
      </div>

      {/* dialog */}
      {openStudy && (
        <SmartReportDialog
          studyUid={openStudy.study_uid}
          modality={openStudy.modality}
          bodyPart={openStudy.body_part}
          findings={openStudy.suggested_finding ?? ''}
          symptoms={openStudy.symptoms}
          clinicalHistory={openStudy.clinical_history}
          age={openStudy.age}
          sex={openStudy.sex}
          preselectedTemplateId={preselectedTemplateId}
          onClose={() => {
            setOpenStudy(null);
            setPreselectedTemplateId(null);
          }}
        />
      )}
      {openBlank && (
        <SmartReportDialog
          studyUid={'blank'}
          modality={modality || 'MRI'}
          bodyPart={''}
          findings={''}
          symptoms={''}
          preselectedTemplateId={preselectedTemplateId}
          onClose={() => {
            setOpenBlank(false);
            setPreselectedTemplateId(null);
          }}
        />
      )}
      {attachStudy && (
        <PatientReportDialog
          studyUid={attachStudy.study_uid}
          modality={attachStudy.modality}
          bodyPart={attachStudy.body_part}
          onClose={() => setAttachStudy(null)}
        />
      )}
      {openNewBlankDialog && (
        <NewBlankReportDialog onClose={() => setOpenNewBlankDialog(false)} />
      )}
      {tplPickerFor && (
        <TemplateStudyPicker
          template={tplPickerFor}
          studies={studies}
          onCancel={() => setTplPickerFor(null)}
          onPick={(study) => {
            setTplPickerFor(null);
            if (study) {
              setOpenStudy(study);
              // template will be applied via preselectedTemplateId below
              setPreselectedTemplateId(tplPickerFor.id);
            } else {
              setOpenBlank(true);
              setPreselectedTemplateId(tplPickerFor.id);
            }
          }}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: number | string;
  tone: 'cyan' | 'emerald' | 'fuchsia';
  onClick?: () => void;
}) {
  const toneCls =
    tone === 'cyan'
      ? 'text-cyan-300'
      : tone === 'emerald'
      ? 'text-emerald-300'
      : 'text-fuchsia-300';
  const Component: 'button' | 'div' = onClick ? 'button' : 'div';
  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={
        'rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-left ' +
        (onClick ? 'hover:border-cyan-500/40 hover:bg-slate-800/50' : '')
      }
    >
      <div className="text-[10px] uppercase tracking-widest text-slate-500">
        {label}
      </div>
      <div className={`text-2xl font-bold ${toneCls}`}>{value}</div>
    </Component>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className={
        'flex items-center gap-1.5 border-b-2 px-3 py-2 text-[11px] font-bold transition ' +
        (active
          ? 'border-cyan-400 text-cyan-300'
          : 'border-transparent text-slate-500 hover:text-slate-300')
      }
    >
      {icon}
      {label}
    </button>
  );
}

function TemplatesTab({
  items,
  grouped,
  loading,
  err,
  modality,
  region,
  query,
  onModality,
  onRegion,
  onQuery,
  stats,
  onPick,
}: {
  items: TemplateBrowseItem[];
  grouped: [string, TemplateBrowseItem[]][];
  loading: boolean;
  err: string | null;
  modality: string;
  region: string;
  query: string;
  onModality: (v: string) => void;
  onRegion: (v: string) => void;
  onQuery: (v: string) => void;
  stats: LibraryStats | null;
  onPick: (t: TemplateBrowseItem) => void;
}) {
  return (
    <div>
      {stats && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          <StatCard label="Total" value={stats.count} tone="cyan" />
          <StatCard
            label="Text OK"
            value={`${stats.extracted_ok}/${stats.count}`}
            tone="emerald"
          />
          {stats.modalities.map((m) => (
            <StatCard
              key={m.modality}
              label={m.modality}
              value={m.count}
              tone="fuchsia"
              onClick={() => onModality(m.modality)}
            />
          ))}
        </div>
      )}

      <div className="mb-4 flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3 md:flex-row md:items-center">
        <div className="flex flex-1 items-center gap-2 rounded border border-slate-700 bg-slate-950 px-2">
          <Search className="h-3.5 w-3.5 text-slate-500" />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search condition / keyword (e.g. 'lung nodule', 'stroke')…"
            className="flex-1 bg-transparent py-2 text-xs text-slate-200 focus:outline-none"
            dir="auto"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-slate-500" />
          <select
            value={modality}
            onChange={(e) => onModality(e.target.value)}
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
          >
            <option value="">All modalities</option>
            <option value="MRI">MRI</option>
            <option value="CT">CT</option>
            <option value="US">US</option>
            <option value="X-Ray">X-Ray</option>
            <option value="IR">IR</option>
            <option value="Isotope">Isotope</option>
          </select>
          <input
            value={region}
            onChange={(e) => onRegion(e.target.value)}
            placeholder="Region…"
            className="w-28 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
          />
          {(modality || region || query) && (
            <button
              type="button"
              onClick={() => {
                onModality('');
                onRegion('');
                onQuery('');
              }}
              className="rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-400 hover:bg-slate-700"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="rounded border border-slate-800 bg-slate-900/40 p-6 text-center text-slate-500">
          Loading templates…
        </div>
      )}
      {err && (
        <div className="rounded border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">
          {err}
        </div>
      )}
      {!loading && !err && items.length === 0 && (
        <div className="rounded border border-slate-800 bg-slate-900/40 p-6 text-center text-sm text-slate-500">
          No templates match. Try clearing filters or a shorter keyword.
        </div>
      )}

      {!loading && !err && items.length > 0 && (
        <div className="space-y-4">
          <div className="text-[11px] text-slate-500">
            {items.length} template{items.length === 1 ? '' : 's'} · grouped by
            modality + region
          </div>
          {grouped.map(([groupKey, groupItems]) => (
            <div
              key={groupKey}
              className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40"
            >
              <div className="border-b border-slate-800 bg-slate-950/60 px-3 py-1.5 text-[11px] font-bold text-cyan-300">
                {groupKey}{' '}
                <span className="text-slate-500">· {groupItems.length}</span>
              </div>
              <table className="w-full text-[11px]">
                <thead className="bg-slate-950/40 text-[10px] uppercase tracking-widest text-slate-500">
                  <tr>
                    <th className="px-3 py-1.5 text-left">Condition</th>
                    <th className="px-3 py-1.5 text-left">Sub-region</th>
                    <th className="px-3 py-1.5 text-left">File</th>
                    <th className="px-3 py-1.5 text-left">Type</th>
                    <th className="px-3 py-1.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {groupItems.map((t) => (
                    <tr
                      key={t.id}
                      className="border-t border-slate-800 hover:bg-slate-800/40"
                    >
                      <td className="px-3 py-1.5 font-bold text-slate-200">
                        {t.condition}
                      </td>
                      <td className="px-3 py-1.5 text-slate-400">
                        {t.sub_region || '—'}
                      </td>
                      <td className="px-3 py-1.5 truncate text-slate-500">
                        {t.filename}
                      </td>
                      <td className="px-3 py-1.5">
                        {t.is_normal ? (
                          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-400">
                            Normal
                          </span>
                        ) : (
                          <span className="rounded bg-fuchsia-500/15 px-1.5 py-0.5 text-[9px] text-fuchsia-300">
                            Pathology
                          </span>
                        )}
                        {t.text_ok === false && (
                          <span
                            className="ml-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] text-amber-300"
                            title="Text extraction failed for this template"
                          >
                            !text
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => onPick(t)}
                          className="inline-flex items-center gap-1 rounded bg-cyan-500/20 px-2 py-0.5 text-[10px] font-bold text-cyan-200 hover:bg-cyan-500/30"
                        >
                          <Sparkles className="h-3 w-3" />
                          Use
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateStudyPicker({
  template,
  studies,
  onCancel,
  onPick,
}: {
  template: TemplateBrowseItem;
  studies: Study[];
  onCancel: () => void;
  onPick: (study: Study | null) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur"
      onClick={onCancel}
    >
      <div
        className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-4 py-3">
          <div>
            <div className="text-sm font-bold text-slate-100">Use template</div>
            <div className="text-[10px] text-slate-500">
              {template.modality} · {template.region} · {template.condition}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
          >
            ×
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-3">
          <div className="mb-2 text-[11px] text-slate-400">
            Pick a study to attach this report to, or start a blank report.
          </div>
          <button
            type="button"
            onClick={() => onPick(null)}
            className="mb-3 flex w-full items-center gap-2 rounded border border-fuchsia-500/40 bg-fuchsia-500/10 px-3 py-2 text-left text-xs text-fuchsia-200 hover:bg-fuchsia-500/20"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Start blank report with this template
          </button>
          <div className="space-y-2">
            {studies.length === 0 && (
              <div className="rounded border border-slate-800 bg-slate-900/40 p-4 text-center text-[11px] text-slate-500">
                No studies yet.
              </div>
            )}
            {studies.map((s) => (
              <button
                type="button"
                key={s.study_uid}
                onClick={() => onPick(s)}
                className="flex w-full items-center justify-between gap-2 rounded border border-slate-800 bg-slate-900/60 px-3 py-2 text-left hover:border-cyan-500/40 hover:bg-slate-800/50"
              >
                <div className="min-w-0">
                  <div className="truncate text-xs font-bold text-slate-100" dir="auto">
                    {s.patient_name || '(unnamed)'}
                  </div>
                  <div className="truncate text-[10px] text-slate-500">
                    {s.modality || '?'} · {s.body_part || '—'} · {s.patient_id}
                  </div>
                </div>
                <span className="shrink-0 rounded bg-cyan-500/15 px-2 py-0.5 text-[10px] text-cyan-300">
                  Attach →
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
