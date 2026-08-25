'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Sparkles,
  Loader2,
  PenLine,
  Send,
  ChevronDown,
  Wand2,
  Rocket,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';
import { SendDialog } from './send-dialog';
import {
  analyzeStudy,
  generateFinalReport,
  recordStyleEdit,
  scanCritical,
  type CriticalAlertResult,
  type FinalReportResult,
} from '../../../lib/studies';
import { FileDown, Printer, Copy as CopyIcon } from 'lucide-react';
import type {
  AgentOutput,
  AggregateResponse,
  PipelineResponse,
  StudyMetadata,
} from '../../../lib/mcp';
import {
  generateImpression,
  signReport,
  type FinalReport,
  type ReportSection,
} from '../../../lib/report';
import { snippetsForContext, findSnippetByTrigger } from './templates';
import { recordSignedReport } from './savings-counter';
import { runCalculator } from '../../../lib/calculators';

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

// v3 = English-only. Previous v2 keys held Arabic drafts and are intentionally not read.
// v4: vision-first. Old drafts (v3en) that stored useless agent bullets are ignored.
const STORAGE_KEY = (uid: string) => `midcine.report.v4vision.${uid}`;

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
  | { kind: 'running'; agents: string[]; done: AgentOutput[] }
  | { kind: 'ready'; pipeline: PipelineResponse; report: FinalReport }
  | { kind: 'error'; msg: string };

export function ReportComposer({ study, onSigned }: Props) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [signOpen, setSignOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [impressionBusy, setImpressionBusy] = useState(false);
  const [impressionMeta, setImpressionMeta] = useState<string | null>(null);
  const [shipStep, setShipStep] = useState<string | null>(null);
  const [critical, setCritical] = useState<CriticalAlertResult | null>(null);
  const [criticalBusy, setCriticalBusy] = useState(false);
  const [criticalDismissed, setCriticalDismissed] = useState(false);
  const [originalImpression, setOriginalImpression] = useState<string>('');
  // ---- Final Report unified view state ----
  const [finalBusy, setFinalBusy] = useState(false);
  const [finalReport, setFinalReport] = useState<FinalReportResult | null>(null);
  const [finalText, setFinalText] = useState<string>('');
  const [finalCopiedAt, setFinalCopiedAt] = useState<number>(0);
  // ---- NEXUS Second Opinion state ----
  const [secondOpBusy, setSecondOpBusy] = useState(false);
  const [secondOp, setSecondOp] = useState<any | null>(null);
  const [secondOpErr, setSecondOpErr] = useState<string>('');

  // On study open: build a blank English report shell, then call
  // /ai/analyze-study which runs REAL vision (multimodal LLM reads the DICOM
  // pixels) + diagnose. Fills sections from vision result — not from useless
  // agent boilerplate.
  useEffect(() => {
    if (!study.study_uid) return;
    setState({ kind: 'running', agents: ['vision', 'diagnose'], done: [] });

    // Build blank English shell so sections render immediately.
    const draft = loadDraft(study.study_uid);
    const blankReport: FinalReport = {
      study_uid: study.study_uid,
      patient_id: study.patient_id ?? null,
      patient_name: study.patient_name ?? null,
      hospital_id: 'default',
      modality: study.modality ?? '',
      body_part: study.body_part ?? '',
      sections: [
        { key: 'patient', title_ar: 'Patient', content_ar: draft?.patient ?? '', editable: true },
        { key: 'technique', title_ar: 'Technique', content_ar: draft?.technique ?? '', editable: true },
        { key: 'findings', title_ar: 'Findings', content_ar: draft?.findings ?? '', editable: true },
        { key: 'impression', title_ar: 'Impression', content_ar: draft?.impression ?? '', editable: true },
        { key: 'recommendations', title_ar: 'Recommendations', content_ar: draft?.recommendations ?? '', editable: true },
      ],
      impression_ar: draft?.impression ?? '',
      recommendations_ar: [],
      atlas_condition_ids: [],
      generated_at: new Date().toISOString(),
    };
    const pipeline: PipelineResponse = {
      study_uid: study.study_uid,
      dispatched_agents: [],
      outputs: [],
      aggregate: {
        study_uid: study.study_uid,
        agents: [],
        unified: '',
        confidence: 0,
        latency_ms: 0,
      } as unknown as AggregateResponse,
      total_latency_ms: 0,
    };
    setState({ kind: 'ready', pipeline, report: blankReport });

    // Fire analyze-study — this uses REAL vision (Groq llama-4-scout reads
    // the DICOM slice pixels directly) + full diagnose pipeline.
    void analyzeStudy(study.study_uid, {
      symptoms:
        study.clinical_context?.split('Symptoms:')[1]?.split('·')[0]?.trim() ?? '',
      clinical_history:
        study.clinical_context?.split('History:')[1]?.split('·')[0]?.trim() ?? '',
    }).then((res) => {
      if (!res.ok) {
        window.dispatchEvent(
          new CustomEvent('midcine:toast', {
            detail: { text: `AI analyze failed: ${res.error ?? 'unknown'}` },
          }),
        );
        return;
      }

      // Vision is the primary source. Fall back to diagnose report for text.
      const vision = res.vision ?? {};
      const diag = res.diagnose?.diagnostic_report ?? {};

      const modality = res.classification?.modality ?? study.modality ?? '';
      const region = res.classification?.body_part ?? study.body_part ?? '';
      const indication = res.classification?.likely_indication ?? '';

      // Findings: vision output (anatomy + abnormal findings)
      const anatomyLine = vision.anatomy_seen
        ? `${vision.anatomy_seen}`
        : '';
      const abnormalBullets = (vision.abnormal_findings ?? [])
        .map((f) => {
          const loc = f.location ? ` (${f.location})` : '';
          const acr = f.acr_priority ? ` [${f.acr_priority}]` : '';
          return `• ${f.finding}${loc}${acr}`;
        })
        .join('\n');
      const normalBullets = (vision.normal_findings ?? [])
        .map((n) => `• ${n} — normal`)
        .join('\n');
      const findingsBody = [
        anatomyLine,
        abnormalBullets && `\nABNORMAL FINDINGS:\n${abnormalBullets}`,
        normalBullets && `\nNORMAL:\n${normalBullets}`,
      ]
        .filter(Boolean)
        .join('\n');

      // Impression: vision overall_impression preferred; fall back to diagnose leading
      const impressionText =
        (vision.overall_impression && String(vision.overall_impression)) ||
        diag.leading_diagnosis ||
        res.suggested_impression ||
        '';

      // Patient section
      const parts = (study.clinical_context ?? '').split('·').map((s) => s.trim());
      const symptoms =
        parts.find((p) => p.startsWith('Symptoms:'))?.replace('Symptoms:', '').trim() ?? '';
      const history =
        parts.find((p) => p.startsWith('History:'))?.replace('History:', '').trim() ?? '';
      const patientLine = [
        study.patient_name && `Name: ${study.patient_name}`,
        study.patient_id && `ID: ${study.patient_id}`,
        symptoms && `Symptoms: ${symptoms}`,
        history && `History: ${history}`,
      ]
        .filter(Boolean)
        .join(' · ');

      // Technique
      const techniqueLine =
        modality && region
          ? `${modality} of the ${region.toLowerCase()}${indication ? ` — indication: ${indication.toLowerCase()}` : ''}.`
          : '';

      // Recommendations: diagnose next steps + vision recommend_next_view
      const nextSteps = (diag.recommended_next_steps ?? []) as string[];
      const recViewLine = vision.recommend_next_view
        ? [`• Suggested next view: ${vision.recommend_next_view}`]
        : [];
      const recsText = [
        ...nextSteps.map((s, i) => `${i + 1}. ${s}`),
        ...recViewLine,
      ].join('\n');

      // Functional setState — avoids stale closure
      setState((prev) => {
        if (prev.kind !== 'ready') return prev;
        const nextSections = prev.report.sections.map((s) => {
          if (s.key === 'patient' && patientLine && !s.content_ar.trim())
            return { ...s, content_ar: patientLine };
          if (s.key === 'technique' && techniqueLine && !s.content_ar.trim())
            return { ...s, content_ar: techniqueLine };
          if (s.key === 'findings' && findingsBody && !s.content_ar.trim())
            return { ...s, content_ar: findingsBody };
          if (s.key === 'impression' && impressionText)
            return { ...s, content_ar: impressionText };
          if (s.key === 'recommendations' && recsText && !s.content_ar.trim())
            return { ...s, content_ar: recsText };
          return s;
        });
        try {
          const map: Record<string, string> = {};
          for (const s of nextSections) map[s.key] = s.content_ar;
          window.localStorage.setItem(STORAGE_KEY(study.study_uid), JSON.stringify(map));
        } catch {
          /* ignore */
        }
        return { ...prev, report: { ...prev.report, sections: nextSections } };
      });
      if (impressionText) setOriginalImpression(impressionText);
      window.dispatchEvent(
        new CustomEvent('midcine:toast', {
          detail: {
            text: `AI vision read: ${vision.provider || 'model'} · ${
              vision.abnormal_findings?.length ?? 0
            } abnormal findings · ${((res.latency_ms ?? 0) / 1000).toFixed(1)}s`,
          },
        }),
      );
    });
  }, [study.study_uid]);

  const report = state.kind === 'ready' ? state.report : null;
  const orderedSections = useMemo(() => {
    if (!report) return [];
    const map = new Map(report.sections.map((s) => [s.key, s]));
    return SECTION_ORDER.map((k) => map.get(k)).filter((s): s is ReportSection => !!s);
  }, [report]);

  function updateSection(key: string, next: string) {
    if (state.kind !== 'ready') return;
    // Signed reports are locked — no further edits allowed
    if (state.report.signed_at) return;
    const snip = findSnippetByTrigger(next);
    if (snip && snip.section === key) {
      next = next.slice(0, -snip.trigger.length) + snip.body_ar;
    }
    // Clinical calculator slash-commands (e.g., /flei 8 solid high single)
    // Trigger on newline after full command
    const lines = next.split('\n');
    if (lines.length > 1) {
      const lastComplete = lines[lines.length - 2] ?? '';
      const calcOut = runCalculator(lastComplete);
      if (calcOut) {
        lines[lines.length - 2] = calcOut;
        next = lines.join('\n');
      }
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
      // Personal AI style learning: capture the diff the user made to the AI impression
      const current =
        state.report.sections.find((s) => s.key === 'impression')?.content_ar ?? '';
      if (originalImpression && current && current.trim() !== originalImpression.trim()) {
        await recordStyleEdit(
          signedBy,
          originalImpression,
          current,
          study.modality,
          study.body_part,
        );
      }
      const signed = await signReport(state.report, signedBy, licenseNo);
      setState({ ...state, report: signed });
      recordSignedReport();
      setSignOpen(false);
      onSigned?.(signed);
      window.dispatchEvent(
        new CustomEvent('midcine:toast', {
          detail: { text: `Report signed by ${signedBy} — now locked` },
        }),
      );
    } catch (e) {
      window.dispatchEvent(
        new CustomEvent('midcine:toast', {
          detail: {
            text: `Sign failed: ${String((e as Error).message ?? e).slice(0, 100)}`,
          },
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  async function doGenerateImpression() {
    if (state.kind !== 'ready') return;
    if (state.report.signed_at) {
      window.dispatchEvent(
        new CustomEvent('midcine:toast', {
          detail: { text: 'Report already signed — cannot regenerate' },
        }),
      );
      return;
    }
    const findings = state.report.sections.find((s) => s.key === 'findings')?.content_ar ?? '';
    if (!findings.trim()) {
      window.dispatchEvent(
        new CustomEvent('midcine:toast', {
          detail: { text: 'Findings is empty — dictate first' },
        }),
      );
      return;
    }
    setImpressionBusy(true);
    setImpressionMeta(null);
    try {
      const res = await generateImpression({
        findings,
        modality: study.modality,
        body_part: study.body_part,
        symptoms: study.clinical_context?.includes('Symptoms')
          ? study.clinical_context.split('Symptoms:')[1]?.split('·')[0]?.trim()
          : '',
        clinical_history: study.clinical_context?.includes('History')
          ? study.clinical_context.split('History:')[1]?.split('·')[0]?.trim()
          : '',
      });
      if (!res.ok) {
        window.dispatchEvent(
          new CustomEvent('midcine:toast', {
            detail: { text: `Impression failed: ${res.error ?? 'unknown'}` },
          }),
        );
        return;
      }
      updateSection('impression', res.impression);
      setOriginalImpression(res.impression);
      setImpressionMeta(`Generated in ${res.latency_ms ?? '?'}ms · Rad-AI style`);
      window.dispatchEvent(
        new CustomEvent('midcine:toast', {
          detail: { text: 'Impression drafted — review before signing' },
        }),
      );
    } catch (e) {
      window.dispatchEvent(
        new CustomEvent('midcine:toast', {
          detail: {
            text: `Impression error: ${String((e as Error).message ?? e).slice(0, 100)}`,
          },
        }),
      );
    } finally {
      setImpressionBusy(false);
    }
  }

  // Auto-scan findings for critical terms (debounced) whenever findings change
  useEffect(() => {
    if (state.kind !== 'ready') return;
    const findings = state.report.sections.find((s) => s.key === 'findings')?.content_ar ?? '';
    if (findings.trim().length < 30) {
      setCritical(null);
      return;
    }
    const handle = setTimeout(async () => {
      setCriticalBusy(true);
      try {
        const r = await scanCritical(findings, study.modality, study.body_part);
        setCritical(r);
        setCriticalDismissed(false);
      } finally {
        setCriticalBusy(false);
      }
    }, 1500);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.kind, state.kind === 'ready' ? state.report.sections.find((s) => s.key === 'findings')?.content_ar : null]);

  // doCompare / doVisionAnalyze / doGapsReport / doPubmedCite deferred for pilot

  // ---- ONE-CLICK Final Report ----
  // Clears every section, runs the deep full-volume analysis, then shows a
  // single unified editable report ready for print / PDF / send.
  async function doGenerateFinalReport() {
    if (!study.study_uid) return;
    setFinalBusy(true);
    setFinalReport(null);
    try {
      // Wipe every section immediately so the doctor sees a clean slate.
      setState((prev) => {
        if (prev.kind !== 'ready') return prev;
        const cleared = prev.report.sections.map((s) => ({ ...s, content_ar: '' }));
        try {
          window.localStorage.setItem(
            STORAGE_KEY(study.study_uid),
            JSON.stringify(Object.fromEntries(cleared.map((s) => [s.key, '']))),
          );
        } catch {}
        return { ...prev, report: { ...prev.report, sections: cleared } };
      });

      const parts = (study.clinical_context ?? '').split('·').map((s) => s.trim());
      const symptoms =
        parts.find((p) => p.startsWith('Symptoms:'))?.replace('Symptoms:', '').trim() ?? '';
      const history =
        parts.find((p) => p.startsWith('History:'))?.replace('History:', '').trim() ?? '';

      window.dispatchEvent(
        new CustomEvent('midcine:toast', {
          detail: {
            text: 'AI reading every slice — this may take 1–3 minutes for large studies…',
          },
        }),
      );

      const res = await generateFinalReport(study.study_uid, {
        symptoms,
        clinical_history: history,
      });
      setFinalReport(res);
      if (!res.ok) {
        window.dispatchEvent(
          new CustomEvent('midcine:toast', {
            detail: { text: `Final report failed: ${res.error ?? 'unknown'}` },
          }),
        );
        return;
      }
      setFinalText(res.report_text ?? '');
      window.dispatchEvent(
        new CustomEvent('midcine:toast', {
          detail: {
            text: `Report ready · ${res.vision?.total_slices ?? '?'} slices · ${
              res.vision?.abnormal_findings?.length ?? 0
            } findings · ${((res.latency_ms ?? 0) / 1000).toFixed(1)}s`,
          },
        }),
      );
    } catch (e) {
      window.dispatchEvent(
        new CustomEvent('midcine:toast', {
          detail: {
            text: `Final report error: ${String((e as Error).message ?? e).slice(0, 100)}`,
          },
        }),
      );
    } finally {
      setFinalBusy(false);
    }
  }

  function finalCopy() {
    if (!finalText) return;
    try {
      navigator.clipboard.writeText(finalText);
      setFinalCopiedAt(Date.now());
    } catch {}
  }

  function finalPrint() {
    // Open the server-rendered HTML in a new window and trigger print.
    const html =
      (finalReport?.report_html ?? '').replace(
        /<\/body>/,
        `<script>window.onload=()=>setTimeout(()=>window.print(),500);<\/script></body>`,
      ) ||
      `<pre>${finalText.replace(/</g, '&lt;')}</pre><script>window.onload=()=>setTimeout(()=>window.print(),500);<\/script>`;
    const w = window.open('', '_blank');
    if (!w) {
      window.dispatchEvent(
        new CustomEvent('midcine:toast', {
          detail: { text: 'Pop-up blocked — allow pop-ups to print' },
        }),
      );
      return;
    }
    w.document.write(html);
    w.document.close();
  }

  function finalDownloadPdf() {
    // Browser Print → Save-as-PDF is the most reliable cross-platform PDF path
    // without adding server-side dependencies. Same flow as Print but with a
    // toast telling the user to pick "Save as PDF" in the print dialog.
    window.dispatchEvent(
      new CustomEvent('midcine:toast', {
        detail: {
          text: 'Choose "Save as PDF" in the print dialog to download.',
        },
      }),
    );
    finalPrint();
  }

  function finalDownloadTxt() {
    const blob = new Blob([finalText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const name = (finalReport?.meta?.patient_name || 'report')
      .replace(/[^a-z0-9]/gi, '_')
      .slice(0, 40);
    a.download = `midcine-${name}-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // NEXUS Second Opinion: send the current draft to 3 specialist agents
  // for hallucination + inconsistency + completeness cross-check.
  async function doSecondOpinion() {
    if (secondOpBusy || state.kind !== 'ready') return;
    // Assemble the current draft as one text block
    const parts = state.report.sections.map(
      (s) => `${s.key}\n${s.content_ar ?? ''}`,
    );
    const reportText = parts.join('\n\n').trim();
    if (reportText.length < 50) {
      setSecondOpErr('Draft too short — write findings first');
      return;
    }
    setSecondOpBusy(true);
    setSecondOpErr('');
    setSecondOp(null);
    try {
      const r = await fetch('/api/mcp/ai/second-opinion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          study_uid: study.study_uid,
          report_text: reportText,
        }),
      });
      const j = await r.json();
      if (!j?.ok) {
        setSecondOpErr(j?.error || `HTTP ${r.status}`);
        return;
      }
      setSecondOp(j);
    } catch (e: any) {
      setSecondOpErr(String(e?.message ?? e));
    } finally {
      setSecondOpBusy(false);
    }
  }

  // One-click Ship: (1) AI Impression if empty → (2) Sign → (3) Open Send dialog
  async function doShip() {
    if (state.kind !== 'ready') return;
    const findings = state.report.sections.find((s) => s.key === 'findings')?.content_ar ?? '';
    if (!findings.trim()) {
      window.dispatchEvent(
        new CustomEvent('midcine:toast', {
          detail: { text: 'Dictate findings first — nothing to ship' },
        }),
      );
      return;
    }
    const impression = state.report.sections.find((s) => s.key === 'impression')?.content_ar ?? '';

    // 1. Generate impression if empty
    if (!impression.trim()) {
      setShipStep('1/3 — Drafting AI Impression…');
      await doGenerateImpression();
    }

    // 2. Sign automatically if we already have saved credentials, else open dialog
    const savedName = window.localStorage.getItem('midcine.signerName');
    const savedLicense = window.localStorage.getItem('midcine.signerLicense');
    if (!state.report.signed_at) {
      if (savedName && savedLicense) {
        setShipStep('2/3 — Signing…');
        await doSign(savedName, savedLicense);
      } else {
        setShipStep(null);
        setSignOpen(true);
        window.dispatchEvent(
          new CustomEvent('midcine:toast', {
            detail: { text: 'Sign once — future ships will be one-click' },
          }),
        );
        return;
      }
    }

    // 3. Open Send dialog (user picks recipients)
    setShipStep('3/3 — Choose recipients…');
    setSendOpen(true);
    setTimeout(() => setShipStep(null), 3000);
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
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
          <div className="text-xs">Drafting from {state.agents.length || '…'} AI agents</div>
          {state.agents.length > 0 && (
            <div className="w-full max-w-xs space-y-2">
              {state.agents.map((agent) => {
                const done = state.done.find((d) => d.agent === agent);
                return (
                  <div
                    key={agent}
                    className={
                      'flex items-center justify-between rounded-lg border px-3 py-2 text-[10px] transition ' +
                      (done
                        ? done.ok
                          ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300'
                          : 'border-rose-500/30 bg-rose-500/5 text-rose-300'
                        : 'border-slate-700 bg-slate-900/40 text-slate-500')
                    }
                  >
                    <span className="font-mono">{agent}</span>
                    <span>
                      {done ? (
                        done.ok ? (
                          `✓ ${Math.round(done.latency_ms)}ms`
                        ) : (
                          '✗ failed'
                        )
                      ) : (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {state.kind === 'error' && (
        <div className="flex-1 p-4 text-center text-xs text-rose-400">Failed: {state.msg}</div>
      )}

      {/* CRITICAL ALERT — auto-detected by AI on every findings edit */}
      {report && critical?.critical && !criticalDismissed && (
        <div className="border-b border-rose-500/60 bg-rose-500/10 p-3">
          <div className="mb-2 flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 animate-pulse text-rose-400" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="rounded bg-rose-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                  {critical.severity ?? 'STAT'}
                </span>
                <span className="text-xs font-bold text-rose-200">Critical result</span>
              </div>
              <div className="mt-1 space-y-1 text-[11px] text-rose-100">
                {critical.findings?.map((f, i) => (
                  <div key={i}>
                    <span className="font-bold text-rose-200">{f.term}</span>: {f.reason}
                    <br />
                    <span className="text-[10px] text-rose-300">→ {f.action}</span>
                  </div>
                ))}
              </div>
              {critical.callback_recommended && (
                <div className="mt-2 rounded bg-rose-500/20 px-2 py-1 text-[10px] font-bold text-rose-100">
                  📞 Immediate callback to referrer recommended · Priority → {critical.escalate_priority_to}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setCriticalDismissed(true)}
              className="text-[10px] text-rose-300 hover:text-white"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      {criticalBusy && report && !critical?.critical && (
        <div className="border-b border-slate-800 bg-slate-900/40 px-3 py-1 text-[10px] text-slate-500">
          <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
          Scanning findings for critical results…
        </div>
      )}
      {/* Vision / Compare / PubMed / Gaps panels deferred for pilot */}
      {report && impressionMeta && (
        <div className="border-b border-cyan-500/30 bg-cyan-500/5 px-3 py-1 text-[10px] text-cyan-300">
          ✨ {impressionMeta}
        </div>
      )}

      {report && (
        <>
          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {/* Unified Final Report panel — appears after Generate Final Report */}
            {(finalBusy || finalReport) && (
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                    <Sparkles className="h-3.5 w-3.5" />
                    FINAL REPORT
                    {finalReport?.vision && (
                      <span className="rounded bg-slate-800 px-2 py-0.5 text-[9px] font-mono text-slate-300">
                        {finalReport.vision.total_slices ?? '?'} slices ·{' '}
                        {finalReport.vision.abnormal_findings?.length ?? 0} findings
                        {finalReport.vision.critical ? ' · CRITICAL' : ''}
                      </span>
                    )}
                  </div>
                  {finalReport?.ok && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={finalCopy}
                        title="Copy to clipboard"
                        className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-700 hover:text-cyan-300"
                      >
                        <CopyIcon className="h-3 w-3" />
                        {Date.now() - finalCopiedAt < 2000 ? '✓ Copied' : 'Copy'}
                      </button>
                      <button
                        type="button"
                        onClick={finalPrint}
                        title="Print report"
                        className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-700 hover:text-cyan-300"
                      >
                        <Printer className="h-3 w-3" />
                        Print
                      </button>
                      <button
                        type="button"
                        onClick={finalDownloadPdf}
                        title="Save as PDF (via browser print dialog)"
                        className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-700 hover:text-cyan-300"
                      >
                        <FileDown className="h-3 w-3" />
                        PDF
                      </button>
                      <button
                        type="button"
                        onClick={finalDownloadTxt}
                        title="Download as .txt"
                        className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-700 hover:text-cyan-300"
                      >
                        .txt
                      </button>
                      <button
                        type="button"
                        onClick={() => setSendOpen(true)}
                        title="Send to referrer via WhatsApp"
                        className="flex items-center gap-1 rounded bg-emerald-500/25 px-2 py-1 text-[10px] font-bold text-emerald-200 hover:bg-emerald-500/40"
                      >
                        <Send className="h-3 w-3" />
                        Send
                      </button>
                    </div>
                  )}
                </div>
                {finalBusy ? (
                  <div className="flex items-center gap-2 py-8 text-center text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                    <span className="text-xs">
                      AI reading every slice of the volume — this may take 1–3
                      minutes for larger studies. The report will appear here
                      when ready.
                    </span>
                  </div>
                ) : finalReport?.ok ? (
                  <>
                    {finalReport.vision?.critical && (
                      <div className="mb-2 rounded border border-rose-500/50 bg-rose-500/10 px-2 py-1 text-[10px] font-bold text-rose-300">
                        ⚠ CRITICAL FINDING — STAT review required.
                      </div>
                    )}
                    <textarea
                      value={finalText}
                      onChange={(e) => setFinalText(e.target.value)}
                      rows={20}
                      className="w-full resize-y rounded border border-slate-700 bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-100 focus:border-emerald-500 focus:outline-none"
                      spellCheck
                    />
                    <div className="mt-1 text-[10px] text-slate-500">
                      Fully editable. AI-assisted draft — requires radiologist
                      review and signature before release.
                    </div>
                  </>
                ) : finalReport ? (
                  <div className="rounded border border-rose-500/40 bg-rose-500/10 p-2 text-[11px] text-rose-300">
                    Generation failed: {finalReport.error ?? 'unknown error'}
                  </div>
                ) : null}
              </div>
            )}

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

          {shipStep && (
            <div className="flex items-center gap-2 border-t border-fuchsia-500/30 bg-fuchsia-500/5 px-3 py-1.5 text-[10px] text-fuchsia-300">
              <Loader2 className="h-3 w-3 animate-spin" />
              {shipStep}
            </div>
          )}

          <div className="flex flex-col gap-2 border-t border-slate-800 bg-slate-900/60 p-2">
            {!report.signed_at ? (
              <>
                {/* NEW PRIMARY: One-click Full Deep Report. Clears sections, runs
                    full-volume vision, composes unified report ready for print/PDF/send. */}
                <button
                  type="button"
                  onClick={doGenerateFinalReport}
                  disabled={finalBusy}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 py-2.5 text-sm font-bold text-slate-950 shadow hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-50"
                  title="Deep AI analysis of every slice → single unified report ready for print/PDF/send"
                >
                  {finalBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {finalBusy
                    ? 'Reading every slice…'
                    : 'Generate Final Report (deep analysis)'}
                </button>
                {/* PRIMARY: One-click Ship (AI Impression → Sign → Send). */}
                <button
                  type="button"
                  onClick={doShip}
                  disabled={impressionBusy || busy || !!shipStep}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-fuchsia-500 to-cyan-500 py-2.5 text-sm font-bold text-slate-950 shadow hover:from-fuchsia-400 hover:to-cyan-400 disabled:opacity-50"
                  title="Complete the report and ship to referrer (Findings → AI Impression → Sign → WhatsApp)"
                >
                  {shipStep ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Rocket className="h-4 w-4" />
                  )}
                  Ship report (AI Impression + Sign + Send)
                </button>
                {/* Secondary: individual actions */}
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={doGenerateImpression}
                    disabled={impressionBusy}
                    className="flex items-center justify-center gap-1 rounded-lg bg-cyan-500/20 py-1.5 text-[10px] font-bold text-cyan-300 hover:bg-cyan-500/30 disabled:opacity-50"
                    title="Just draft the Impression"
                  >
                    {impressionBusy ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    Impress
                  </button>
                  {/* Vision / Gaps / Compare / Cite deferred for pilot — keep only Impress + Sign */}
                  <button
                    type="button"
                    onClick={() => setSignOpen(true)}
                    className="flex items-center justify-center gap-1 rounded-lg bg-amber-500/20 py-1.5 text-[10px] font-bold text-amber-300 hover:bg-amber-500/30"
                    title="Sign only (no send)"
                  >
                    <PenLine className="h-3 w-3" />
                    Sign
                  </button>
                </div>

                {/* NEXUS Second Opinion — 3-agent cross-verification */}
                <button
                  type="button"
                  onClick={doSecondOpinion}
                  disabled={secondOpBusy}
                  className="mt-1 flex w-full items-center justify-center gap-1 rounded-lg bg-purple-500/20 py-1.5 text-[10px] font-bold text-purple-200 hover:bg-purple-500/30 disabled:opacity-50"
                  title="Cross-verify the draft against 3 NEXUS specialists (Guardian + Debugger + Code Reviewer) — flags hallucinations, missing findings, inconsistencies"
                >
                  {secondOpBusy ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-3 w-3" />
                  )}
                  {secondOpBusy ? 'Consulting NEXUS…' : 'NEXUS Second Opinion (3 agents)'}
                </button>

                {secondOpErr && (
                  <div className="rounded bg-rose-900/50 px-2 py-1 text-[10px] text-rose-200">
                    {secondOpErr}
                  </div>
                )}

                {secondOp && (
                  <div className="rounded-lg border border-purple-500/40 bg-purple-950/30 p-2 text-[11px] text-purple-100">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-bold">NEXUS Verdict</span>
                      <span className="text-[10px] text-purple-300">
                        Agreement {(secondOp.mean_agreement * 100).toFixed(0)}%
                      </span>
                    </div>
                    {secondOp.critical_flags?.length > 0 && (
                      <div className="mb-1 rounded bg-rose-900/50 p-1.5">
                        <div className="text-[10px] font-bold text-rose-200">
                          🚨 CRITICAL ({secondOp.critical_flags.length})
                        </div>
                        {secondOp.critical_flags.slice(0, 3).map((f: any, i: number) => (
                          <div key={i} className="mt-0.5 text-[10px] text-rose-100">
                            · {f.issue} <span className="text-rose-300">({f.flagged_by})</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {secondOp.missing_from_report?.length > 0 && (
                      <div className="mb-1">
                        <div className="text-[10px] font-bold text-amber-300">
                          Missing findings ({secondOp.missing_from_report.length})
                        </div>
                        {secondOp.missing_from_report.slice(0, 3).map((m: string, i: number) => (
                          <div key={i} className="text-[10px] text-slate-300">· {m}</div>
                        ))}
                      </div>
                    )}
                    {secondOp.invented_by_report?.length > 0 && (
                      <div className="mb-1">
                        <div className="text-[10px] font-bold text-rose-300">
                          Possibly invented ({secondOp.invented_by_report.length})
                        </div>
                        {secondOp.invented_by_report.slice(0, 3).map((iv: string, i: number) => (
                          <div key={i} className="text-[10px] text-slate-300">· {iv}</div>
                        ))}
                      </div>
                    )}
                    {secondOp.critical_flags?.length === 0 &&
                     secondOp.missing_from_report?.length === 0 &&
                     secondOp.invented_by_report?.length === 0 && (
                      <div className="text-[10px] text-emerald-300">
                        ✅ All 3 specialists agree — no issues flagged
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={() => setSendOpen(true)}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500/20 py-2.5 text-sm font-bold text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50"
                title="Send signed report to referrer(s)"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send to referrer via WhatsApp
              </button>
            )}
          </div>

          {signOpen && (
            <SignDialog onCancel={() => setSignOpen(false)} onConfirm={doSign} busy={busy} />
          )}
          {sendOpen && (
            <SendDialog
              report={report}
              onClose={() => setSendOpen(false)}
              onSent={(ok, total) => {
                window.dispatchEvent(
                  new CustomEvent('midcine:toast', {
                    detail: { text: `Sent to ${ok}/${total} referrer${total === 1 ? '' : 's'}` },
                  }),
                );
                setSendOpen(false);
              }}
            />
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
          {SECTION_TITLE[section.key] ?? section.key}
        </span>
        {/* Templates dropdown hidden — current library is Arabic-only; use AI
            actions (Analyze / Impress) for English text. */}
        {false && templates.length > 0 && !disabled && (
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
        dir="auto"
        value={section.content_ar}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={section.key === 'patient' ? 3 : 4}
        placeholder="English report text · Tab for templates · voice-friendly"
        className="w-full resize-y bg-transparent p-3 text-sm leading-relaxed text-slate-200 placeholder:text-slate-600 focus:outline-none disabled:opacity-70"
      />
      {/* Interactive slice hyperlinks (below the textarea, non-destructive) */}
      <SliceHyperlinks text={section.content_ar} />
    </div>
  );
}

// Detects patterns like "slice 47", "slices 42-67", "Slice 12/156" and emits
// clickable chips that jump the DICOM viewer to that slice via a custom event.
function SliceHyperlinks({ text }: { text: string }) {
  const matches = useMemo(() => {
    if (!text || text.length > 4000) return [];
    // Matches: "slice 47", "slice 42-67", "slice 12/156", "slices 42-67 of 156"
    const re = /\b(slice|slices)\s+(\d{1,4})(?:\s*-\s*(\d{1,4}))?(?:\s*(?:\/|of)\s*(\d{1,4}))?\b/gi;
    const found: Array<{
      raw: string;
      start: number;
      end: number;
    }> = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      found.push({ raw: m[0], start: m.index, end: m.index + m[0].length });
      if (found.length > 30) break; // safety cap
    }
    return found;
  }, [text]);

  if (matches.length === 0) return null;

  const jumpTo = (raw: string) => {
    // Parse "slice 47" or "slices 42-67" or "slice 12/156"
    const m = /(\d{1,4})(?:\s*-\s*(\d{1,4}))?/.exec(raw);
    if (!m) return;
    const start = Number(m[1]);
    const end = m[2] ? Number(m[2]) : start;
    // Dispatch a viewer-jump event; the DICOM viewer subscribes to this.
    window.dispatchEvent(
      new CustomEvent('midcine:viewer:jump', {
        detail: {
          sliceIndex: Math.max(0, start - 1), // 1-based → 0-based
          highlightRange: [start - 1, end - 1],
        },
      }),
    );
  };

  return (
    <div className="border-t border-slate-800 bg-slate-950/40 px-3 py-1.5">
      <div className="mb-0.5 text-[9px] uppercase tracking-widest text-slate-500">
        Jump to slice
      </div>
      <div className="flex flex-wrap gap-1">
        {matches.map((m, i) => (
          <button
            key={i}
            type="button"
            onClick={() => jumpTo(m.raw)}
            className="rounded bg-cyan-500/15 px-2 py-0.5 text-[10px] font-mono text-cyan-300 hover:bg-cyan-500/30 hover:text-cyan-200"
            title={`Jump viewer to ${m.raw}`}
          >
            {m.raw}
          </button>
        ))}
      </div>
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
  // One-time legal acknowledgment before the first ever Sign.
  const alreadyAcknowledged =
    typeof window !== 'undefined' &&
    !!window.localStorage.getItem('midcine.legal.acknowledged_at');
  const [ack, setAck] = useState(alreadyAcknowledged);

  function submit() {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('midcine.signerName', name);
      window.localStorage.setItem('midcine.signerLicense', license);
      if (!alreadyAcknowledged && ack) {
        window.localStorage.setItem(
          'midcine.legal.acknowledged_at',
          new Date().toISOString(),
        );
      }
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
          {!alreadyAcknowledged && (
            <label className="mt-1 flex cursor-pointer items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-2 text-[10px] text-amber-100">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
                className="mt-0.5 h-3 w-3 shrink-0 accent-amber-500"
              />
              <span>
                I acknowledge this AI is an <b>assistant only</b> and that I
                retain <b>full legal responsibility</b> for the signed report.{' '}
                <a
                  href="/legal"
                  target="_blank"
                  rel="noopener"
                  className="text-amber-300 underline hover:text-amber-200"
                >
                  Full disclaimer
                </a>
                .
              </span>
            </label>
          )}
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
            disabled={!name || !license || busy || (!alreadyAcknowledged && !ack)}
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
