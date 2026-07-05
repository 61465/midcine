'use client';

import { useEffect, useMemo, useState } from 'react';
import { Sparkles, Loader2, PenLine, Send, ChevronDown, Wand2 } from 'lucide-react';
import type { PipelineResponse, StudyMetadata } from '../../../lib/mcp';
import { runPipeline } from '../../../lib/mcp';
import {
  generateReport,
  signReport,
  sendReportOnWhatsApp,
  type FinalReport,
  type ReportSection,
} from '../../../lib/report';
import { snippetsForContext, findSnippetByTrigger } from './templates';
import { recordSignedReport } from './savings-counter';

interface Props {
  study: StudyMetadata;
  onSigned?: (report: FinalReport) => void;
}

const SECTION_ORDER: ReportSection['key'][] = [
  'patient',
  'technique',
  'findings',
  'impression',
  'recommendations',
];

const SECTION_TITLE: Record<string, string> = {
  patient: 'Patient',
  technique: 'Technique',
  findings: 'Findings',
  impression: 'Impression',
  recommendations: 'Recommendations',
};

const STORAGE_KEY = (uid: string) => `midcine.report.v2.${uid}`;

function loadDraft(uid: string): Partial<Record<ReportSection['key'], string>> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY(uid));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveDraft(uid: string, sections: ReportSection[]) {
  if (typeof window === 'undefined') return;
  const map: Partial<Record<ReportSection['key'], string>> = {};
  for (const s of sections) map[s.key] = s.content_ar;
  window.localStorage.setItem(STORAGE_KEY(uid), JSON.stringify(map));
}

type State =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'ready'; pipeline: PipelineResponse; report: FinalReport }
  | { kind: 'error'; msg: string };

export function ReportComposer({ study, onSigned }: Props) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [signOpen, setSignOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setState({ kind: 'running' });
    (async () => {
      try {
        const pipeline = await runPipeline(study);
        const report = await generateReport(study, pipeline.aggregate, pipeline.outputs);
        const draft = loadDraft(study.study_uid);
        if (draft) {
          report.sections = report.sections.map((s) =>
            draft[s.key] != null ? { ...s, content_ar: draft[s.key]! } : s,
          );
        }
        setState({ kind: 'ready', pipeline, report });
      } catch (e) {
        setState({ kind: 'error', msg: String(e) });
      }
    })();
  }, [study.study_uid]);

  const report = state.kind === 'ready' ? state.report : null;
  const orderedSections = useMemo(() => {
    if (!report) return [];
    const map = new Map(report.sections.map((s) => [s.key, s]));
    return SECTION_ORDER.map((k) => map.get(k)).filter((s): s is ReportSection => !!s);
  }, [report]);

  function updateSection(key: string, next: string) {
    if (state.kind !== 'ready') return;
    const snip = findSnippetByTrigger(next);
    if (snip && snip.section === key) {
      next = next.slice(0, -snip.trigger.length) + snip.body_ar;
    }
    const sections = state.report.sections.map((s) =>
      s.key === key ? { ...s, content_ar: next } : s,
    );
    setState({ ...state, report: { ...state.report, sections } });
    saveDraft(study.study_uid, sections);
  }

  async function doSign(signedBy: string, licenseNo: string) {
    if (state.kind !== 'ready') return;
    setBusy(true);
    try {
      const signed = await signReport(state.report, signedBy, licenseNo);
      setState({ ...state, report: signed });
      recordSignedReport();
      setSignOpen(false);
      onSigned?.(signed);
    } finally {
      setBusy(false);
    }
  }

  async function doSend() {
    if (state.kind !== 'ready' || !state.report.signed_at) return;
    setBusy(true);
    try {
      const phone = window.localStorage.getItem('midcine.lastReferrerPhone') ?? '+201000000000';
      const name = window.localStorage.getItem('midcine.lastReferrerName') ?? 'Referrer';
      await sendReportOnWhatsApp(state.report, phone, name, 'report_to_doctor');
      window.dispatchEvent(new CustomEvent('midcine:toast', { detail: { text: 'Message sent' } }));
    } catch (e) {
      window.dispatchEvent(
        new CustomEvent('midcine:toast', { detail: { text: `Send failed: ${e}` } }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-950 text-slate-200">
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/60 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-cyan-500/20 text-cyan-400">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-200">Report</div>
            <div className="text-[10px] text-slate-500">
              {state.kind === 'running' && 'AI working…'}
              {state.kind === 'ready' && !report?.signed_at && 'Editable'}
              {state.kind === 'ready' && report?.signed_at && `Signed by ${report.signed_by}`}
              {state.kind === 'error' && `Error: ${state.msg.slice(0, 40)}`}
            </div>
          </div>
        </div>
      </div>

      {state.kind === 'running' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
          <div className="text-xs">Drafting from 4 AI agents…</div>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="flex-1 p-4 text-center text-xs text-rose-400">Failed: {state.msg}</div>
      )}

      {report && (
        <>
          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {orderedSections.map((s) => (
              <SectionBlock
                key={s.key}
                section={s}
                modality={study.modality}
                bodyPart={study.body_part}
                onChange={(text) => updateSection(s.key, text)}
                disabled={!!report.signed_at}
              />
            ))}
          </div>

          <div className="flex items-center gap-2 border-t border-slate-800 bg-slate-900/60 p-2">
            {!report.signed_at ? (
              <button
                type="button"
                onClick={() => setSignOpen(true)}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-amber-500/20 py-2 text-xs font-bold text-amber-300 hover:bg-amber-500/30"
                title="Sign (S)"
              >
                <PenLine className="h-3.5 w-3.5" />
                Sign (S)
              </button>
            ) : (
              <button
                type="button"
                onClick={doSend}
                disabled={busy}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500/20 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50"
                title="Send via WhatsApp (W)"
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                Send (W)
              </button>
            )}
          </div>

          {signOpen && (
            <SignDialog onCancel={() => setSignOpen(false)} onConfirm={doSign} busy={busy} />
          )}
        </>
      )}
    </div>
  );
}

function SectionBlock({
  section,
  modality,
  bodyPart,
  onChange,
  disabled,
}: {
  section: ReportSection;
  modality: string;
  bodyPart: string;
  onChange: (text: string) => void;
  disabled: boolean;
}) {
  const [showTemplates, setShowTemplates] = useState(false);
  const templates = snippetsForContext(section.key as any, modality, bodyPart);

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-1.5">
        <span className="text-[11px] font-bold text-slate-300">
          {SECTION_TITLE[section.key] ?? section.title_ar}
        </span>
        {templates.length > 0 && !disabled && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowTemplates((v) => !v)}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] text-slate-400 hover:bg-slate-800 hover:text-cyan-300"
              title="Templates"
            >
              <Wand2 className="h-3 w-3" />
              Templates
              <ChevronDown className="h-2.5 w-2.5" />
            </button>
            {showTemplates && (
              <div className="absolute right-0 top-full z-10 mt-1 w-64 rounded-lg border border-slate-700 bg-slate-900 shadow-lg">
                <div className="max-h-56 overflow-y-auto">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        onChange((section.content_ar ? section.content_ar + ' ' : '') + t.body_ar);
                        setShowTemplates(false);
                      }}
                      className="block w-full border-b border-slate-800 px-3 py-2 text-left text-[10px] hover:bg-slate-800"
                    >
                      <div className="font-bold text-slate-200">{t.label_en}</div>
                      <div className="mt-0.5 text-[9px] text-slate-500">
                        Type <code className="rounded bg-slate-800 px-1">{t.trigger}</code>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <textarea
        dir="rtl"
        value={section.content_ar}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={section.key === 'patient' ? 3 : 4}
        placeholder="Arabic report text · voice-friendly · Tab for templates"
        className="w-full resize-y bg-transparent p-3 text-sm leading-relaxed text-slate-200 placeholder:text-slate-600 focus:outline-none disabled:opacity-70"
      />
    </div>
  );
}

function SignDialog({
  onCancel,
  onConfirm,
  busy,
}: {
  onCancel: () => void;
  onConfirm: (name: string, license: string) => void;
  busy: boolean;
}) {
  const [name, setName] = useState(() =>
    typeof window !== 'undefined' ? (window.localStorage.getItem('midcine.signerName') ?? '') : '',
  );
  const [license, setLicense] = useState(() =>
    typeof window !== 'undefined'
      ? (window.localStorage.getItem('midcine.signerLicense') ?? '')
      : '',
  );

  function submit() {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('midcine.signerName', name);
      window.localStorage.setItem('midcine.signerLicense', license);
    }
    onConfirm(name, license);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-2 text-amber-300">
          <PenLine className="h-4 w-4" />
          <h3 className="text-sm font-bold">Sign report</h3>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[10px] text-slate-400">Full name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dr. Full Name"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] text-slate-400">License #</label>
            <input
              value={license}
              onChange={(e) => setLicense(e.target.value)}
              placeholder="RAD-1234"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none"
            />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-slate-700 py-2 text-xs text-slate-400 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!name || !license || busy}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-amber-500 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <PenLine className="h-3 w-3" />}
            Sign now
          </button>
        </div>
      </div>
    </div>
  );
}
