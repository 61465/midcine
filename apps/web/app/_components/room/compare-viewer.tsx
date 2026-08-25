'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, X, ArrowLeftRight } from 'lucide-react';

const ENGINE_ID = 'midcine-compare-engine';
const VIEWPORT_ID = 'midcine-compare-vp';

interface Props {
  studyUid: string;
  patientName: string;
  modality: string;
  bodyPart: string;
  studyDate: string;
  onClose: () => void;
  onSwap: () => void;
}

/**
 * Lightweight companion viewer for side-by-side prior comparison.
 * Reuses cornerstone but with its OWN engine/viewport IDs so it does NOT
 * conflict with the main DicomViewer. 2D stack + wheel scroll + W/L only.
 */
export function CompareViewer({
  studyUid,
  patientName,
  modality,
  bodyPart,
  studyDate,
  onClose,
  onSwap,
}: Props) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [frameCount, setFrameCount] = useState(1);
  const csRef = useRef<any>(null);
  const imageIdsRef = useRef<string[]>([]);

  useEffect(() => {
    if (!elementRef.current) return;
    let cancelled = false;

    (async () => {
      try {
        const cs = await import('@cornerstonejs/core');
        const tools = await import('@cornerstonejs/tools');
        const dicomLoader: any = await import('@cornerstonejs/dicom-image-loader');
        csRef.current = cs;

        try {
          await cs.init();
          await tools.init();
          const dInit = dicomLoader.init ?? dicomLoader.default?.init;
          await dInit({ maxWebWorkers: Math.min(navigator.hardwareConcurrency || 2, 2) });
        } catch {}

        if (cancelled || !elementRef.current) return;

        // Fresh engine — namespaced away from main viewer
        try {
          const existing = cs.getRenderingEngine(ENGINE_ID);
          existing?.destroy?.();
        } catch {}
        const engine = new cs.RenderingEngine(ENGINE_ID);
        engine.enableElement({
          viewportId: VIEWPORT_ID,
          type: cs.Enums.ViewportType.STACK,
          element: elementRef.current,
          defaultOptions: { background: [0, 0, 0] as [number, number, number] },
        });

        // Attach tools — WindowLevel on left drag, StackScroll on wheel
        try {
          const {
            ToolGroupManager,
            WindowLevelTool,
            StackScrollTool,
            Enums: ToolEnums,
          } = tools;
          try {
            tools.addTool(WindowLevelTool);
            tools.addTool(StackScrollTool);
          } catch {}
          const TG_ID = 'midcine-compare-tools';
          const existing = ToolGroupManager.getToolGroup(TG_ID);
          if (existing) ToolGroupManager.destroyToolGroup(TG_ID);
          const tg = ToolGroupManager.createToolGroup(TG_ID);
          if (tg) {
            tg.addTool(WindowLevelTool.toolName);
            tg.addTool(StackScrollTool.toolName);
            tg.addViewport(VIEWPORT_ID, ENGINE_ID);
            tg.setToolActive(WindowLevelTool.toolName, {
              bindings: [{ mouseButton: ToolEnums.MouseBindings.Primary }],
            });
            tg.setToolActive(StackScrollTool.toolName, {
              bindings: [{ mouseButton: ToolEnums.MouseBindings.Wheel }],
            });
          }
        } catch {}

        // Load series or single-file
        let ids: string[] = [];
        try {
          const r = await fetch(`/api/mcp/studies/${encodeURIComponent(studyUid)}/series`);
          if (r.ok) {
            const info = (await r.json()) as { slices: string[]; slice_count: number };
            if (info.slice_count > 0) {
              ids = info.slices.map(
                (n) =>
                  `wadouri:/api/mcp/studies/${encodeURIComponent(studyUid)}/series/${encodeURIComponent(n)}`,
              );
            }
          }
        } catch {}
        if (ids.length === 0) {
          ids = [`wadouri:/api/mcp/studies/${encodeURIComponent(studyUid)}/dicom`];
        }

        if (cancelled) return;
        const vp: any = engine.getViewport(VIEWPORT_ID);
        await vp.setStack(ids, 0);
        vp.render();
        imageIdsRef.current = ids;
        setFrameCount(ids.length);

        // Track scroll
        const listener = () => {
          try {
            const idx = vp.getCurrentImageIdIndex?.() ?? 0;
            setFrameIndex(idx);
          } catch {}
        };
        elementRef.current.addEventListener(cs.Enums.Events.STACK_NEW_IMAGE, listener);

        setStatus('ready');
      } catch (e: any) {
        console.error('[CompareViewer] load failed:', e);
        setError(e?.message ?? String(e));
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      try {
        const cs = csRef.current;
        const eng = cs?.getRenderingEngine?.(ENGINE_ID);
        eng?.disableElement?.(VIEWPORT_ID);
        eng?.destroy?.();
      } catch {}
    };
  }, [studyUid]);

  const rel = useCallback((iso: string) => {
    if (!iso) return '';
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (days < 30) return `${days}d ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${(days / 365).toFixed(1)}y ago`;
  }, []);

  return (
    <div className="flex h-full flex-col bg-black">
      {/* Compare header */}
      <div className="flex items-center gap-2 border-b border-fuchsia-500/40 bg-fuchsia-500/5 px-3 py-1.5">
        <div className="rounded bg-fuchsia-500/30 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-fuchsia-200">
          PRIOR
        </div>
        <div className="flex-1 text-[10px]">
          <div className="font-bold text-fuchsia-200">
            {patientName} · {modality} · {bodyPart}
          </div>
          <div className="text-fuchsia-400">
            {new Date(studyDate).toLocaleDateString()} · {rel(studyDate)}
          </div>
        </div>
        <button
          type="button"
          onClick={onSwap}
          className="rounded p-1 text-fuchsia-300 hover:bg-fuchsia-500/20"
          title="Swap current ↔ prior"
        >
          <ArrowLeftRight className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-fuchsia-300 hover:bg-fuchsia-500/20"
          title="Close compare"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="relative flex-1">
        <div
          ref={elementRef}
          className="absolute inset-0 cursor-crosshair select-none"
          onContextMenu={(e) => e.preventDefault()}
        />
        {frameCount > 1 && (
          <div className="pointer-events-none absolute left-2 top-2 rounded bg-slate-950/80 px-2 py-1 font-mono text-[10px] text-slate-300 backdrop-blur-sm">
            Slice {frameIndex + 1} / {frameCount}
          </div>
        )}
        {status === 'loading' && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin text-fuchsia-400" />
            <div className="text-xs">Loading prior…</div>
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-rose-400">
            <span className="text-xs">Failed to load prior</span>
            <code className="max-w-md text-center text-[10px] text-rose-300">{error}</code>
          </div>
        )}
      </div>

      <div className="border-t border-slate-800 bg-slate-950 px-3 py-1 text-[9px] text-slate-500">
        Left drag = W/L · Wheel = scroll
      </div>
    </div>
  );
}
