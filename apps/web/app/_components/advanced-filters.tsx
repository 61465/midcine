'use client';

import { useCallback, useEffect, useState } from 'react';
import { Wand2, RotateCcw, X } from 'lucide-react';
import {
  DEFAULT_FILTERS,
  applyFilters,
  hasAnyFilter,
  type FilterConfig,
} from '../../lib/image-filters';

interface Props {
  /** The source canvas element (the Cornerstone-rendered DICOM canvas) */
  sourceCanvas: HTMLCanvasElement | null;
  /** The destination overlay canvas positioned on top of the source */
  overlayCanvas: HTMLCanvasElement | null;
  /** Frame index triggers re-render whenever the underlying slice changes */
  frameKey: number | string;
}

export function AdvancedFilters({ sourceCanvas, overlayCanvas, frameKey }: Props) {
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState<FilterConfig>(DEFAULT_FILTERS);

  const render = useCallback(() => {
    if (!sourceCanvas || !overlayCanvas) return;
    const active = hasAnyFilter(cfg);
    const octx = overlayCanvas.getContext('2d');
    if (!octx) return;
    overlayCanvas.width = sourceCanvas.width;
    overlayCanvas.height = sourceCanvas.height;
    if (!active) {
      octx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      overlayCanvas.style.display = 'none';
      return;
    }
    try {
      const sctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
      if (!sctx) return;
      const src = sctx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
      const out = applyFilters(src, cfg);
      octx.putImageData(out, 0, 0);
      overlayCanvas.style.display = 'block';
    } catch (e) {
      console.warn('[AdvancedFilters] apply failed:', e);
    }
  }, [sourceCanvas, overlayCanvas, cfg]);

  useEffect(() => {
    render();
  }, [render, frameKey]);

  const reset = () => setCfg(DEFAULT_FILTERS);
  const activeCount = Object.values(cfg).filter((v) => (v as any).enabled).length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          'flex items-center gap-1 rounded px-2 py-1 text-xs ' +
          (activeCount > 0
            ? 'bg-fuchsia-500/20 text-fuchsia-300'
            : 'text-slate-300 hover:bg-slate-800 hover:text-white')
        }
        title="Advanced image filters"
      >
        <Wand2 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">
          Filters{activeCount > 0 ? ` (${activeCount})` : ''}
        </span>
      </button>

      {open && (
        <div className="absolute right-2 top-24 z-30 w-72 rounded-lg border border-fuchsia-500/30 bg-slate-950/95 p-3 shadow-2xl backdrop-blur">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Wand2 className="h-3 w-3 text-fuchsia-400" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-fuchsia-300">
                Advanced Filters
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={reset}
                className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                title="Reset all"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>

          <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            <Toggle
              label="Sharpen"
              enabled={cfg.sharpen.enabled}
              onToggle={(e) => setCfg({ ...cfg, sharpen: { ...cfg.sharpen, enabled: e } })}
            >
              <Slider
                value={cfg.sharpen.intensity}
                min={10}
                max={100}
                onChange={(v) =>
                  setCfg({ ...cfg, sharpen: { ...cfg.sharpen, intensity: v } })
                }
              />
            </Toggle>

            <Toggle
              label="Edge (Sobel)"
              enabled={cfg.edge.enabled}
              onToggle={(e) => setCfg({ ...cfg, edge: { ...cfg.edge, enabled: e } })}
            >
              <Slider
                value={cfg.edge.threshold}
                min={20}
                max={200}
                onChange={(v) => setCfg({ ...cfg, edge: { ...cfg.edge, threshold: v } })}
              />
            </Toggle>

            <Toggle
              label="Emboss"
              enabled={cfg.emboss.enabled}
              onToggle={(e) => setCfg({ ...cfg, emboss: { enabled: e } })}
            />

            <Toggle
              label="Gamma"
              enabled={cfg.gamma.enabled}
              onToggle={(e) => setCfg({ ...cfg, gamma: { ...cfg.gamma, enabled: e } })}
            >
              <Slider
                value={Math.round(cfg.gamma.value * 100)}
                min={20}
                max={280}
                onChange={(v) =>
                  setCfg({ ...cfg, gamma: { ...cfg.gamma, value: v / 100 } })
                }
                display={`${cfg.gamma.value.toFixed(2)}`}
              />
            </Toggle>

            <Toggle
              label="Histogram equalize"
              enabled={cfg.histEq.enabled}
              onToggle={(e) => setCfg({ ...cfg, histEq: { enabled: e } })}
            />

            <Toggle
              label="Smooth (denoise)"
              enabled={cfg.smooth.enabled}
              onToggle={(e) => setCfg({ ...cfg, smooth: { ...cfg.smooth, enabled: e } })}
            >
              <Slider
                value={cfg.smooth.radius}
                min={1}
                max={4}
                onChange={(v) => setCfg({ ...cfg, smooth: { ...cfg.smooth, radius: v } })}
              />
            </Toggle>

            <Toggle
              label="Pseudo-color"
              enabled={cfg.pseudo.enabled}
              onToggle={(e) => setCfg({ ...cfg, pseudo: { ...cfg.pseudo, enabled: e } })}
            >
              <select
                value={cfg.pseudo.map}
                onChange={(e) =>
                  setCfg({ ...cfg, pseudo: { ...cfg.pseudo, map: e.target.value as any } })
                }
                className="w-full rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-300"
              >
                <option value="jet">jet</option>
                <option value="hot">hot</option>
                <option value="plasma">plasma</option>
                <option value="viridis">viridis</option>
              </select>
            </Toggle>

            <Toggle
              label="Vignette"
              enabled={cfg.vignette.enabled}
              onToggle={(e) =>
                setCfg({ ...cfg, vignette: { ...cfg.vignette, enabled: e } })
              }
            >
              <Slider
                value={Math.round(cfg.vignette.strength * 100)}
                min={10}
                max={100}
                onChange={(v) =>
                  setCfg({ ...cfg, vignette: { ...cfg.vignette, strength: v / 100 } })
                }
              />
            </Toggle>

            <Toggle
              label="Clarity"
              enabled={cfg.clarity.enabled}
              onToggle={(e) =>
                setCfg({ ...cfg, clarity: { ...cfg.clarity, enabled: e } })
              }
            >
              <Slider
                value={Math.round(cfg.clarity.strength * 100)}
                min={10}
                max={200}
                onChange={(v) =>
                  setCfg({ ...cfg, clarity: { ...cfg.clarity, strength: v / 100 } })
                }
              />
            </Toggle>

            <Toggle
              label="Bone marker"
              enabled={cfg.bone.enabled}
              onToggle={(e) => setCfg({ ...cfg, bone: { ...cfg.bone, enabled: e } })}
            >
              <Slider
                value={cfg.bone.threshold}
                min={100}
                max={240}
                onChange={(v) => setCfg({ ...cfg, bone: { ...cfg.bone, threshold: v } })}
              />
            </Toggle>

            <Toggle
              label="Invert"
              enabled={cfg.invert.enabled}
              onToggle={(e) => setCfg({ ...cfg, invert: { enabled: e } })}
            />
          </div>
          <div className="mt-3 text-[9px] text-slate-500">
            Filters run 100% locally on your GPU. Original DICOM never modified.
          </div>
        </div>
      )}
    </>
  );
}

function Toggle({
  label,
  enabled,
  onToggle,
  children,
}: {
  label: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded border border-slate-800 bg-slate-900/40 p-2">
      <label className="flex cursor-pointer items-center gap-2 text-[11px]">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="h-3 w-3 accent-fuchsia-500"
        />
        <span className={enabled ? 'font-bold text-fuchsia-300' : 'text-slate-400'}>
          {label}
        </span>
      </label>
      {enabled && children && <div className="mt-1.5">{children}</div>}
    </div>
  );
}

function Slider({
  value,
  min,
  max,
  onChange,
  display,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  display?: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-fuchsia-500"
      />
      <span className="w-9 text-right font-mono text-[9px] text-slate-500">
        {display ?? value}
      </span>
    </div>
  );
}
