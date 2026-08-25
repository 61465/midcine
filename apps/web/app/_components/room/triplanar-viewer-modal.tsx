'use client';

/**
 * TriplanarViewerModal — fullscreen popup with 3 REAL Cornerstone3D
 * orthographic viewports (Axial / Sagittal / Coronal) synced by CrosshairsTool.
 * Click any pane → captures pane + slice + point-of-interest → sends to
 * /ai/vision-see-region → floating AI panel on the right shows normal/abnormal
 * verdict + description + differential.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles, X, AlertTriangle, CheckCircle } from 'lucide-react';
import { visionSeeRegion, type VisionSeeRegionResult } from '../../../lib/studies';

type Plane = 'axial' | 'sagittal' | 'coronal';

interface Props {
  studyUid: string;
  totalSlices: number;
  onClose: () => void;
}

interface ClickInfo {
  plane: Plane;
  sliceIndex: number;
  roiX: number;
  roiY: number;
}

const PLANE_LABEL_COLORS: Record<Plane, string> = {
  axial: 'bg-cyan-500/20 text-cyan-300',
  sagittal: 'bg-rose-500/20 text-rose-300',
  coronal: 'bg-emerald-500/20 text-emerald-300',
};

const ENGINE_ID = 'midcine-triplanar';
const TOOL_GROUP_ID = 'midcine-triplanar-tools';
const VP_IDS: Record<Plane, string> = {
  axial: 'triplanar-ax',
  sagittal: 'triplanar-sag',
  coronal: 'triplanar-cor',
};

export function TriplanarViewerModal({ studyUid, totalSlices, onClose }: Props) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [step, setStep] = useState<string>('Initializing…');
  const [error, setError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<VisionSeeRegionResult | null>(null);
  const [clickInfo, setClickInfo] = useState<ClickInfo | null>(null);
  const [focusedPane, setFocusedPane] = useState<Plane>('axial');
  const [seriesGroups, setSeriesGroups] = useState<
    Array<{ series_uid: string; description: string; slice_count: number }>
  >([]);
  const [activeSeriesUid, setActiveSeriesUid] = useState<string | null>(null);

  const axRef = useRef<HTMLDivElement | null>(null);
  const sagRef = useRef<HTMLDivElement | null>(null);
  const corRef = useRef<HTMLDivElement | null>(null);
  const csRef = useRef<any>(null);
  const toolsRef = useRef<any>(null);
  const engineRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);
  const disposedRef = useRef(false);

  // ---- Setup: load Cornerstone3D + build volume + enable 3 viewports ----
  useEffect(() => {
    disposedRef.current = false;
    let cancelled = false;

    (async () => {
      try {
        setStep('Loading Cornerstone…');
        const cs = await import('@cornerstonejs/core');
        const tools = await import('@cornerstonejs/tools');
        const dicomLoader: any = await import('@cornerstonejs/dicom-image-loader');
        csRef.current = cs;
        toolsRef.current = tools;

        // Cornerstone3D + tools init is idempotent — safe to call again
        try {
          await cs.init();
          await tools.init();
        } catch {}
        try {
          const dicomInit = dicomLoader.init ?? dicomLoader.default?.init;
          if (dicomInit) await dicomInit({ maxWebWorkers: 2 });
        } catch {}
        if (cancelled) return;

        setStep('Fetching series…');
        // Fetch either the primary series (default) or the doctor's chosen sub-series
        const seriesUrl = activeSeriesUid
          ? `/api/mcp/studies/${encodeURIComponent(studyUid)}/series/group/${encodeURIComponent(activeSeriesUid)}`
          : `/api/mcp/studies/${encodeURIComponent(studyUid)}/series`;
        const seriesRes = await fetch(seriesUrl);
        const seriesJson = await seriesRes.json();
        const slices: string[] = Array.isArray(seriesJson?.slices)
          ? seriesJson.slices
          : [];
        if (Array.isArray(seriesJson?.groups) && seriesJson.groups.length > 0) {
          setSeriesGroups(seriesJson.groups);
          if (!activeSeriesUid && seriesJson.primary_series_uid) {
            setActiveSeriesUid(seriesJson.primary_series_uid);
          }
        }
        if (slices.length === 0) {
          setStatus('error');
          setError('No series slices found for this study');
          return;
        }
        const imageIds = slices.map(
          (name) =>
            `wadouri:/api/mcp/studies/${encodeURIComponent(studyUid)}/series/${encodeURIComponent(name)}`,
        );

        setStep('Building volume…');
        // Include series UID in volumeId so switching sub-series builds a
        // fresh volume (avoids texSubImage3D size-mismatch on the old cache).
        const seriesSuffix = activeSeriesUid ? `-${activeSeriesUid.slice(-16)}` : '-primary';
        const volumeId = `cornerstoneStreamingImageVolume:midcine-triplanar-${studyUid}${seriesSuffix}`;
        // Try to clean any prior cached volume with the same id
        try {
          cs.cache.removeVolumeLoadObject?.(volumeId);
        } catch {}
        const volume: any = await cs.volumeLoader.createAndCacheVolume(volumeId, {
          imageIds,
        });
        // Trigger volume load — don't await here (streaming volume); we'll
        // re-render as slices arrive via 3 delayed render passes below.
        try { volume.load?.(); } catch {}
        if (cancelled) return;

        setStep('Enabling viewports…');
        // Wait one frame so the flex/grid layout has real width×height —
        // Cornerstone captures the canvas size at enableElement and if the
        // panes are still 0×0 you get a tiny canvas → the doctor sees a
        // fragmented tile instead of the full slice.
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        await new Promise((r) => setTimeout(r, 30));
        if (cancelled) return;
        if (!axRef.current || !sagRef.current || !corRef.current) {
          setStatus('error');
          setError('Viewport panes not mounted');
          return;
        }

        // Fresh engine per modal — avoids conflicts with the main viewer.
        let eng: any;
        try {
          eng = new cs.RenderingEngine(ENGINE_ID);
        } catch {
          eng = cs.getRenderingEngine(ENGINE_ID);
        }
        engineRef.current = eng;

        const panes: Array<{ id: string; el: HTMLDivElement; orient: any }> = [
          { id: VP_IDS.axial, el: axRef.current, orient: cs.Enums.OrientationAxis.AXIAL },
          { id: VP_IDS.sagittal, el: sagRef.current, orient: cs.Enums.OrientationAxis.SAGITTAL },
          { id: VP_IDS.coronal, el: corRef.current, orient: cs.Enums.OrientationAxis.CORONAL },
        ];
        for (const p of panes) {
          try {
            eng.enableElement({
              viewportId: p.id,
              type: cs.Enums.ViewportType.ORTHOGRAPHIC,
              element: p.el,
              defaultOptions: {
                background: [0, 0, 0],
                orientation: p.orient,
              },
            });
          } catch (e) {
            console.warn(`[triplanar] enableElement failed for ${p.id}:`, e);
          }
        }

        // Load the volume into all 3 viewports
        await cs.setVolumesForViewports(
          eng,
          [{ volumeId }],
          panes.map((p) => p.id),
        );
        // Force engine to re-measure ALL viewport canvases against the actual
        // DOM sizes. Without this, streaming volumes render on the initial
        // (possibly-tiny) canvas → the doctor sees a "cropped/fragmented" tile.
        try { eng.resize(true, true); } catch {}

        for (const p of panes) {
          const vp: any = eng.getViewport(p.id);
          vp?.resetCamera?.();
          vp?.render();
        }
        // 3 retry passes so slow streaming volumes end up filling the pane
        // once slices arrive from the wadouri loader.
        for (const delay of [300, 900, 2000]) {
          setTimeout(() => {
            if (disposedRef.current) return;
            try { eng.resize(true, true); } catch {}
            for (const p of panes) {
              const vp: any = eng.getViewport?.(p.id);
              vp?.resetCamera?.();
              vp?.render?.();
            }
          }, delay);
        }

        // ResizeObserver: any layout change (window resize, sidebar toggle,
        // fullscreen etc.) → tell the engine to re-fit canvases.
        try {
          const ro = new ResizeObserver(() => {
            if (disposedRef.current) return;
            try { eng.resize(true, true); } catch {}
          });
          for (const p of panes) ro.observe(p.el);
          (engineRef as any).current.__ro = ro;
        } catch {}

        setStep('Setting up tools + crosshairs…');
        // Register tools (idempotent)
        const {
          ToolGroupManager,
          CrosshairsTool,
          StackScrollTool,
          ZoomTool,
          PanTool,
          Enums: ToolEnums,
        } = tools;
        for (const T of [CrosshairsTool, StackScrollTool, ZoomTool, PanTool]) {
          try {
            tools.addTool(T);
          } catch {}
        }
        // Fresh tool group per modal
        try {
          ToolGroupManager.destroyToolGroup?.(TOOL_GROUP_ID);
        } catch {}
        const tg = ToolGroupManager.createToolGroup(TOOL_GROUP_ID);
        if (!tg) throw new Error('Tool group creation failed');
        for (const T of [CrosshairsTool, StackScrollTool, ZoomTool, PanTool]) {
          try {
            tg.addTool(T.toolName);
          } catch {}
        }
        for (const p of panes) tg.addViewport(p.id, ENGINE_ID);

        // Configure & activate crosshairs
        try {
          tg.setToolConfiguration(CrosshairsTool.toolName, {
            getReferenceLineColor: (viewportId: string) => {
              if (viewportId.includes('ax')) return 'rgb(0, 200, 255)';
              if (viewportId.includes('sag')) return 'rgb(255, 90, 90)';
              if (viewportId.includes('cor')) return 'rgb(120, 255, 120)';
              return 'rgb(255,255,255)';
            },
            getReferenceLineControllable: () => true,
            getReferenceLineDraggableRotatable: () => true,
            getReferenceLineSlabThicknessControlsOn: () => false,
          });
          tg.setToolActive(CrosshairsTool.toolName, {
            bindings: [{ mouseButton: ToolEnums.MouseBindings.Primary }],
          });
        } catch (e) {
          console.warn('[triplanar] crosshairs config failed:', e);
        }
        // Always-on wheel scroll + middle-mouse pan + right-mouse zoom
        try {
          tg.setToolActive(StackScrollTool.toolName, {
            bindings: [{ mouseButton: ToolEnums.MouseBindings.Wheel }],
          });
          tg.setToolActive(PanTool.toolName, {
            bindings: [{ mouseButton: ToolEnums.MouseBindings.Auxiliary }],
          });
          tg.setToolActive(ZoomTool.toolName, {
            bindings: [{ mouseButton: ToolEnums.MouseBindings.Secondary }],
          });
        } catch {}

        if (!cancelled) {
          setStatus('ready');
          setStep('');
        }
      } catch (e) {
        console.error('[triplanar] setup failed:', e);
        if (!cancelled) {
          setStatus('error');
          setError(String((e as Error).message ?? e));
        }
      }
    })();

    return () => {
      cancelled = true;
      disposedRef.current = true;
      // Clean up viewports + engine
      try {
        const cs = csRef.current;
        const tools = toolsRef.current;
        try {
          (engineRef.current as any)?.__ro?.disconnect?.();
        } catch {}
        if (tools?.ToolGroupManager) {
          try {
            tools.ToolGroupManager.destroyToolGroup(TOOL_GROUP_ID);
          } catch {}
        }
        if (cs) {
          const eng = cs.getRenderingEngine?.(ENGINE_ID);
          if (eng) {
            for (const id of Object.values(VP_IDS)) {
              try {
                eng.disableElement?.(id);
              } catch {}
            }
            try {
              eng.destroy?.();
            } catch {}
          }
        }
      } catch {}
    };
  }, [studyUid, activeSeriesUid]);

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '1') setFocusedPane('axial');
      if (e.key === '2') setFocusedPane('sagittal');
      if (e.key === '3') setFocusedPane('coronal');
      if (e.key === 'a' || e.key === 'A') void analyzeCurrentPane();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedPane]);

  // ---- Analyze helpers ----
  const analyzeAt = useCallback(
    async (info: ClickInfo) => {
      abortRef.current?.abort();
      const ctl = new AbortController();
      abortRef.current = ctl;
      setBusy(true);
      setResult(null);
      setClickInfo(info);
      try {
        const res = await visionSeeRegion(studyUid, {
          plane: info.plane,
          slice_index: info.sliceIndex,
          roi_x: info.roiX,
          roi_y: info.roiY,
        });
        if (ctl.signal.aborted) return;
        setResult(res);
      } catch (e) {
        if (!ctl.signal.aborted) {
          setResult({ ok: false, error: String((e as Error).message ?? e) });
        }
      } finally {
        if (!ctl.signal.aborted) setBusy(false);
      }
    },
    [studyUid],
  );

  const currentSliceIndex = useCallback((plane: Plane): number => {
    try {
      const cs = csRef.current;
      const eng = engineRef.current ?? cs?.getRenderingEngine?.(ENGINE_ID);
      const vp: any = eng?.getViewport?.(VP_IDS[plane]);
      const idx = vp?.getCurrentImageIdIndex?.();
      return typeof idx === 'number' ? idx : 0;
    } catch {
      return 0;
    }
  }, []);

  const analyzeCurrentPane = useCallback(() => {
    return analyzeAt({
      plane: focusedPane,
      sliceIndex: currentSliceIndex(focusedPane),
      roiX: 0.5,
      roiY: 0.5,
    });
  }, [analyzeAt, focusedPane, currentSliceIndex]);

  const onPaneClick =
    (plane: Plane) => (e: React.MouseEvent<HTMLDivElement>) => {
      // Alt+click captures the click coordinate for AI analysis. Plain click
      // is reserved for the CrosshairsTool (moves the crosshair). This lets
      // the doctor navigate freely, then Alt+click any point to analyze.
      if (!e.altKey) return;
      setFocusedPane(plane);
      const rect = e.currentTarget.getBoundingClientRect();
      const roiX = (e.clientX - rect.left) / rect.width;
      const roiY = (e.clientY - rect.top) / rect.height;
      void analyzeAt({
        plane,
        sliceIndex: currentSliceIndex(plane),
        roiX: Math.max(0, Math.min(1, roiX)),
        roiY: Math.max(0, Math.min(1, roiY)),
      });
    };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/98 backdrop-blur">
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950 px-4 py-2">
        <div className="flex items-center gap-3">
          <Sparkles className="h-4 w-4 text-cyan-400" />
          <div>
            <div className="text-sm font-bold text-slate-100">
              Triplanar Viewer + AI
            </div>
            <div className="text-[10px] text-slate-500">
              Left-drag = move crosshair · Alt+click = AI-analyze point · Wheel = scroll ·
              1/2/3 focus pane · A auto-analyze · Esc close
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {seriesGroups.length > 1 && (
            <label className="flex items-center gap-1 text-[10px] text-slate-400">
              <span className="uppercase tracking-widest text-slate-500">Series</span>
              <select
                value={activeSeriesUid ?? ''}
                onChange={(e) => {
                  setResult(null);
                  setClickInfo(null);
                  setStatus('loading');
                  setActiveSeriesUid(e.target.value);
                }}
                disabled={status === 'loading'}
                className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[11px] text-cyan-300 focus:border-cyan-500 focus:outline-none disabled:opacity-40"
                title="Switch between T1/T2/localizer/… in this study"
              >
                {seriesGroups.map((g) => {
                  const label = g.description || g.series_uid.slice(-10);
                  return (
                    <option key={g.series_uid} value={g.series_uid}>
                      {label} ({g.slice_count})
                    </option>
                  );
                })}
              </select>
            </label>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main grid: 3 panes + AI panel */}
      <div className="flex min-h-0 flex-1">
        <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-1 p-1">
          <Pane
            plane="axial"
            focused={focusedPane === 'axial'}
            onClick={onPaneClick('axial')}
            onFocusPane={() => setFocusedPane('axial')}
            elRef={axRef}
          />
          <Pane
            plane="sagittal"
            focused={focusedPane === 'sagittal'}
            onClick={onPaneClick('sagittal')}
            onFocusPane={() => setFocusedPane('sagittal')}
            elRef={sagRef}
          />
          <Pane
            plane="coronal"
            focused={focusedPane === 'coronal'}
            onClick={onPaneClick('coronal')}
            onFocusPane={() => setFocusedPane('coronal')}
            elRef={corRef}
          />
          {/* Legend + shortcuts + auto-analyze */}
          <div className="flex flex-col items-center justify-center rounded-lg border border-slate-800 bg-slate-900/50 p-4 text-center">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Legend
            </div>
            <div className="space-y-1 text-[11px]">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-4 rounded bg-cyan-500" />
                <span className="text-slate-300">Axial (top-down)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-4 rounded bg-rose-500" />
                <span className="text-slate-300">Sagittal (side)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-4 rounded bg-emerald-500" />
                <span className="text-slate-300">Coronal (front)</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void analyzeCurrentPane()}
              disabled={busy || status !== 'ready'}
              className="mt-4 flex items-center gap-1 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-cyan-400 disabled:opacity-40"
            >
              {busy ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              Auto-analyze focused pane (A)
            </button>
            <div className="mt-2 text-[9px] text-slate-500">
              Hold <kbd className="rounded bg-slate-800 px-1 py-0.5">Alt</kbd>{' '}
              and click anywhere on a pane to analyze that exact point.
            </div>
            {status === 'loading' && (
              <div className="mt-4 flex items-center gap-2 text-[10px] text-slate-400">
                <Loader2 className="h-3 w-3 animate-spin" />
                {step}
              </div>
            )}
            {status === 'error' && (
              <div className="mt-4 rounded border border-rose-500/40 bg-rose-500/10 p-2 text-[10px] text-rose-300">
                {error ?? 'Load failed'}
              </div>
            )}
          </div>
        </div>

        {/* AI panel */}
        <aside className="w-[340px] shrink-0 overflow-y-auto border-l border-slate-800 bg-slate-950 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold text-cyan-300">
            <Sparkles className="h-3.5 w-3.5" />
            AI Analysis
          </div>
          {!clickInfo && !busy && (
            <div className="rounded-lg border border-dashed border-slate-700 p-6 text-center text-[11px] text-slate-500">
              Alt-click any point on a pane, or press{' '}
              <kbd className="rounded bg-slate-800 px-1 py-0.5 text-[10px]">A</kbd>{' '}
              to auto-analyze the focused pane.
            </div>
          )}
          {clickInfo && (
            <div className="mb-2 rounded border border-slate-800 bg-slate-900/60 p-2 text-[10px] text-slate-400">
              <span
                className={`mr-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                  PLANE_LABEL_COLORS[clickInfo.plane]
                }`}
              >
                {clickInfo.plane}
              </span>
              Slice {clickInfo.sliceIndex + 1}/{totalSlices} · point (
              {(clickInfo.roiX * 100).toFixed(0)}%,{' '}
              {(clickInfo.roiY * 100).toFixed(0)}%)
            </div>
          )}
          {busy && (
            <div className="flex items-center gap-2 py-4 text-[11px] text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />
              AI is reading this slice…
            </div>
          )}
          {result && !busy && <AiResultPanel result={result} />}
        </aside>
      </div>
    </div>
  );
}

function Pane({
  plane,
  focused,
  onClick,
  onFocusPane,
  elRef,
}: {
  plane: Plane;
  focused: boolean;
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  onFocusPane: () => void;
  elRef: React.RefObject<HTMLDivElement | null>;
}) {
  const label = plane.charAt(0).toUpperCase() + plane.slice(1);
  const borderColor = focused
    ? plane === 'axial'
      ? 'border-cyan-500/60'
      : plane === 'sagittal'
        ? 'border-rose-500/60'
        : 'border-emerald-500/60'
    : 'border-slate-800';
  return (
    <div
      className={`relative rounded-lg border-2 bg-black transition ${borderColor}`}
      onMouseDown={onFocusPane}
      onClickCapture={onClick}
    >
      <div
        className={`absolute left-2 top-2 z-10 rounded px-2 py-0.5 text-[10px] font-bold ${PLANE_LABEL_COLORS[plane]}`}
      >
        {label}
      </div>
      {/* The actual Cornerstone3D viewport mounts here */}
      <div
        ref={elRef}
        className="absolute inset-0"
        style={{ oncontextmenu: 'return false;' } as React.CSSProperties}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}

function AiResultPanel({ result }: { result: VisionSeeRegionResult }) {
  if (!result.ok) {
    return (
      <div className="rounded border border-rose-500/40 bg-rose-500/10 p-2 text-[11px] text-rose-300">
        <div className="mb-1 flex items-center gap-1 font-bold">
          <AlertTriangle className="h-3 w-3" />
          Analysis failed
        </div>
        <div>{result.error ?? 'Unknown error'}</div>
      </div>
    );
  }
  const p = result.parsed ?? {};
  const verdict = (p.verdict || 'indeterminate').toLowerCase();
  const priority = (p.acr_priority || 'routine').toLowerCase();
  const verdictColor =
    verdict === 'normal'
      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
      : verdict === 'abnormal'
        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
        : 'bg-amber-500/20 text-amber-300 border-amber-500/40';
  const priorityColor =
    priority === 'stat'
      ? 'bg-rose-500 text-white'
      : priority === 'urgent'
        ? 'bg-amber-500 text-slate-950'
        : 'bg-slate-700 text-slate-300';
  return (
    <div className="space-y-2">
      <div
        className={`flex items-center justify-between rounded border p-2 text-[11px] ${verdictColor}`}
      >
        <span className="flex items-center gap-1 font-bold uppercase">
          {verdict === 'normal' && <CheckCircle className="h-3 w-3" />}
          {verdict === 'abnormal' && <AlertTriangle className="h-3 w-3" />}
          {verdict}
        </span>
        <span
          className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${priorityColor}`}
        >
          {priority}
        </span>
      </div>
      {p.anatomy_at_point && (
        <Info title="Anatomy at point" text={p.anatomy_at_point} />
      )}
      {p.description && <Info title="Description" text={p.description} />}
      {p.differential && p.differential.length > 0 && (
        <div>
          <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
            Differential
          </div>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-[10px] text-slate-300">
            {p.differential.slice(0, 3).map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </div>
      )}
      {p.recommended_next_view && (
        <Info title="Recommended next view" text={p.recommended_next_view} colored />
      )}
      <div className="flex items-center justify-between border-t border-slate-800 pt-2 text-[9px] text-slate-500">
        <span>{result.provider ?? 'ai'}</span>
        {typeof p.confidence === 'number' && (
          <span>confidence {(p.confidence * 100).toFixed(0)}%</span>
        )}
        <span>{result.latency_ms ?? 0}ms</span>
      </div>
    </div>
  );
}

function Info({
  title,
  text,
  colored = false,
}: {
  title: string;
  text: string;
  colored?: boolean;
}) {
  return (
    <div>
      <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
        {title}
      </div>
      <div className={`text-[11px] ${colored ? 'text-cyan-300' : 'text-slate-200'}`}>
        {text}
      </div>
    </div>
  );
}
