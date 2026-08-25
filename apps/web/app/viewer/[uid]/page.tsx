'use client';

/**
 * Pro DICOM Viewer — NiiVue (WebGL2, MIT, MIT Radiology-grade).
 *
 * Backend converts the DICOM series to NIfTI on the fly (pydicom + nibabel,
 * cached to disk). NiiVue then renders it with full MPR / 3D / MIP / colormaps
 * out of the box. No dependency on browser-side JPEG decoders → works on
 * every DICOM the bridge can read.
 */

import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Info, Layers, Box, Sparkles, RotateCw, Contrast, Grid3x3, Move,
  ChevronLeft, ChevronRight, AlertTriangle, Loader2, Search,
} from 'lucide-react';

// ---- Helpers -------------------------------------------------------------

interface AiFinding {
  start: number; // 1-based inclusive
  end: number;   // 1-based inclusive
  text: string;
  location: string;
  prio: string;  // "STAT" / "URGENT" / ""
  confidence: number;
}

// Extract 1-based slice ranges from strings like "14-24", "42 of 156",
// "slices 10-15, 20-25", "slice 3". Never returns invalid ranges.
function parseSliceRange(s: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  if (!s) return out;
  const re = /(\d+)\s*(?:-|–|—|to)\s*(\d+)|(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m[1] && m[2]) {
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      // Ignore "N of M" pattern where the second number is total slices
      if (b > a * 5 && b > 50) { out.push([a, a]); continue; }
      out.push([Math.min(a, b), Math.max(a, b)]);
    } else if (m[3]) {
      const n = parseInt(m[3], 10);
      out.push([n, n]);
    }
  }
  return out;
}

type NvSliceType = number; // NiiVue enum values

export default function ProViewerPage() {
  const params = useParams<{ uid: string }>();
  const search = useSearchParams();
  const seriesUidFromQuery = search.get('series') ?? null;

  const uid = params?.uid ? decodeURIComponent(params.uid) : '';
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nvRef = useRef<any>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [step, setStep] = useState<string>('Loading NiiVue…');
  const [errMsg, setErrMsg] = useState<string>('');
  const [groups, setGroups] = useState<
    Array<{ series_uid: string; description: string; slice_count: number; modality?: string }>
  >([]);
  const [activeSid, setActiveSid] = useState<string | null>(seriesUidFromQuery);
  const [sliceMode, setSliceMode] = useState<'multi' | 'axial' | 'sagittal' | 'coronal' | 'render'>('multi');

  // Slice navigation (1-based). We track EACH plane independently so the
  // doctor can scroll axial/sagittal/coronal separately, just like a PACS.
  //  - axial  ↔ z-axis (dims[2])
  //  - coronal↔ y-axis (dims[1])
  //  - sagittal↔ x-axis (dims[0])
  const [totalSlices, setTotalSlices] = useState(0);          // z-axis (kept for AI markers on the main slider)
  const [currentSlice, setCurrentSlice] = useState(1);        // z-axis current (axial slice)
  const [dimsXYZ, setDimsXYZ] = useState<[number, number, number]>([1, 1, 1]);
  const [xSlice, setXSlice] = useState(1);                    // sagittal
  const [ySlice, setYSlice] = useState(1);                    // coronal
  const [zSlice, setZSlice] = useState(1);                    // axial
  const [mipMode, setMipMode] = useState(false);              // Maximum Intensity Projection for 3D
  const [invertContrast, setInvertContrast] = useState(false);

  // AI findings — populated after user clicks "Analyze"
  const [findings, setFindings] = useState<AiFinding[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeErr, setAnalyzeErr] = useState('');
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
    elapsedSec: number;
  }>({ done: 0, total: 0, elapsedSec: 0 });

  // NiiVue enum mirror — hardcoded so we don't need the lib loaded to reference
  const SLICE_TYPE: Record<string, NvSliceType> = {
    axial: 0,
    coronal: 1,
    sagittal: 2,
    multi: 3,     // 2×2 with 3D
    render: 4,    // pure 3D
  };

  useEffect(() => {
    let disposed = false;

    (async () => {
      try {
        setStatus('loading');
        setStep('Fetching series info…');
        // Get groups (for switcher) via /series
        const r = await fetch(`/api/mcp/studies/${encodeURIComponent(uid)}/series`);
        const info = await r.json();
        if (disposed) return;
        if (Array.isArray(info?.groups) && info.groups.length > 0) {
          setGroups(info.groups);
          if (!activeSid && info.primary_series_uid) {
            setActiveSid(info.primary_series_uid);
            return; // will re-run with activeSid set
          }
        }

        setStep('Loading NiiVue engine…');
        // Load NiiVue as an ES module from CDN (single import — has no external deps at runtime)
        // Use string variable so TS/webpack don't try to resolve the URL at compile time
        const nvUrl = 'https://cdn.jsdelivr.net/npm/@niivue/niivue@0.44.2/+esm';
        const nvMod: any = await import(/* webpackIgnore: true */ /* @vite-ignore */ nvUrl);
        if (disposed) return;
        const Niivue = nvMod.Niivue;

        setStep('Building NIfTI volume from DICOMs (first load takes ~5s)…');
        // NiiVue detects file type from URL extension via filename.split('.')
        // — putting series_uid in the query string breaks it (the UID's dots
        // fool the parser). Keep the URL clean, ending in .nii.gz, and pass
        // series_uid as an HTTP header. The Next.js catch-all route accepts
        // sid from either query string OR the X-Series-UID header.
        const niftiUrl = `/api/mcp/studies/${encodeURIComponent(uid)}/nifti/volume.nii.gz`;
        const niftiHeaders: Record<string, string> = activeSid
          ? { 'X-Series-UID': activeSid }
          : {};

        try {
          const probe = await fetch(niftiUrl, { method: 'GET', headers: niftiHeaders });
          if (!probe.ok) {
            const txt = await probe.text();
            setStatus('error');
            setErrMsg(`NIfTI build failed: HTTP ${probe.status} — ${txt.slice(0, 200)}`);
            return;
          }
        } catch (e: any) {
          setStatus('error');
          setErrMsg(`Fetch failed: ${e?.message ?? e}`);
          return;
        }

        if (!canvasRef.current) {
          setStatus('error');
          setErrMsg('Canvas not mounted');
          return;
        }

        setStep('Rendering…');
        const nv = new Niivue({
          // ── PACS-grade defaults ─────────────────────────────────────
          show3Dcrosshair: true,
          backColor: [0, 0, 0, 1],
          crosshairColor: [0.65, 0.9, 1, 1],       // cyan crosshair
          crosshairWidth: 1,
          textHeight: 0.028,
          fontColor: [0.85, 0.9, 0.95, 1],          // soft white labels
          selectionBoxColor: [1, 1, 1, 0.5],
          isColorbar: true,                         // intensity bar visible
          colorbarHeight: 0.03,
          isRadiologicalConvention: true,           // R/L per ACR
          multiplanarForceRender: true,             // never blank out the 4th pane
          multiplanarPadPixels: 3,                  // clean gutter between panes
          // ── Volume/3D quality ──────────────────────────────────────
          gradientOrder: 2,                         // Sobel gradient → smoother 3D shading
          gradientOpacity: 0.0,                     // let raw density drive opacity
          renderAzimuth: 110,                       // start with an oblique view
          renderElevation: 15,
          isOrientCube: true,                       // little RAS cube in the corner
          isSliceMM: true,                          // show mm not voxels
          sliceMosaicString: '',                    // let sliceType dictate layout
        });
        await nv.attachToCanvas(canvasRef.current);
        nvRef.current = nv;

        // Load the volume. `name` must end in .nii.gz for NiiVue to detect
        // the format — never use the raw series_uid (its dots break parsing).
        await nv.loadVolumes([
          {
            url: niftiUrl,
            headers: niftiHeaders,
            name: 'volume.nii.gz',
            colormap: 'gray',
          },
        ]);

        // Default view: 2×2 multiplanar + 3D
        try {
          nv.setSliceType(SLICE_TYPE[sliceMode] ?? 3);
        } catch {}

        // Fix contrast: DICOM WindowCenter/WindowWidth is often missing or
        // wrong for MRI, leaving NiiVue with a tiny display window that
        // blows the whole volume out to white. Recompute display range from
        // the actual voxel data (1st–99th percentile, subsampled for speed).
        try {
          const vol = nv.volumes?.[0];
          const data: any = vol?.img;
          if (data && typeof data.length === 'number' && data.length > 100) {
            const step = Math.max(1, Math.floor(data.length / 200000));
            const samples: number[] = [];
            for (let i = 0; i < data.length; i += step) {
              const v = Number(data[i]);
              if (Number.isFinite(v)) samples.push(v);
            }
            if (samples.length > 10) {
              samples.sort((a, b) => a - b);
              const p1 = samples[Math.floor(samples.length * 0.01)] ?? 0;
              const p99 = samples[Math.floor(samples.length * 0.99)] ?? 1;
              if (p99 > p1) {
                vol.cal_min = p1;
                vol.cal_max = p99;
              }
            }
          }
        } catch (e) { console.warn('[NiiVue] auto-window failed', e); }

        try { nv.updateGLVolume(); } catch {}

        // Read full RAS dims + install a per-axis crosshair listener so the
        // three MPR quadrants can show their own slice counters.
        try {
          const vol = nv.volumes?.[0];
          // NiiVue dims layout: [ndim, dx, dy, dz, ...] — index 1..3 are the
          // spatial extents in RAS order (sagittal, coronal, axial).
          const dArr = vol?.dimsRAS ?? vol?.dims ?? [];
          const dx = dArr[1] ?? 1;
          const dy = dArr[2] ?? 1;
          const dz = dArr[3] ?? 1;
          setDimsXYZ([dx, dy, dz]);
          if (dz > 0) {
            setTotalSlices(dz);
            const initZ = Math.max(1, Math.floor(dz / 2));
            setCurrentSlice(initZ);
            setZSlice(initZ);
          }
          if (dy > 0) setYSlice(Math.max(1, Math.floor(dy / 2)));
          if (dx > 0) setXSlice(Math.max(1, Math.floor(dx / 2)));

          nv.onLocationChange = (loc: any) => {
            const fr = loc?.frac;
            if (!fr) return;
            const [xf, yf, zf] = fr;
            if (typeof xf === 'number' && dx > 1) {
              setXSlice(Math.max(1, Math.min(dx, Math.round(xf * (dx - 1)) + 1)));
            }
            if (typeof yf === 'number' && dy > 1) {
              setYSlice(Math.max(1, Math.min(dy, Math.round(yf * (dy - 1)) + 1)));
            }
            if (typeof zf === 'number' && dz > 1) {
              const zn = Math.max(1, Math.min(dz, Math.round(zf * (dz - 1)) + 1));
              setZSlice(zn);
              setCurrentSlice(zn);
            }
          };
        } catch (e) { console.warn('[NiiVue] slice-tracking wiring failed', e); }

        setStatus('ready');
        setStep('');
      } catch (e: any) {
        console.error('[NiiVue] setup failed:', e);
        setStatus('error');
        setErrMsg(String(e?.message ?? e));
      }
    })();

    return () => {
      disposed = true;
      try {
        // NiiVue has no explicit destroy — just null the ref & clear canvas
        nvRef.current = null;
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, activeSid]);

  // React to slice-mode toggles without reloading the volume
  useEffect(() => {
    const nv = nvRef.current;
    if (!nv) return;
    try {
      nv.setSliceType(SLICE_TYPE[sliceMode] ?? 3);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sliceMode]);

  const resetView = () => {
    const nv = nvRef.current;
    if (!nv) return;
    try {
      nv.setSliceType(SLICE_TYPE[sliceMode] ?? 3);
      nv.updateGLVolume();
    } catch {}
  };

  const applyColormap = (name: string) => {
    const nv = nvRef.current;
    if (!nv || !nv.volumes?.[0]) return;
    try {
      nv.volumes[0].colormap = name;
      nv.updateGLVolume();
    } catch {}
  };

  // Jump the crosshair to a 1-based slice index. Updates NiiVue's axial view
  // and re-broadcasts the slice number via our own state.
  const goToSlice = (idx: number) => {
    const nv = nvRef.current;
    if (!nv || !nv.volumes?.[0] || totalSlices <= 0) return;
    const bounded = Math.max(1, Math.min(totalSlices, Math.round(idx)));
    const zf = totalSlices > 1 ? (bounded - 1) / (totalSlices - 1) : 0.5;
    try {
      const cp = nv.scene?.crosshairPos ?? [0.5, 0.5, 0.5];
      nv.scene.crosshairPos = [cp[0] ?? 0.5, cp[1] ?? 0.5, zf];
      nv.updateGLVolume?.();
      nv.drawScene?.();
    } catch (e) { console.warn('[NiiVue] goToSlice failed', e); }
    setCurrentSlice(bounded);
  };

  // Trigger backend full-volume vision analysis. Long (30-180s) — the
  // client polls a progress endpoint every 1.5s using a shared job_id so
  // the user sees "3/10 batches" instead of a blind spinner.
  const runAnalysis = async () => {
    if (analyzing || !uid) return;
    setAnalyzing(true);
    setAnalyzeErr('');
    setProgress({ done: 0, total: 0, elapsedSec: 0 });

    // Cryptographically-random job id (crypto.randomUUID is available in
    // every modern browser and Node runtime).
    const jobId =
      (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
        ? crypto.randomUUID()
        : `job-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const startedAt = Date.now();

    // Poll progress in parallel to the long POST.
    let pollActive = true;
    const pollTimer = setInterval(async () => {
      if (!pollActive) return;
      try {
        const pr = await fetch(
          `/api/mcp/ai/vision-see-full/progress/${encodeURIComponent(jobId)}`,
        );
        const pj = await pr.json();
        if (pj?.ok) {
          setProgress({
            done: Number(pj.done_batches ?? 0),
            total: Number(pj.total_batches ?? 0),
            elapsedSec: Math.round((Date.now() - startedAt) / 1000),
          });
        } else {
          // Progress slot not yet created — just tick the elapsed timer.
          setProgress((p) => ({ ...p, elapsedSec: Math.round((Date.now() - startedAt) / 1000) }));
        }
      } catch {
        // Ignore poll failures — the main POST is the source of truth.
      }
    }, 1500);

    try {
      const r = await fetch('/api/mcp/ai/vision-see-full', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          study_uid: uid,
          batch_size: 16,
          max_parallel: 4,
          job_id: jobId,
        }),
      });
      const j = await r.json();
      if (!j?.ok) {
        setAnalyzeErr(j?.error || `HTTP ${r.status}`);
        return;
      }

      // Warn if some batches failed (partial coverage — still show what we got).
      const totalB = Number(j.batch_count ?? 0);
      const okB = Number(j.successful_batches ?? 0);
      if (totalB > 0 && okB < totalB) {
        setAnalyzeErr(
          `Warning: ${totalB - okB}/${totalB} batches failed after retries — some slices may not have been analyzed.`,
        );
      }

      const arr = Array.isArray(j.abnormal_findings) ? j.abnormal_findings : [];
      const parsed: AiFinding[] = [];
      for (const f of arr) {
        const ranges = parseSliceRange(String(f?.slice_range ?? ''));
        for (const [a, b] of ranges) {
          parsed.push({
            start: a,
            end: b,
            text: String(f?.finding ?? '').trim(),
            location: String(f?.location ?? '').trim(),
            prio: String(f?.acr_priority ?? '').trim().toUpperCase(),
            confidence: typeof f?.confidence === 'number' ? f.confidence : 0,
          });
        }
      }
      setFindings(parsed);
      // Auto-jump to the first STAT finding if any exist
      const firstStat = parsed.find((p) => p.prio === 'STAT');
      if (firstStat) goToSlice(firstStat.start);
    } catch (e: any) {
      setAnalyzeErr(String(e?.message ?? e));
    } finally {
      pollActive = false;
      clearInterval(pollTimer);
      setAnalyzing(false);
    }
  };

  // Findings intersecting the current slice
  const currentFindings = findings.filter(
    (f) => currentSlice >= f.start && currentSlice <= f.end,
  );
  // Deduplicate marker positions for the slider overlay
  const markerPositions = Array.from(
    new Set(
      findings.flatMap((f) => {
        const arr: number[] = [];
        for (let i = f.start; i <= f.end; i++) arr.push(i);
        return arr;
      }),
    ),
  );

  return (
    <div className="fixed inset-0 flex flex-col bg-slate-950 text-slate-100">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-3 py-2">
        <div className="flex items-center gap-3">
          <Link
            href={`/room?study=${encodeURIComponent(uid)}`}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Reading room
          </Link>
          <div className="text-sm font-bold text-cyan-300">Pro DICOM Viewer</div>
          <div className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
            NiiVue · WebGL2 · MPR + 3D
          </div>
        </div>
        <div className="flex items-center gap-2">
          {groups.length > 1 && (
            <label className="flex items-center gap-1 text-[10px] text-slate-400">
              <span className="uppercase tracking-widest text-slate-500">Series</span>
              <select
                value={activeSid ?? ''}
                onChange={(e) => setActiveSid(e.target.value)}
                disabled={status === 'loading'}
                className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[11px] text-cyan-300 focus:border-cyan-500 focus:outline-none disabled:opacity-40"
              >
                {groups.map((g) => (
                  <option key={g.series_uid} value={g.series_uid}>
                    {g.description || g.series_uid.slice(-10)} ({g.slice_count})
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-slate-800 bg-slate-900 px-3 py-1.5 text-[11px]">
        {(
          [
            { id: 'multi', label: 'Multi (MPR + 3D)', icon: Grid3x3 },
            { id: 'axial', label: 'Axial', icon: Layers },
            { id: 'sagittal', label: 'Sagittal', icon: Move },
            { id: 'coronal', label: 'Coronal', icon: Move },
            { id: 'render', label: '3D Render', icon: Box },
          ] as const
        ).map((t) => {
          const Icon = t.icon;
          const active = sliceMode === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSliceMode(t.id)}
              disabled={status !== 'ready'}
              className={
                'flex items-center gap-1 rounded px-2 py-1 transition ' +
                (active
                  ? 'bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-500/50'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-30')
              }
            >
              <Icon className="h-3 w-3" />
              {t.label}
            </button>
          );
        })}
        <div className="mx-2 h-4 w-px bg-slate-800" />
        <span className="text-slate-500">Colormap:</span>
        {['gray', 'plasma', 'viridis', 'inferno', 'jet', 'hot', 'winter'].map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => applyColormap(c)}
            disabled={status !== 'ready'}
            className="rounded px-1.5 py-0.5 text-[10px] text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-30"
          >
            {c}
          </button>
        ))}
        <button
          type="button"
          onClick={resetView}
          disabled={status !== 'ready'}
          className="ml-2 flex items-center gap-1 rounded px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-30"
        >
          <RotateCw className="h-3 w-3" />
          Reset
        </button>
        <div className="ml-auto flex items-center gap-3 text-[10px] text-slate-500">
          <span className="hidden md:inline">
            <Contrast className="mr-0.5 inline h-3 w-3" />
            right-drag = W/L · scroll = slice · shift+drag = zoom · Sparkles anywhere on a pane
          </span>
          <Sparkles className="h-3 w-3 text-cyan-500/50" />
        </div>
      </div>

      {/* Viewport */}
      <div className="relative flex-1 overflow-hidden bg-black">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          style={{ width: '100%', height: '100%' }}
        />
        {status === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 text-slate-300">
            <div className="mb-2 h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
            <div className="text-sm">{step}</div>
            <div className="mt-1 text-[10px] text-slate-500">
              First load ~3–8 seconds (server builds NIfTI). Cached after that.
            </div>
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 text-rose-300">
            <Info className="mb-2 h-8 w-8" />
            <div className="text-sm font-bold">Viewer failed</div>
            <div className="mt-1 max-w-md px-4 text-center text-[11px] text-slate-400">
              {errMsg}
            </div>
            <Link
              href={`/room?study=${encodeURIComponent(uid)}`}
              className="mt-4 rounded bg-cyan-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-cyan-400"
            >
              Return to midcine viewer
            </Link>
          </div>
        )}

        {/* AI warning banner + slice navigation overlay */}
        {status === 'ready' && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-3">
            {currentFindings.length > 0 && (
              <div className="pointer-events-auto max-w-2xl rounded-lg border border-amber-500 bg-amber-900/85 px-4 py-2 text-amber-100 shadow-xl backdrop-blur">
                <div className="flex items-center gap-1.5 text-sm font-bold text-amber-200">
                  <AlertTriangle className="h-4 w-4" />
                  AI: possible finding on slice {currentSlice}
                </div>
                <div className="mt-1 space-y-1">
                  {currentFindings.map((f, i) => (
                    <div key={i} className="text-xs leading-snug">
                      <span
                        className={
                          'mr-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ' +
                          (f.prio === 'STAT'
                            ? 'bg-rose-500 text-white'
                            : f.prio === 'URGENT'
                              ? 'bg-orange-500 text-white'
                              : 'bg-amber-500 text-black')
                        }
                      >
                        {f.prio || 'INFO'}
                      </span>
                      <span className="text-amber-50">{f.text}</span>
                      {f.location && (
                        <span className="text-amber-300/80"> · {f.location}</span>
                      )}
                      {f.confidence > 0 && (
                        <span className="ml-1 text-amber-400/70">
                          ({Math.round(f.confidence * 100)}%)
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-1.5 shadow-xl backdrop-blur">
              <button
                type="button"
                onClick={() => goToSlice(currentSlice - 1)}
                disabled={currentSlice <= 1 || totalSlices <= 0}
                className="rounded p-1 text-slate-300 hover:bg-slate-800 hover:text-cyan-300 disabled:opacity-30"
                title="Previous slice (or scroll on any pane)"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className="relative w-64">
                <input
                  type="range"
                  min={1}
                  max={Math.max(1, totalSlices)}
                  value={currentSlice}
                  onChange={(e) => goToSlice(parseInt(e.target.value, 10))}
                  disabled={totalSlices <= 1}
                  className="h-1 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-cyan-500 disabled:opacity-40"
                />
                {/* Finding markers on the slider */}
                {totalSlices > 1 && markerPositions.map((p) => (
                  <span
                    key={p}
                    className="pointer-events-none absolute top-0 h-1 w-0.5 bg-amber-400"
                    style={{ left: `${((p - 1) / (totalSlices - 1)) * 100}%` }}
                    title={`Slice ${p} — AI finding`}
                  />
                ))}
              </div>

              <div className="w-20 text-center font-mono text-xs text-slate-300">
                {totalSlices > 0 ? `${currentSlice} / ${totalSlices}` : '—'}
              </div>

              <button
                type="button"
                onClick={() => goToSlice(currentSlice + 1)}
                disabled={currentSlice >= totalSlices || totalSlices <= 0}
                className="rounded p-1 text-slate-300 hover:bg-slate-800 hover:text-cyan-300 disabled:opacity-30"
                title="Next slice (or scroll on any pane)"
              >
                <ChevronRight className="h-4 w-4" />
              </button>

              <div className="mx-1 h-4 w-px bg-slate-700" />

              <button
                type="button"
                onClick={runAnalysis}
                disabled={analyzing}
                className={
                  'flex items-center gap-1 rounded px-2 py-1 text-[11px] font-bold transition ' +
                  (analyzing
                    ? 'bg-slate-800 text-slate-400'
                    : findings.length > 0
                      ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/40'
                      : 'bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/40')
                }
                title="Run full-volume AI analysis (30-60s). Warnings will appear on affected slices."
              >
                {analyzing ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {progress.total > 0
                      ? `Analyzing… ${progress.done}/${progress.total} batches · ${progress.elapsedSec}s`
                      : `Analyzing… ${progress.elapsedSec}s`}
                  </>
                ) : findings.length > 0 ? (
                  <>
                    <AlertTriangle className="h-3 w-3" />
                    {findings.length} finding{findings.length === 1 ? '' : 's'}
                  </>
                ) : (
                  <>
                    <Search className="h-3 w-3" />
                    Run AI Analysis
                  </>
                )}
              </button>

              {/* Quick-jump to next finding */}
              {findings.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const next = findings
                      .map((f) => f.start)
                      .filter((s) => s > currentSlice)
                      .sort((a, b) => a - b)[0]
                      ?? findings[0]?.start;
                    if (next) goToSlice(next);
                  }}
                  className="flex items-center gap-1 rounded bg-amber-500/20 px-2 py-1 text-[11px] font-bold text-amber-300 hover:bg-amber-500/40"
                  title="Jump to next finding"
                >
                  Next finding <ChevronRight className="h-3 w-3" />
                </button>
              )}
            </div>

            {analyzing && (
              <div className="pointer-events-auto flex w-96 max-w-[92vw] items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-1.5 shadow-xl backdrop-blur">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all"
                    style={{
                      width:
                        progress.total > 0
                          ? `${Math.round((progress.done / progress.total) * 100)}%`
                          : '10%',
                    }}
                  />
                </div>
                <div className="w-14 text-right font-mono text-[10px] text-slate-400">
                  {progress.total > 0
                    ? `${Math.round((progress.done / progress.total) * 100)}%`
                    : '…'}
                </div>
              </div>
            )}

            {analyzeErr && (
              <div className="pointer-events-auto rounded bg-rose-900/80 px-3 py-1 text-[11px] text-rose-200 shadow">
                AI: {analyzeErr}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
