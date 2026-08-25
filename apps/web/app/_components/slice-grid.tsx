'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface Props {
  studyUid: string;
  imageIds: string[];
  activeIndex: number;
  onPickSlice: (index: number) => void;
}

/**
 * Renders all slices of a series as a scrollable thumbnail grid.
 * Uses one shared Cornerstone RenderingEngine + one small viewport per tile.
 * Each viewport pulls its own frame from the imageIds array.
 */
export function SliceGrid({ studyUid, imageIds, activeIndex, onPickSlice }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [progress, setProgress] = useState({ done: 0, total: imageIds.length });
  const csRef = useRef<any>(null);

  useEffect(() => {
    if (imageIds.length === 0) return;
    let cancelled = false;

    (async () => {
      try {
        const cs = await import('@cornerstonejs/core');
        const dicomLoader: any = await import('@cornerstonejs/dicom-image-loader');
        csRef.current = cs;

        // Ensure init (safe to call multiple times)
        try {
          await cs.init();
          const dicomInit = dicomLoader.init ?? dicomLoader.default?.init;
          await dicomInit({
            maxWebWorkers: Math.min(navigator.hardwareConcurrency || 2, 2),
          });
        } catch {
          // already initialised elsewhere — ignore
        }

        // Reuse main engine if present
        let eng = cs.getRenderingEngine('midcine-engine');
        if (!eng) {
          eng = new cs.RenderingEngine('midcine-engine');
        }

        setProgress({ done: 0, total: imageIds.length });
        setStatus('ready');

        // Enable each tile viewport + load its slice
        for (let i = 0; i < imageIds.length; i++) {
          if (cancelled) break;
          const el = containerRef.current?.querySelector<HTMLDivElement>(
            `[data-tile-index="${i}"]`,
          );
          if (!el) continue;
          const vpId = `midcine-grid-vp-${i}`;
          try {
            eng.enableElement({
              viewportId: vpId,
              type: cs.Enums.ViewportType.STACK,
              element: el,
              defaultOptions: { background: [0, 0, 0] as [number, number, number] },
            });
            const vp: any = eng.getViewport(vpId);
            await vp.setStack([imageIds[i]!], 0);
            vp.render();
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn(`[SliceGrid] tile ${i} failed:`, e);
          }
          setProgress((p) => ({ ...p, done: i + 1 }));
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[SliceGrid] init failed:', e);
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      try {
        const cs = csRef.current;
        const eng = cs?.getRenderingEngine?.('midcine-engine');
        if (eng) {
          for (let i = 0; i < imageIds.length; i++) {
            try {
              eng.disableElement(`midcine-grid-vp-${i}`);
            } catch {}
          }
        }
      } catch {}
    };
    // Only re-run when studyUid or imageIds count changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyUid, imageIds.length]);

  if (imageIds.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500">
        No slices to display
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-slate-950">
      {status === 'loading' && (
        <div className="border-b border-slate-800 bg-slate-900 px-3 py-1.5 text-[10px] text-slate-400">
          <Loader2 className="mr-2 inline h-3 w-3 animate-spin" />
          Loading {progress.done}/{progress.total} slices…
        </div>
      )}
      {status === 'ready' && progress.done < progress.total && (
        <div className="border-b border-slate-800 bg-slate-900 px-3 py-1 text-[10px] text-cyan-400">
          Rendering {progress.done}/{progress.total}
        </div>
      )}
      <div
        ref={containerRef}
        className="grid flex-1 auto-rows-fr gap-1 overflow-y-auto p-2"
        style={{
          gridTemplateColumns: `repeat(${Math.min(6, Math.ceil(Math.sqrt(imageIds.length)))}, minmax(0, 1fr))`,
        }}
      >
        {imageIds.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onPickSlice(i)}
            className={
              'group relative aspect-square overflow-hidden rounded border transition ' +
              (i === activeIndex
                ? 'border-cyan-400 ring-2 ring-cyan-400/50'
                : 'border-slate-800 hover:border-slate-600')
            }
          >
            <div
              data-tile-index={i}
              className="absolute inset-0 bg-black"
              onContextMenu={(e) => e.preventDefault()}
            />
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 py-0.5 text-[9px] font-mono text-slate-300">
              {i + 1}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
