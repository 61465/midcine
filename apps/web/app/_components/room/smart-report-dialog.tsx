'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Search,
  FileText,
  Sparkles,
  Loader2,
  Download,
  Copy,
  BookOpen,
  Filter,
  Check,
} from 'lucide-react';

interface TemplateSummary {
  id: string;
  modality: string;
  region: string;
  sub_region?: string;
  condition: string;
  is_normal: boolean;
  filename: string;
  preview?: string;
  text_ok?: boolean;
  score?: number;
}

interface SmartReport {
  ok?: boolean;
  latency_ms?: number;
  templates_used?: string[];
  normal_reference?: string | null;
  title?: string;
  technique?: string;
  clinical_indication?: string;
  findings_focused?: string;
  impression?: string[];
  recommendations?: string[];
  confidence?: number;
  template_used?: string;
  normal_sentences_removed?: number;
  language?: string;
  parse_error?: boolean;
  error?: string;
}

const MODALITIES = ['MRI', 'CT', 'US', 'X-Ray', 'IR', 'Isotope'];

export function SmartReportDialog({
  studyUid,
  modality: initialModality,
  bodyPart: initialBody,
  findings: initialFindings,
  symptoms: initialSymptoms,
  clinicalHistory,
  age,
  sex,
  preselectedTemplateId,
  onClose,
}: {
  studyUid: string;
  modality?: string | null;
  bodyPart?: string | null;
  findings?: string | null;
  symptoms?: string | null;
  clinicalHistory?: string | null;
  age?: number | null;
  sex?: string | null;
  preselectedTemplateId?: string | null;
  onClose: () => void;
}) {
  const [modality, setModality] = useState((initialModality || '').toUpperCase());
  const [body, setBody] = useState(initialBody || '');
  const [findings, setFindings] = useState(initialFindings || '');
  const [symptoms, setSymptoms] = useState(initialSymptoms || '');
  const [query, setQuery] = useState('');
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loadingT, setLoadingT] = useState(false);
  const [selectedTid, setSelectedTid] = useState<string | null>(preselectedTemplateId ?? null);

  const [report, setReport] = useState<SmartReport | null>(null);
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Normalize modality display → backend expects "MRI" | "CT" | "US" | "X-Ray" | "IR" | "Isotope"
  const canonicalModality = useMemo(() => {
    const up = modality.toUpperCase();
    if (up.startsWith('MR')) return 'MRI';
    if (up.startsWith('CT')) return 'CT';
    if (up.startsWith('U')) return 'US';
    if (up.startsWith('X') || up === 'CR' || up === 'DX') return 'X-Ray';
    if (up.startsWith('I')) return 'IR';
    return up;
  }, [modality]);

  const abortRef = useRef<AbortController | null>(null);
  const runSearch = useCallback(async () => {
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setLoadingT(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (canonicalModality) params.set('modality', canonicalModality);
      if (body) params.set('body_part', body);
      params.set('limit', '30');

      const path = query
        ? `/api/mcp/templates/search?${params.toString()}`
        : `/api/mcp/templates/browse?${new URLSearchParams({
            modality: canonicalModality,
            region: body,
          }).toString()}`;
      const r = await fetch(path, { signal: ctl.signal });
      const d = await r.json();
      if (!d?.ok) throw new Error('search failed');
      setTemplates(d.items || []);
    } catch (e) {
      if ((e as Error).name !== 'AbortError')
        setErr(String((e as Error).message ?? e));
    } finally {
      setLoadingT(false);
    }
  }, [query, canonicalModality, body]);

  useEffect(() => {
    void runSearch();
  }, [runSearch]);

  const generate = useCallback(async () => {
    setGenerating(true);
    setErr(null);
    setReport(null);
    try {
      const r = await fetch('/api/mcp/ai/smart-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          study_uid: studyUid,
          modality: canonicalModality,
          body_part: body,
          findings,
          symptoms,
          clinical_history: clinicalHistory ?? '',
          patient_age: age ?? undefined,
          patient_sex: sex ?? undefined,
          template_id: selectedTid ?? undefined,
        }),
      });
      const d: SmartReport = await r.json();
      if (!d?.ok) throw new Error(d?.error ?? 'generation failed');
      setReport(d);
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    } finally {
      setGenerating(false);
    }
  }, [
    studyUid,
    canonicalModality,
    body,
    findings,
    symptoms,
    clinicalHistory,
    age,
    sex,
    selectedTid,
  ]);

  const fullReportText = useMemo(() => {
    if (!report) return '';
    const bullets = (a?: string[]) =>
      (a || []).map((x, i) => `${i + 1}. ${x}`).join('\n');
    return [
      report.title || 'Radiology Report',
      '',
      `TECHNIQUE:\n${report.technique || ''}`,
      '',
      `CLINICAL INDICATION:\n${report.clinical_indication || ''}`,
      '',
      `FINDINGS:\n${report.findings_focused || ''}`,
      '',
      `IMPRESSION:\n${bullets(report.impression)}`,
      '',
      `RECOMMENDATIONS:\n${bullets(report.recommendations)}`,
      '',
      report.confidence != null
        ? `Confidence: ${Math.round((report.confidence || 0) * 100)}%`
        : '',
      report.templates_used?.length
        ? `Reference templates: ${report.templates_used.join('; ')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
  }, [report]);

  const download = useCallback(
    (fmt: 'txt' | 'html' | 'md') => {
      if (!fullReportText) return;
      const stem = `report-${studyUid.slice(-10)}`;
      let blob: Blob;
      if (fmt === 'html') {
        const esc = (s: string) =>
          s
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br/>');
        blob = new Blob(
          [
            `<!doctype html><html><head><meta charset="utf-8"><title>${
              report?.title ?? 'Report'
            }</title><style>body{font-family:Arial,Helvetica,sans-serif;max-width:800px;margin:2rem auto;padding:1rem;color:#111;line-height:1.6}h1{border-bottom:2px solid #333}</style></head><body><h1>${
              report?.title ?? 'Radiology Report'
            }</h1><div>${esc(fullReportText)}</div></body></html>`,
          ],
          { type: 'text/html;charset=utf-8' },
        );
      } else if (fmt === 'md') {
        blob = new Blob([`# ${report?.title ?? 'Report'}\n\n${fullReportText}`], {
          type: 'text/markdown;charset=utf-8',
        });
      } else {
        blob = new Blob([fullReportText], { type: 'text/plain;charset=utf-8' });
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${stem}.${fmt}`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [fullReportText, studyUid, report],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm">
      <div className="flex h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-cyan-500/20 bg-slate-950 shadow-2xl">
        {/* header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-cyan-400" />
            <div>
              <div className="text-sm font-bold text-slate-100">
                Smart Report
              </div>
              <div className="text-[10px] text-slate-500">
                Choose a matching template; AI strips normal lines and writes a focused pathology report (English).
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* body: 3 columns */}
        <div className="grid min-h-0 flex-1 gap-3 overflow-hidden p-3 md:grid-cols-[280px_320px_1fr]">
          {/* col 1: filters */}
          <div className="flex min-h-0 flex-col gap-3 overflow-auto">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <div className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-cyan-300">
                <Filter className="h-3 w-3" /> Filters
              </div>
              <label className="mb-2 block text-[10px] text-slate-400">
                Modality
                <select
                  value={canonicalModality}
                  onChange={(e) => setModality(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
                >
                  <option value="">— any —</option>
                  {MODALITIES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mb-2 block text-[10px] text-slate-400">
                Body region (e.g. Brain, Abdomen, Chest)
                <input
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Brain"
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
                />
              </label>
              <label className="block text-[10px] text-slate-400">
                Search condition
                <div className="mt-1 flex items-center gap-1 rounded border border-slate-700 bg-slate-950 px-2">
                  <Search className="h-3 w-3 text-slate-500" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="e.g. infarction, cyst, hemorrhage"
                    className="flex-1 bg-transparent py-1.5 text-xs text-slate-200 focus:outline-none"
                  />
                </div>
              </label>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-cyan-300">
                Case Findings
              </div>
              <textarea
                value={findings}
                onChange={(e) => setFindings(e.target.value)}
                rows={4}
                dir="auto"
                placeholder="Radiologist findings (or leave blank to let AI infer from templates)"
                className="w-full resize-y rounded border border-slate-800 bg-slate-950 p-2 text-[11px] text-slate-200 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
              />
              <div className="mb-1 mt-2 text-[10px] font-bold uppercase tracking-widest text-cyan-300">
                Symptoms
              </div>
              <textarea
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
                rows={2}
                dir="auto"
                className="w-full resize-y rounded border border-slate-800 bg-slate-950 p-2 text-[11px] text-slate-200 focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={generate}
              disabled={generating}
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-500 py-3 text-sm font-bold text-slate-950 hover:from-fuchsia-400 hover:to-cyan-400 disabled:opacity-50"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Generate Smart Report
            </button>

            {err && (
              <div className="rounded border border-rose-500/40 bg-rose-500/10 p-2 text-[10px] text-rose-300">
                {err}
              </div>
            )}
          </div>

          {/* col 2: template list */}
          <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
            <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              <span>Templates ({templates.length})</span>
              {loadingT && <Loader2 className="h-3 w-3 animate-spin text-cyan-400" />}
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-2">
              {templates.length === 0 && !loadingT && (
                <div className="p-4 text-center text-[11px] text-slate-500">
                  No templates match. Try a broader search or clear filters.
                </div>
              )}
              {templates.map((t) => {
                const active = selectedTid === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTid(active ? null : t.id)}
                    className={
                      'mb-1 flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition ' +
                      (active
                        ? 'bg-cyan-500/15 ring-1 ring-cyan-500/40'
                        : 'hover:bg-slate-800/60')
                    }
                  >
                    {active ? (
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" />
                    ) : (
                      <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <span
                          className={
                            'rounded px-1 text-[9px] font-bold ' +
                            (t.is_normal
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-fuchsia-500/20 text-fuchsia-300')
                          }
                        >
                          {t.is_normal ? 'NORMAL' : 'PATH'}
                        </span>
                        <span className="text-[9px] text-slate-500">
                          {t.modality} · {t.region}
                        </span>
                      </div>
                      <div className="truncate text-[11px] font-bold text-slate-200">
                        {t.condition}
                      </div>
                      {t.preview && (
                        <div className="truncate text-[10px] text-slate-500">
                          {t.preview}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="border-t border-slate-800 px-3 py-2 text-[10px] text-slate-500">
              Tap a template to force AI to use it. Otherwise AI picks the best matches automatically.
            </div>
          </div>

          {/* col 3: report */}
          <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-cyan-500/20 bg-gradient-to-b from-slate-900/60 to-slate-950/60">
            <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-slate-100">
                  {report?.title || 'Generated report will appear here'}
                </div>
                {report && (
                  <div className="text-[10px] text-slate-500">
                    {report.latency_ms}ms · templates:{' '}
                    {report.templates_used?.length ?? 0} · normals removed:{' '}
                    {report.normal_sentences_removed ?? 0} · confidence:{' '}
                    {Math.round((report.confidence ?? 0) * 100)}%
                  </div>
                )}
              </div>
              {report && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(fullReportText)}
                    className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-700"
                  >
                    <Copy className="h-3 w-3" /> Copy
                  </button>
                  <button
                    type="button"
                    onClick={() => download('html')}
                    className="flex items-center gap-1 rounded bg-cyan-500/20 px-2 py-1 text-[10px] text-cyan-200 hover:bg-cyan-500/40"
                  >
                    <Download className="h-3 w-3" /> HTML
                  </button>
                  <button
                    type="button"
                    onClick={() => download('txt')}
                    className="rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-700"
                  >
                    .txt
                  </button>
                  <button
                    type="button"
                    onClick={() => download('md')}
                    className="rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-700"
                  >
                    .md
                  </button>
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-4">
              {!report && !generating && (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-slate-500">
                  <Sparkles className="h-10 w-10 text-cyan-500/40" />
                  <div className="max-w-md text-xs">
                    Fill Findings + Symptoms (optional) → pick a template (optional) → press{' '}
                    <b className="text-cyan-300">Generate</b>. AI reads matching NORMAL +
                    PATHOLOGY templates from the 1200+ library and writes an English report
                    focused only on abnormal findings.
                  </div>
                </div>
              )}
              {generating && (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
                  <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
                  <div className="text-xs">
                    Reading templates + composing focused report…
                  </div>
                </div>
              )}
              {report && (
                <div className="space-y-4 text-sm text-slate-200">
                  <Section label="Technique">{report.technique}</Section>
                  <Section label="Clinical Indication">
                    {report.clinical_indication}
                  </Section>
                  <Section label="Findings" highlight>
                    {report.findings_focused}
                  </Section>
                  <BulletBlock
                    label="Impression"
                    items={report.impression ?? []}
                    tone="cyan"
                  />
                  <BulletBlock
                    label="Recommendations"
                    items={report.recommendations ?? []}
                    tone="fuchsia"
                  />
                  {(report.templates_used?.length ?? 0) > 0 && (
                    <div className="rounded border border-slate-800 bg-slate-950/60 p-2 text-[10px] text-slate-500">
                      References:{' '}
                      {report.templates_used?.map((f) => (
                        <span key={f} className="mr-2 rounded bg-slate-800 px-1.5 py-0.5">
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                  {report.parse_error && (
                    <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[10px] text-amber-300">
                      Warning: model returned non-strict JSON; body shown as raw text.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({
  label,
  children,
  highlight,
}: {
  label: string;
  children?: React.ReactNode;
  highlight?: boolean;
}) {
  if (!children) return null;
  return (
    <div
      className={
        'rounded-lg border p-3 ' +
        (highlight
          ? 'border-cyan-500/30 bg-slate-950/60'
          : 'border-slate-800 bg-slate-950/40')
      }
    >
      <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-cyan-300">
        {label}
      </div>
      <div className="whitespace-pre-wrap text-[13px] leading-relaxed">{children}</div>
    </div>
  );
}

function BulletBlock({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone: 'cyan' | 'fuchsia';
}) {
  if (!items?.length) return null;
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
      <div
        className={
          'mb-1 text-[10px] font-bold uppercase tracking-widest ' +
          (tone === 'cyan' ? 'text-cyan-300' : 'text-fuchsia-300')
        }
      >
        {label}
      </div>
      <ol className="list-decimal space-y-1 pl-5 text-[13px]">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ol>
    </div>
  );
}
