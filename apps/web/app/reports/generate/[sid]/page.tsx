'use client';

/**
 * /reports/generate/[sid]
 *
 * Two-column result page for the "New blank report" flow.
 *   LEFT (~40%): extracted patient identity + medical history + list of source
 *   reports with excerpts.
 *   RIGHT (~60%): the freshly-drafted critical-only report, styled like the
 *   source reports, editable, with copy/download/translate actions.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  ClipboardCopy,
  Download,
  Sparkles,
  User,
  Stethoscope,
  AlertTriangle,
  FileText,
  Trash2,
  Check,
  BookOpen,
} from 'lucide-react';

interface Medication {
  drug?: string;
  dose?: string;
  reason?: string;
}

interface VitalOrLab {
  name?: string;
  value?: string;
  date?: string;
}

interface PriorImaging {
  modality?: string;
  region?: string;
  date?: string;
  impression?: string;
}

interface ExtractedReport {
  filename?: string;
  language?: string;
  report_type?: string;
  date?: string;
  author?: string;
  summary?: string;
  key_findings?: string[];
}

interface CriticalReportSection {
  heading?: string;
  content?: string;
}

interface CriticalReport {
  title?: string;
  style_reference_filename?: string;
  language?: string;
  sections?: CriticalReportSection[];
  impression?: string[];
  recommendations?: string[];
  urgency?: string;
  confidence?: number;
  error?: string;
  parse_error?: boolean;
  raw?: string;
}

interface ReportSession {
  ok?: boolean;
  session_id?: string;
  title?: string;
  saved_at?: number;
  latency_ms?: number;
  source_count?: number;
  sources?: { name: string; kind: string; size: number }[];
  patient?: {
    name?: string;
    age?: number | null;
    sex?: string;
    mrn?: string;
    date_of_birth?: string;
    phone?: string;
    address?: string;
    occupation?: string;
  };
  clinical_history?: string;
  symptoms?: string;
  prior_diagnoses?: string[];
  medications?: Medication[];
  allergies?: string[];
  surgeries?: string[];
  family_history?: string;
  social_history?: { smoking?: string; alcohol?: string };
  vitals_labs?: VitalOrLab[];
  prior_imaging?: PriorImaging[];
  extracted_reports?: ExtractedReport[];
  red_flags?: string[];
  critical_report?: CriticalReport;
  error?: string;
}

const URGENCY_TONE: Record<string, string> = {
  routine: 'bg-slate-800 text-slate-300',
  urgent: 'bg-amber-500/20 text-amber-300',
  stat: 'bg-rose-500/20 text-rose-300',
};

export default function GenerateReportPage() {
  const params = useParams<{ sid: string }>();
  const sid = params?.sid ?? '';
  const [data, setData] = useState<ReportSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [copiedAt, setCopiedAt] = useState<number>(0);

  useEffect(() => {
    if (!sid) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/mcp/ai/report-sessions/${encodeURIComponent(sid)}`);
        const j = await r.json();
        if (cancelled) return;
        if (!j?.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
        setData(j);
      } catch (e) {
        if (!cancelled) setErr(String((e as Error).message ?? e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sid]);

  const reportPlainText = useMemo(() => {
    const r = data?.critical_report;
    if (!r) return '';
    const parts: string[] = [];
    if (r.title) parts.push(r.title.toUpperCase());
    (r.sections ?? []).forEach((s) => {
      if (s.heading) parts.push(`\n${s.heading}\n${'-'.repeat(s.heading.length)}`);
      if (s.content) parts.push(s.content);
    });
    if (r.impression && r.impression.length > 0) {
      parts.push('\nIMPRESSION\n----------');
      r.impression.forEach((b, i) => parts.push(`${i + 1}. ${b}`));
    }
    if (r.recommendations && r.recommendations.length > 0) {
      parts.push('\nRECOMMENDATIONS\n---------------');
      r.recommendations.forEach((b, i) => parts.push(`${i + 1}. ${b}`));
    }
    return parts.join('\n');
  }, [data]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reportPlainText);
      setCopiedAt(Date.now());
    } catch {
      /* ignore */
    }
  };

  const download = () => {
    const blob = new Blob([reportPlainText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data?.title ?? 'report'}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const del = async () => {
    if (!sid) return;
    if (!confirm('Delete this report session? This cannot be undone.')) return;
    try {
      await fetch(`/api/mcp/ai/report-sessions/${encodeURIComponent(sid)}`, {
        method: 'DELETE',
      });
      window.location.href = '/reports';
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* header */}
      <div className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/reports"
              className="rounded p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
              aria-label="Back to Reports"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <Sparkles className="h-5 w-5 text-fuchsia-400" />
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-slate-100">
                {data?.title ?? 'Critical-only report'}
              </div>
              <div className="text-[10px] text-slate-500">
                {data?.source_count ?? 0} source report
                {(data?.source_count ?? 0) === 1 ? '' : 's'} · session {sid.slice(0, 20)}
                {data?.latency_ms ? ` · ${(data.latency_ms / 1000).toFixed(1)}s` : ''}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={copy}
              disabled={!reportPlainText}
              className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-700 hover:text-cyan-300 disabled:opacity-40"
            >
              {Date.now() - copiedAt < 2000 ? (
                <Check className="h-3 w-3 text-emerald-300" />
              ) : (
                <ClipboardCopy className="h-3 w-3" />
              )}
              Copy
            </button>
            <button
              type="button"
              onClick={download}
              disabled={!reportPlainText}
              className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-700 hover:text-cyan-300 disabled:opacity-40"
            >
              <Download className="h-3 w-3" />
              Download
            </button>
            <button
              type="button"
              onClick={del}
              className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-500 hover:bg-rose-500/20 hover:text-rose-300"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-5">
        {loading && (
          <div className="rounded border border-slate-800 bg-slate-900/40 p-6 text-center text-slate-500">
            Loading session…
          </div>
        )}
        {err && (
          <div className="rounded border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">
            {err}
          </div>
        )}
        {data && !loading && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            {/* LEFT — extracted info */}
            <div className="space-y-4 lg:col-span-2">
              <IdentityCard patient={data.patient} />
              <HistoryCard
                clinicalHistory={data.clinical_history}
                symptoms={data.symptoms}
                familyHistory={data.family_history}
                social={data.social_history}
                priorDx={data.prior_diagnoses}
                medications={data.medications}
                allergies={data.allergies}
                surgeries={data.surgeries}
                vitalsLabs={data.vitals_labs}
                priorImaging={data.prior_imaging}
              />
              {(data.red_flags ?? []).length > 0 && (
                <RedFlagsCard flags={data.red_flags!} />
              )}
              <SourceReportsCard reports={data.extracted_reports ?? []} />
            </div>

            {/* RIGHT — critical report */}
            <div className="space-y-4 lg:col-span-3">
              <CriticalReportCard report={data.critical_report} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function IdentityCard({ patient }: { patient: ReportSession['patient'] }) {
  const p = patient ?? {};
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
      <div className="mb-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-cyan-400">
        <User className="h-3 w-3" /> Patient identity
      </div>
      <div className="space-y-1 text-[12px]">
        <Row label="Name" value={p.name} dir="auto" />
        <Row label="Age" value={p.age != null ? String(p.age) : undefined} />
        <Row label="Sex" value={p.sex} />
        <Row label="MRN" value={p.mrn} />
        <Row label="DOB" value={p.date_of_birth} />
        <Row label="Phone" value={p.phone} />
        <Row label="Address" value={p.address} dir="auto" />
        <Row label="Occupation" value={p.occupation} dir="auto" />
      </div>
    </div>
  );
}

function HistoryCard(props: {
  clinicalHistory?: string;
  symptoms?: string;
  familyHistory?: string;
  social?: { smoking?: string; alcohol?: string };
  priorDx?: string[];
  medications?: Medication[];
  allergies?: string[];
  surgeries?: string[];
  vitalsLabs?: VitalOrLab[];
  priorImaging?: PriorImaging[];
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
      <div className="mb-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-400">
        <Stethoscope className="h-3 w-3" /> Medical context
      </div>
      <div className="space-y-3 text-[12px]">
        {props.symptoms && (
          <Block title="Symptoms" body={props.symptoms} tone="fuchsia" />
        )}
        {props.clinicalHistory && (
          <Block title="Clinical history" body={props.clinicalHistory} tone="cyan" />
        )}
        {(props.priorDx ?? []).length > 0 && (
          <ListBlock title="Prior diagnoses" items={props.priorDx!} tone="amber" />
        )}
        {(props.medications ?? []).length > 0 && (
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Medications
            </div>
            <ul className="space-y-0.5 pl-1 text-[11px] text-slate-300">
              {props.medications!.map((m, i) => (
                <li key={i}>
                  <span className="text-slate-100">{m.drug ?? '?'}</span>
                  {m.dose && <span className="text-slate-500"> · {m.dose}</span>}
                  {m.reason && <span className="text-slate-500"> · {m.reason}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {(props.allergies ?? []).length > 0 && (
          <ListBlock title="Allergies" items={props.allergies!} tone="rose" />
        )}
        {(props.surgeries ?? []).length > 0 && (
          <ListBlock title="Prior surgeries" items={props.surgeries!} tone="slate" />
        )}
        {(props.vitalsLabs ?? []).length > 0 && (
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Vitals / labs
            </div>
            <ul className="space-y-0.5 pl-1 text-[11px] text-slate-300">
              {props.vitalsLabs!.map((v, i) => (
                <li key={i}>
                  <span className="text-slate-100">{v.name ?? '?'}</span>
                  {v.value && <span className="text-slate-400"> = {v.value}</span>}
                  {v.date && <span className="text-slate-600"> · {v.date}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {(props.priorImaging ?? []).length > 0 && (
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Prior imaging
            </div>
            <ul className="space-y-1 pl-1 text-[11px] text-slate-300">
              {props.priorImaging!.map((pi, i) => (
                <li key={i}>
                  <span className="rounded bg-cyan-500/15 px-1 py-0.5 text-[9px] text-cyan-300">
                    {pi.modality ?? '?'}
                  </span>{' '}
                  <span className="text-slate-100">{pi.region ?? ''}</span>
                  {pi.date && <span className="text-slate-500"> · {pi.date}</span>}
                  {pi.impression && (
                    <div className="pl-4 text-slate-500">{pi.impression}</div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {props.familyHistory && (
          <Block title="Family history" body={props.familyHistory} tone="slate" />
        )}
        {(props.social?.smoking || props.social?.alcohol) && (
          <div className="text-[11px] text-slate-400">
            {props.social?.smoking && <span>Smoking: {props.social.smoking}</span>}
            {props.social?.smoking && props.social?.alcohol && ' · '}
            {props.social?.alcohol && <span>Alcohol: {props.social.alcohol}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function RedFlagsCard({ flags }: { flags: string[] }) {
  return (
    <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3">
      <div className="mb-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-rose-300">
        <AlertTriangle className="h-3 w-3" /> Red flags
      </div>
      <ul className="list-disc space-y-1 pl-4 text-[12px] text-rose-100">
        {flags.map((f, i) => (
          <li key={i}>{f}</li>
        ))}
      </ul>
    </div>
  );
}

function SourceReportsCard({ reports }: { reports: ExtractedReport[] }) {
  if (reports.length === 0) return null;
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
      <div className="mb-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
        <BookOpen className="h-3 w-3" /> Source reports ({reports.length})
      </div>
      <div className="space-y-2">
        {reports.map((r, i) => (
          <div
            key={i}
            className="rounded border border-slate-800 bg-slate-950/60 p-2 text-[11px]"
          >
            <div className="flex items-center justify-between">
              <div className="truncate text-slate-100">
                <FileText className="mr-1 inline h-3 w-3 text-slate-500" />
                {r.filename ?? `Source ${i + 1}`}
              </div>
              <div className="flex items-center gap-1">
                {r.report_type && (
                  <span className="rounded bg-slate-800 px-1 py-0.5 text-[9px] text-slate-400">
                    {r.report_type}
                  </span>
                )}
                {r.date && (
                  <span className="text-[9px] text-slate-500">{r.date}</span>
                )}
              </div>
            </div>
            {r.author && (
              <div className="mt-0.5 text-[10px] text-slate-500">By {r.author}</div>
            )}
            {r.summary && (
              <div className="mt-1 text-[11px] text-slate-300">{r.summary}</div>
            )}
            {(r.key_findings ?? []).length > 0 && (
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-slate-400">
                {r.key_findings!.map((k, j) => (
                  <li key={j}>{k}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CriticalReportCard({ report }: { report?: CriticalReport }) {
  if (!report) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-center text-sm text-slate-500">
        No report was generated.
      </div>
    );
  }
  if (report.error) {
    return (
      <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">
        <div className="mb-1 font-bold">Report generation failed</div>
        <div>{report.error}</div>
      </div>
    );
  }
  const urgencyKey = (report.urgency ?? 'routine').toLowerCase();
  const tone = URGENCY_TONE[urgencyKey] ?? URGENCY_TONE.routine;

  return (
    <div className="rounded-xl border border-fuchsia-500/30 bg-slate-900/80 shadow-lg">
      <div className="border-b border-slate-800 bg-slate-950/60 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-fuchsia-400" />
            <div className="text-sm font-bold text-slate-100">
              {report.title ?? 'Critical-only report'}
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px]">
            <span className={`rounded px-2 py-0.5 font-bold uppercase ${tone}`}>
              {urgencyKey}
            </span>
            {report.confidence != null && (
              <span className="text-slate-500">
                confidence {(report.confidence * 100).toFixed(0)}%
              </span>
            )}
          </div>
        </div>
        {report.style_reference_filename && (
          <div className="mt-1 text-[10px] text-slate-500">
            Style mirrored from <span className="text-cyan-300">{report.style_reference_filename}</span>
          </div>
        )}
      </div>
      <div className="space-y-4 p-4">
        {(report.sections ?? []).map((s, i) => (
          <section key={i}>
            {s.heading && (
              <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-cyan-300">
                {s.heading}
              </div>
            )}
            {s.content && (
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-100" dir="auto">
                {s.content}
              </div>
            )}
          </section>
        ))}
        {(report.impression ?? []).length > 0 && (
          <section className="rounded border border-slate-800 bg-slate-950/60 p-3">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-fuchsia-300">
              Impression
            </div>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-100">
              {report.impression!.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ol>
          </section>
        )}
        {(report.recommendations ?? []).length > 0 && (
          <section className="rounded border border-slate-800 bg-slate-950/60 p-3">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-emerald-300">
              Recommendations
            </div>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-100">
              {report.recommendations!.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ol>
          </section>
        )}
        {report.parse_error && (
          <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-200">
            <div className="mb-1 font-bold">Warning: model output could not be
              fully parsed as JSON. Raw text preserved below.</div>
            <pre className="whitespace-pre-wrap text-[10px] text-amber-100">
              {report.raw ?? ''}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- helpers ----------

function Row({
  label,
  value,
  dir,
}: {
  label: string;
  value?: string | null;
  dir?: 'ltr' | 'rtl' | 'auto';
}) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <div className="w-20 shrink-0 text-[10px] uppercase tracking-widest text-slate-500">
        {label}
      </div>
      <div className="text-slate-100" dir={dir ?? 'ltr'}>
        {value}
      </div>
    </div>
  );
}

function Block({
  title,
  body,
  tone,
}: {
  title: string;
  body: string;
  tone: 'cyan' | 'fuchsia' | 'slate' | 'emerald' | 'amber' | 'rose';
}) {
  const toneCls =
    tone === 'cyan'
      ? 'text-cyan-300'
      : tone === 'fuchsia'
      ? 'text-fuchsia-300'
      : tone === 'emerald'
      ? 'text-emerald-300'
      : tone === 'amber'
      ? 'text-amber-300'
      : tone === 'rose'
      ? 'text-rose-300'
      : 'text-slate-400';
  return (
    <div>
      <div className={`mb-1 text-[10px] font-bold uppercase tracking-widest ${toneCls}`}>
        {title}
      </div>
      <div className="whitespace-pre-wrap text-[12px] text-slate-200" dir="auto">
        {body}
      </div>
    </div>
  );
}

function ListBlock({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: 'cyan' | 'fuchsia' | 'slate' | 'emerald' | 'amber' | 'rose';
}) {
  const toneCls =
    tone === 'cyan'
      ? 'text-cyan-300'
      : tone === 'fuchsia'
      ? 'text-fuchsia-300'
      : tone === 'emerald'
      ? 'text-emerald-300'
      : tone === 'amber'
      ? 'text-amber-300'
      : tone === 'rose'
      ? 'text-rose-300'
      : 'text-slate-400';
  return (
    <div>
      <div className={`mb-1 text-[10px] font-bold uppercase tracking-widest ${toneCls}`}>
        {title}
      </div>
      <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-slate-300">
        {items.map((v, i) => (
          <li key={i} dir="auto">
            {v}
          </li>
        ))}
      </ul>
    </div>
  );
}
