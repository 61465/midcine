'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface Props {
  studyUid: string;
  sliceIndex: number;
  className?: string;
}

interface SegResult {
  ok: boolean;
  mask_png_base64?: string;
  statistics?: Record<string, number>;
  latency_ms?: number;
  error?: string;
}

/**
 * Fetches server-computed multi-tissue segmentation mask for the current slice.
 * Displays it as a translucent overlay + a small stats panel bottom-right.
 */
export function SegmentationOverlay({ studyUid, sliceIndex, className }: Props) {
  const [data, setData] = useState<SegResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [opacity, setOpacity] = useState(0.55);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const r = await fetch('/api/mcp/ai/segment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify({ study_uid: studyUid, slice_index: sliceIndex }),
        });
        const d = (await r.json()) as SegResult;
        if (!cancelled) setData(d);
      } catch (e: any) {
        if (!cancelled) setData({ ok: false, error: String(e) });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studyUid, sliceIndex]);

  return (
    <div className={className}>
      {data?.ok && data.mask_png_base64 && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`data:image/png;base64,${data.mask_png_base64}`}
          alt="segmentation"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            opacity,
            mixBlendMode: 'screen',
          }}
        />
      )}
      {loading && (
        <div className="pointer-events-none absolute left-2 top-14 flex items-center gap-1 rounded bg-slate-950/80 px-2 py-1 text-[10px] text-emerald-300 backdrop-blur">
          <Loader2 className="h-3 w-3 animate-spin" />
          Segmenting…
        </div>
      )}
      {data?.ok && data.statistics && (
        <div className="pointer-events-auto absolute bottom-14 right-2 rounded border border-emerald-500/30 bg-slate-950/90 p-2 font-mono text-[10px] text-emerald-200 backdrop-blur">
          <div className="mb-1 font-bold text-emerald-300">Tissue distribution</div>
          {Object.entries(data.statistics).map(([k, v]) => {
            const label = k.replace('_pct', '');
            const color: Record<string, string> = {
              air: 'text-blue-400',
              fat: 'text-amber-400',
              soft: 'text-green-400',
              bone: 'text-yellow-200',
            };
            return (
              <div key={k} className="flex items-center justify-between gap-3">
                <span className={color[label] ?? ''}>{label}</span>
                <span>{Number(v).toFixed(1)}%</span>
              </div>
            );
          })}
          <div className="mt-1.5 flex items-center gap-1">
            <span className="text-slate-500">opacity</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(opacity * 100)}
              onChange={(e) => setOpacity(Number(e.target.value) / 100)}
              className="flex-1 accent-emerald-500"
            />
          </div>
        </div>
      )}
      {data?.ok === false && (
        <div className="pointer-events-none absolute left-2 top-14 rounded border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[10px] text-rose-300 backdrop-blur">
          Segment failed: {data.error?.slice(0, 60)}
        </div>
      )}
    </div>
  );
}
