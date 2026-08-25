'use client';

/**
 * Patient Report dialog — attach an external patient-brought report (referral,
 * lab, prior imaging, discharge summary, prescription, note) to a study, and
 * optionally get an AI plain-language explanation of it.
 *
 * Backend endpoints:
 *   POST /api/mcp/studies/{uid}/report          multipart file OR text field
 *   GET  /api/mcp/studies/{uid}/report          list attachments
 *   POST /api/mcp/ai/explain-report             { text, study_uid, modality, body_part } → JSON
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  X,
  Paperclip,
  Loader2,
  FileText,
  Sparkles,
  Upload,
  Check,
  AlertTriangle,
} from 'lucide-react';

interface ReportItem {
  name: string;
  text?: string;
  kind?: string;
}

interface ExplainOutput {
  ok?: boolean;
  language?: string;
  report_type?: string;
  summary?: string;
  key_findings?: string[];
  diagnoses_mentioned?: string[];
  medications?: string[];
  dates?: string[];
  relevance_to_current_study?: string;
  red_flags?: string[];
  latency_ms?: number;
  error?: string;
  parse_error?: boolean;
}

export function PatientReportDialog({
  studyUid,
  modality,
  bodyPart,
  onClose,
}: {
  studyUid: string;
  modality?: string;
  bodyPart?: string;
  onClose: () => void;
}) {
  const [items, setItems] = useState<ReportItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [pastedText, setPastedText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [explainBusy, setExplainBusy] = useState(false);
  const [explain, setExplain] = useState<ExplainOutput | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => {
    setLoadingList(true);
    try {
      const r = await fetch(`/api/mcp/studies/${encodeURIComponent(studyUid)}/report`);
      const j = await r.json();
      setItems(Array.isArray(j?.reports) ? j.reports : []);
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    } finally {
      setLoadingList(false);
    }
  }, [studyUid]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const uploadFile = useCallback(
    async (file: File) => {
      setUploading(true);
      setErr(null);
      setOk(null);
      try {
        const fd = new FormData();
        fd.append('file', file, file.name);
        const r = await fetch(
          `/api/mcp/studies/${encodeURIComponent(studyUid)}/report`,
          { method: 'POST', body: fd },
        );
        const j = await r.json();
        if (!j?.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
        setOk(`Attached "${j.name}" (${j.kind})`);
        await refresh();
      } catch (e) {
        setErr(String((e as Error).message ?? e));
      } finally {
        setUploading(false);
      }
    },
    [studyUid, refresh],
  );

  const uploadText = useCallback(async () => {
    const t = pastedText.trim();
    if (!t) {
      setErr('Paste some text first');
      return;
    }
    setUploading(true);
    setErr(null);
    setOk(null);
    try {
      const fd = new FormData();
      fd.append('text', t);
      const r = await fetch(
        `/api/mcp/studies/${encodeURIComponent(studyUid)}/report`,
        { method: 'POST', body: fd },
      );
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setOk('Pasted note attached');
      setPastedText('');
      await refresh();
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    } finally {
      setUploading(false);
    }
  }, [pastedText, studyUid, refresh]);

  const explainItem = useCallback(
    async (text: string) => {
      if (!text.trim()) {
        setErr('This item has no extractable text');
        return;
      }
      setExplainBusy(true);
      setExplain(null);
      setErr(null);
      try {
        const r = await fetch('/api/mcp/ai/explain-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            study_uid: studyUid,
            modality: modality ?? '',
            body_part: bodyPart ?? '',
          }),
        });
        const j: ExplainOutput = await r.json();
        if (!j?.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
        setExplain(j);
      } catch (e) {
        setErr(String((e as Error).message ?? e));
      } finally {
        setExplainBusy(false);
      }
    },
    [studyUid, modality, bodyPart],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-4 py-3">
          <div className="flex items-center gap-2">
            <Paperclip className="h-4 w-4 text-cyan-400" />
            <div>
              <div className="text-sm font-bold text-slate-100">
                Patient Report
              </div>
              <div className="text-[10px] text-slate-500">
                Attach an external report (PDF / image / text) — it gets folded
                into the AI dossier automatically.
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

        {/* body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {/* upload */}
          <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-300">
              <Upload className="h-3.5 w-3.5 text-cyan-400" />
              Attach a file
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.txt,.doc,.docx,.png,.jpg,.jpeg,.tif,.tiff"
              className="block w-full text-xs text-slate-400 file:mr-3 file:rounded file:border-0 file:bg-cyan-500/20 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-cyan-200 hover:file:bg-cyan-500/30"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadFile(f);
                e.target.value = '';
              }}
              disabled={uploading}
            />
            <div className="mt-1 text-[10px] text-slate-500">
              Accepts referral letters, lab panels, prior imaging reports,
              discharge summaries, prescriptions, photos of hand-written notes.
            </div>
          </section>

          {/* paste */}
          <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-300">
              <FileText className="h-3.5 w-3.5 text-cyan-400" />
              Or paste plain text
            </div>
            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              rows={4}
              dir="auto"
              placeholder="Paste referral text, lab values, or any note the patient brought…"
              className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
              disabled={uploading}
            />
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={uploadText}
                disabled={uploading || !pastedText.trim()}
                className="flex items-center gap-1 rounded bg-cyan-500/20 px-3 py-1.5 text-[11px] font-bold text-cyan-200 hover:bg-cyan-500/30 disabled:opacity-40"
              >
                {uploading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Check className="h-3 w-3" />
                )}
                Attach note
              </button>
            </div>
          </section>

          {/* status */}
          {err && (
            <div className="flex items-start gap-2 rounded border border-rose-500/40 bg-rose-500/10 p-2 text-[11px] text-rose-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5" />
              <span>{err}</span>
            </div>
          )}
          {ok && (
            <div className="rounded border border-emerald-500/40 bg-emerald-500/10 p-2 text-[11px] text-emerald-300">
              {ok}
            </div>
          )}

          {/* list */}
          <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <div className="mb-2 flex items-center justify-between text-xs font-bold text-slate-300">
              <span>Attached reports ({items.length})</span>
              <button
                type="button"
                onClick={refresh}
                className="text-[10px] font-normal text-slate-500 hover:text-slate-300"
                disabled={loadingList}
              >
                {loadingList ? 'Loading…' : 'Refresh'}
              </button>
            </div>
            {items.length === 0 && !loadingList && (
              <div className="rounded border border-slate-800 bg-slate-900/40 p-3 text-center text-[11px] text-slate-500">
                No patient reports attached yet.
              </div>
            )}
            <div className="space-y-2">
              {items.map((it, i) => (
                <div
                  key={`${it.name}-${i}`}
                  className="flex items-start justify-between gap-2 rounded border border-slate-800 bg-slate-900/60 p-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-bold text-slate-200">
                      {it.name}
                    </div>
                    {it.text && (
                      <div className="mt-1 line-clamp-2 text-[10px] text-slate-500" dir="auto">
                        {it.text.slice(0, 200)}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => explainItem(it.text ?? '')}
                    disabled={explainBusy || !it.text}
                    className="flex shrink-0 items-center gap-1 rounded bg-fuchsia-500/20 px-2 py-1 text-[10px] font-bold text-fuchsia-200 hover:bg-fuchsia-500/30 disabled:opacity-40"
                  >
                    {explainBusy ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    Explain
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* explain output */}
          {explain && (
            <section className="rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/5 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold text-fuchsia-200">
                <Sparkles className="h-3.5 w-3.5" />
                AI Explanation
                <span className="ml-auto text-[10px] font-normal text-slate-500">
                  {explain.report_type ?? '—'} · {explain.language ?? '?'} ·{' '}
                  {explain.latency_ms ?? 0}ms
                </span>
              </div>
              {explain.summary && (
                <div className="rounded border border-slate-800 bg-slate-950/60 p-2 text-xs text-slate-200">
                  {explain.summary}
                </div>
              )}
              {(explain.red_flags ?? []).length > 0 && (
                <div className="mt-2 rounded border border-rose-500/40 bg-rose-500/10 p-2">
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-rose-300">
                    Red flags
                  </div>
                  <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-rose-200">
                    {explain.red_flags!.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}
              <TwoCol
                left={{ title: 'Key findings', items: explain.key_findings }}
                right={{ title: 'Diagnoses', items: explain.diagnoses_mentioned }}
              />
              <TwoCol
                left={{ title: 'Medications', items: explain.medications }}
                right={{ title: 'Dates', items: explain.dates }}
              />
              {explain.relevance_to_current_study && (
                <div className="mt-2 rounded border border-cyan-500/30 bg-cyan-500/5 p-2">
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-cyan-300">
                    Relevance to this study
                  </div>
                  <div className="text-[11px] text-slate-200">
                    {explain.relevance_to_current_study}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        {/* footer */}
        <div className="border-t border-slate-800 bg-slate-950 px-4 py-2 text-[10px] text-slate-500">
          Attached reports are merged into the AI dossier automatically — the
          Diagnose and Smart Report tools will use them as primary clinical
          context.
        </div>
      </div>
    </div>
  );
}

function TwoCol({
  left,
  right,
}: {
  left: { title: string; items?: string[] };
  right: { title: string; items?: string[] };
}) {
  const hasLeft = (left.items ?? []).length > 0;
  const hasRight = (right.items ?? []).length > 0;
  if (!hasLeft && !hasRight) return null;
  return (
    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
      {hasLeft && <Col title={left.title} items={left.items!} />}
      {hasRight && <Col title={right.title} items={right.items!} />}
    </div>
  );
}

function Col({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-950/60 p-2">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
        {title}
      </div>
      <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-slate-300">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}
