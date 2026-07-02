'use client';

import { useEffect, useState } from 'react';
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  PenLine,
  Sparkles,
  BookOpen,
  ExternalLink,
} from 'lucide-react';
import type { PipelineResponse, StudyMetadata, AtlasSuggestion } from '../../lib/mcp';
import { runPipeline } from '../../lib/mcp';
import { getCondition, ORGAN_META, SEVERITY_STYLES } from '../_components/anatomy/atlas-registry';

type State =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'done'; data: PipelineResponse }
  | { status: 'error'; message: string };

export function EnsemblePanel({
  study,
  onDone,
}: {
  study: StudyMetadata;
  onDone?: (data: PipelineResponse) => void;
}) {
  const [state, setState] = useState<State>({ status: 'idle' });
  const [autorun, setAutorun] = useState(true);

  useEffect(() => {
    if (!autorun) return;
    let cancelled = false;
    setState({ status: 'running' });
    runPipeline(study)
      .then((data) => {
        if (!cancelled) {
          setState({ status: 'done', data });
          onDone?.(data);
        }
      })
      .catch((e) => {
        if (!cancelled) setState({ status: 'error', message: e?.message ?? String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [autorun, study.study_uid]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Header */}
      <div className="card-luxury flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2">
          <div className="bg-gradient-navy text-gold-400 flex h-8 w-8 items-center justify-center rounded-lg">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div className="text-brand-800 text-sm font-bold">NEXUS Ensemble</div>
            <div className="text-muted-foreground text-[10px]">
              وكلاء AI بالتوازي · via mcp-bridge
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setAutorun((a) => !a)}
          className="border-border text-muted-foreground hover:border-gold-400 hover:text-gold-500 rounded-full border px-3 py-1 text-[10px] font-bold transition"
        >
          {autorun ? 'أوقف' : 'شغّل'}
        </button>
      </div>

      {/* Results scroll */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {state.status === 'idle' && (
          <div className="card-luxury text-muted-foreground flex h-40 items-center justify-center text-sm">
            جاهز — اضغط "شغّل"
          </div>
        )}

        {state.status === 'running' && (
          <div className="card-luxury text-muted-foreground flex h-40 flex-col items-center justify-center gap-3">
            <Loader2 className="text-gold-400 h-6 w-6 animate-spin" />
            <div className="text-sm">استدعاء الوكلاء بالتوازي…</div>
            <div className="ltr-only text-[10px]">via mcp-bridge → naraya · mistral-large</div>
          </div>
        )}

        {state.status === 'error' && (
          <div className="card-luxury text-priority-p1 flex flex-col items-center gap-2 p-4 text-sm">
            <AlertTriangle className="h-5 w-5" />
            <div className="text-center font-bold">تعذّر الاتصال بـ mcp-bridge</div>
            <div className="ltr-only text-muted-foreground text-center text-[10px]">
              {state.message}
            </div>
            <div className="text-muted-foreground mt-2 text-[10px]">
              تحقّق:{' '}
              <code className="bg-muted rounded px-1 py-0.5">.\scripts\start-mcp-bridge.ps1</code>
            </div>
          </div>
        )}

        {state.status === 'done' && (
          <>
            {/* Overall verdict */}
            <div className="card-luxury">
              <div className="flex items-center justify-between p-4">
                <div>
                  <div className="section-label mb-1 text-[10px]">consensus</div>
                  <div className="text-brand-800 text-xl font-black">
                    {Math.round(state.data.aggregate.overall_confidence * 100)}%
                    <span className="text-muted-foreground text-sm font-normal"> confidence</span>
                  </div>
                </div>
                {state.data.aggregate.requires_human_review ? (
                  <div className="flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-[10px] font-bold text-amber-800">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    مراجعة بشرية
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-bold text-emerald-800">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    تلقائي
                  </div>
                )}
              </div>
              <div className="border-border/60 bg-muted/40 text-muted-foreground border-t px-4 py-2 text-[10px]">
                {state.data.dispatched_agents.length} agents · latency{' '}
                {Math.round(state.data.total_latency_ms)}ms
              </div>
            </div>

            {/* Per-agent findings */}
            {state.data.outputs.map((o) => (
              <div key={o.agent} className="card-luxury">
                <div className="border-border/40 flex items-center justify-between border-b p-3">
                  <span className="ltr-only text-brand-800 font-mono text-sm font-bold">
                    {o.agent}
                  </span>
                  <div className="flex items-center gap-2 text-[10px]">
                    {o.ok ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-emerald-700">
                        ✓
                      </span>
                    ) : (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 font-bold text-red-700">
                        ✗
                      </span>
                    )}
                    {o.confidence != null && (
                      <span className="ltr-only text-muted-foreground">
                        {Math.round(o.confidence * 100)}%
                      </span>
                    )}
                    <span className="ltr-only text-muted-foreground">
                      {Math.round(o.latency_ms)}ms
                    </span>
                  </div>
                </div>
                <div className="text-brand-800 p-3 text-sm">
                  {o.summary || o.error || <span className="text-muted-foreground">—</span>}
                </div>
              </div>
            ))}

            {/* Atlas suggestions — AI-matched conditions → midcine SVGs */}
            {state.data.aggregate.atlas_suggestions.length > 0 && (
              <AtlasSuggestionsSection suggestions={state.data.aggregate.atlas_suggestions} />
            )}

            {/* Disagreements */}
            {state.data.aggregate.disagreements.length > 0 && (
              <div className="card-luxury border-amber-200 bg-amber-50/70">
                <div className="p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-bold text-amber-800">
                    <AlertTriangle className="h-4 w-4" />
                    نقاط اختلاف
                  </div>
                  <ul className="space-y-1 text-xs text-amber-900">
                    {state.data.aggregate.disagreements.map((d, i) => (
                      <li key={i}>
                        <span className="font-bold">{d.topic}:</span> {d.detail}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Sign-off actions */}
            <div className="card-luxury">
              <div className="flex items-center justify-between p-3">
                <div className="text-muted-foreground flex items-center gap-2 text-xs">
                  <PenLine className="h-3.5 w-3.5" />
                  مسودّة تقرير
                </div>
                <div className="flex gap-2">
                  <button className="border-border hover:bg-muted rounded-lg border px-3 py-1 text-xs">
                    حفظ
                  </button>
                  <button className="btn-luxury px-3 py-1 text-xs">توقيع</button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Atlas suggestions — renders AI-matched pathology cards using midcine SVGs
// ─────────────────────────────────────────────────────────────────────────────
function AtlasSuggestionsSection({ suggestions }: { suggestions: AtlasSuggestion[] }) {
  const [expanded, setExpanded] = useState<AtlasSuggestion | null>(null);
  return (
    <>
      <div className="card-luxury border-cyan-200 bg-gradient-to-l from-cyan-50 to-sky-50">
        <div className="p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-cyan-900">
            <BookOpen className="h-4 w-4" />
            حالات مطابقة من الأطلس
            <span className="ml-auto rounded-full bg-cyan-200 px-2 py-0.5 text-[10px] text-cyan-900">
              {suggestions.length}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {suggestions.map((s) => {
              const cond = getCondition(s.organ, s.condition_id);
              if (!cond) return null;
              const meta = ORGAN_META[s.organ];
              const st = SEVERITY_STYLES[cond.severity];
              const Icon = meta.icon;
              return (
                <button
                  key={`${s.organ}-${s.condition_id}`}
                  type="button"
                  onClick={() => setExpanded(s)}
                  className={`flex items-center gap-2 rounded-lg ring-1 ring-inset ${st.bg} ${st.ring} p-2 text-right transition`}
                >
                  <div className={`h-16 w-16 flex-shrink-0 overflow-hidden rounded bg-white`}>
                    {cond.render()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <Icon className={`h-3 w-3 ${meta.color}`} />
                      <span className="text-xs font-bold text-slate-800">{s.label_ar}</span>
                      <span className={`ml-auto rounded-full px-1.5 py-0.5 text-[9px] ${st.badge}`}>
                        {st.label}
                      </span>
                    </div>
                    <div className="ltr-only mt-0.5 text-[9px] text-slate-500">{s.label_en}</div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full bg-cyan-500"
                          style={{ width: `${Math.round(s.confidence * 100)}%` }}
                        />
                      </div>
                      <span className="text-[9px] font-bold text-cyan-700">
                        {Math.round(s.confidence * 100)}%
                      </span>
                    </div>
                    <div className="mt-1 text-[9px] text-slate-500">via {s.agents.join(', ')}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {expanded && <ExpandedSuggestion suggestion={expanded} onClose={() => setExpanded(null)} />}
    </>
  );
}

function ExpandedSuggestion({
  suggestion,
  onClose,
}: {
  suggestion: AtlasSuggestion;
  onClose: () => void;
}) {
  const cond = getCondition(suggestion.organ, suggestion.condition_id);
  if (!cond) return null;
  const meta = ORGAN_META[suggestion.organ];
  const Icon = meta.icon;
  const st = SEVERITY_STYLES[cond.severity];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-gray-200 bg-slate-50 px-4 py-3">
          <Icon className={`h-5 w-5 ${meta.color}`} />
          <div>
            <div className="text-lg font-bold text-slate-800">{suggestion.label_ar}</div>
            <div className="ltr-only text-xs text-slate-500">{suggestion.label_en}</div>
          </div>
          <div className="flex-1" />
          <span className={`rounded-full px-3 py-1 text-[11px] ${st.badge}`}>{st.label}</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
          >
            ×
          </button>
        </div>
        <div className="grid gap-4 overflow-y-auto p-4 lg:grid-cols-2">
          <div className="aspect-square overflow-hidden rounded-lg border border-gray-200 bg-white">
            {cond.render()}
          </div>
          <div className="space-y-3 text-sm">
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                الوصف الإكلينيكي
              </div>
              <p className="leading-relaxed text-slate-700">{cond.descriptionAr}</p>
            </div>
            <div className="rounded-lg bg-cyan-50 p-3 text-xs text-cyan-900">
              <div className="mb-1 font-bold">دلائل مطابقة الـ AI</div>
              <div className="ltr-only mb-1 text-[10px]">
                <span className="font-bold">keywords:</span>{' '}
                {suggestion.matched_keywords.join(', ')}
              </div>
              <div className="ltr-only text-[10px]">
                <span className="font-bold">agents:</span> {suggestion.agents.join(', ')}
              </div>
              <div className="ltr-only mt-1 text-[10px]">
                <span className="font-bold">confidence:</span>{' '}
                {Math.round(suggestion.confidence * 100)}%
              </div>
            </div>
            {cond.radiopaediaUrl && (
              <a
                href={cond.radiopaediaUrl}
                target="_blank"
                rel="noopener"
                className="ltr-only inline-flex items-center gap-1.5 rounded-full bg-cyan-600 px-4 py-2 text-xs font-bold text-white hover:bg-cyan-500"
              >
                حالات مماثلة على Radiopaedia <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
