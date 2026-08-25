'use client';

/**
 * Case Story — full 3D educational player.
 *
 * A dedicated route that reconstructs the study as a rotating 3D volume,
 * generates a patient-friendly storyboard of the AI findings, and plays
 * through them like an educational video: for each chapter the camera
 * rotates to a signature angle, the finding's slice range is highlighted,
 * and a narration card appears with plain-language explanation +
 * clinical significance.
 *
 * Grounded 100% in the AI vision JSON — no invented pathology.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Play, Pause, RotateCw, ChevronLeft, ChevronRight,
  Sparkles, AlertTriangle, Loader2, Box, Volume2, VolumeX, Palette, RefreshCw,
} from 'lucide-react';

// Colormap presets — chosen for anatomy readability. NiiVue ships all of these.
const COLORMAPS: Array<{ id: string; label: string; desc: string }> = [
  { id: 'gray',    label: 'Gray',     desc: 'Standard CT/MRI grayscale' },
  { id: 'bone',    label: 'Bone',     desc: 'Warm — highlights osseous structures' },
  { id: 'plasma',  label: 'Plasma',   desc: 'Purple→yellow — soft-tissue contrast' },
  { id: 'viridis', label: 'Viridis',  desc: 'Blue→yellow — vascular emphasis' },
  { id: 'inferno', label: 'Inferno',  desc: 'Black→red→white — pathology pop' },
  { id: 'hot',     label: 'Hot',      desc: 'Classic PET/functional overlay' },
  { id: 'winter',  label: 'Winter',   desc: 'Cool tones — CSF/fluid emphasis' },
  { id: 'copper',  label: 'Copper',   desc: 'Anatomical warm tone' },
];

interface Chapter {
  title: string;
  layperson_name?: string;
  location_plain?: string;
  slice_range?: string;
  acr_priority?: string;
  what_it_is?: string;
  why_it_matters?: string;
  what_happens_next?: string;
  camera_hint?: {
    azimuth?: number;
    elevation?: number;
    zoom?: number;
    hint_text?: string;
  };
}

interface Story {
  patient_summary?: string;
  no_pathology?: boolean;
  chapters?: Chapter[];
  final_note?: string;
}

function priorityColor(prio: string): string {
  const p = (prio || '').toUpperCase();
  if (p === 'STAT') return 'bg-rose-500 text-white';
  if (p === 'URGENT') return 'bg-orange-500 text-white';
  return 'bg-slate-600 text-slate-100';
}

// Parse "14-24" → [14, 24]. Falls back to single slice for "42".
function parseRange(s: string | undefined): [number, number] | null {
  if (!s) return null;
  const m = s.match(/(\d+)\s*(?:-|–|—|to)\s*(\d+)/);
  if (m && m[1] && m[2]) return [parseInt(m[1], 10), parseInt(m[2], 10)];
  const n = s.match(/(\d+)/);
  if (n && n[1]) { const v = parseInt(n[1], 10); return [v, v]; }
  return null;
}

export default function CaseStoryPage() {
  const params = useParams<{ uid: string }>();
  const uid = params?.uid ? decodeURIComponent(params.uid) : '';

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nvRef = useRef<any>(null);
  const rotateRAFRef = useRef<number | null>(null);
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [step, setStep] = useState('Loading NiiVue…');
  const [errMsg, setErrMsg] = useState('');

  const [story, setStory] = useState<Story | null>(null);
  const [storyLoading, setStoryLoading] = useState(true);
  const [storyErr, setStoryErr] = useState('');

  const [totalSlices, setTotalSlices] = useState(0);
  const [activeIdx, setActiveIdx] = useState(0);
  const [autoRotate, setAutoRotate] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [ttsOn, setTtsOn] = useState(false); // browser SpeechSynthesis
  const [colormap, setColormap] = useState('gray');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [clipOn, setClipOn] = useState(false);
  const [, setModality] = useState<'CT' | 'MR/other'>('MR/other');

  // ── NiiVue init ────────────────────────────────────────────────────
  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        setStatus('loading');
        setStep('Loading series…');
        const rSer = await fetch(`/api/mcp/studies/${encodeURIComponent(uid)}/series`);
        const info = await rSer.json();
        const activeSid = info?.primary_series_uid ?? null;

        setStep('Loading NiiVue…');
        const nvUrl = 'https://cdn.jsdelivr.net/npm/@niivue/niivue@0.44.2/+esm';
        const nvMod: any = await import(/* webpackIgnore: true */ /* @vite-ignore */ nvUrl);
        if (disposed) return;
        const Niivue = nvMod.Niivue;

        setStep('Building 3D volume…');
        const niftiUrl = `/api/mcp/studies/${encodeURIComponent(uid)}/nifti/volume.nii.gz`;
        const niftiHeaders: Record<string, string> = activeSid ? { 'X-Series-UID': activeSid } : {};
        const probe = await fetch(niftiUrl, { headers: niftiHeaders });
        if (!probe.ok) {
          setStatus('error');
          setErrMsg(`NIfTI build failed: HTTP ${probe.status}`);
          return;
        }

        if (!canvasRef.current) { setStatus('error'); setErrMsg('Canvas not mounted'); return; }

        const nv = new Niivue({
          show3Dcrosshair: false,
          backColor: [0.02, 0.03, 0.06, 1],
          textHeight: 0.028,
          fontColor: [0.85, 0.9, 0.95, 1],
          isColorbar: false,
          isRadiologicalConvention: true,
          multiplanarForceRender: false,
          gradientOrder: 2,
          renderAzimuth: 120,
          renderElevation: 15,
          isOrientCube: true,
        });
        await nv.attachToCanvas(canvasRef.current);
        nvRef.current = nv;

        await nv.loadVolumes([{
          url: niftiUrl,
          headers: niftiHeaders,
          name: 'volume.nii.gz',
          colormap: 'gray',
        }]);

        // Force pure 3D render mode
        try { nv.setSliceType(4); } catch {}

        // ── 3D VOLUME RENDERING TUNING ─────────────────────────────────
        // The naive path (just load + setSliceType(4)) produces a SOLID
        // WHITE BLOCK because:
        //   1. The volume is opaque all the way through (no clip plane)
        //   2. Default 'gray' colormap has no alpha ramp
        //   3. `cal_min` alone doesn't create transparency in 3D
        //
        // Fix stack (applied in order until one visibly works):
        //   A. Modality-aware colormap: CT → ct_bones (alpha built in),
        //      MR → gray with high cal_min (skips background)
        //   B. Auto clip plane so the viewer sees INTERNAL structure
        //   C. MIP fallback: setVolumeRenderIllumination(0) if available
        try {
          const vol = nv.volumes?.[0];
          const data: any = vol?.img;
          let isCT = false;
          if (data && typeof data.length === 'number' && data.length > 100) {
            const stepN = Math.max(1, Math.floor(data.length / 200000));
            const samples: number[] = [];
            for (let i = 0; i < data.length; i += stepN) {
              const v = Number(data[i]);
              if (Number.isFinite(v)) samples.push(v);
            }
            if (samples.length > 10) {
              samples.sort((a, b) => a - b);
              const minV = samples[0] ?? 0;
              const maxV = samples[samples.length - 1] ?? 1;
              const p50 = samples[Math.floor(samples.length * 0.50)] ?? 0;
              const p95 = samples[Math.floor(samples.length * 0.95)] ?? 0;
              const p99 = samples[Math.floor(samples.length * 0.99)] ?? 1;
              isCT = minV < -400;

              if (isCT) {
                // NiiVue 3D volume rendering NEEDS a colormap with built-in
                // alpha ramp. Plain 'gray' has no alpha → solid white block.
                // Try CT-specific colormaps in order; the first one that
                // NiiVue accepts wins.
                const ctColormaps = ['ct_head', 'ct_bones', 'ct_soft', 'ct_liver', 'bone'];
                let picked = 'bone';
                for (const cm of ctColormaps) {
                  try {
                    vol.colormap = cm;
                    // Read it back — NiiVue may silently fall through
                    if (vol.colormap === cm) { picked = cm; break; }
                  } catch {}
                }
                vol.cal_min = 80;    // above air/fat
                vol.cal_max = 1200;  // bone
                setColormap(picked);
                setModality('CT');
                // Turn on illumination — the depth cue that makes 3D
                // volumes look 3D. Without this even a good alpha ramp
                // renders as a flat silhouette.
                try {
                  if (typeof (nv as any).setVolumeRenderIllumination === 'function') {
                    (nv as any).setVolumeRenderIllumination(0.6);
                  }
                } catch {}
              } else {
                // MRI — 'gray' works OK for 3D IF we set illumination on.
                // Alternative colormaps with alpha ramps: 'plasma', 'viridis'
                // both help but 'gray' matches radiologist expectation.
                vol.colormap = 'gray';
                const p30 = samples[Math.floor(samples.length * 0.30)] ?? 0;
                vol.cal_min = p30;
                vol.cal_max = p99;
                if (vol.cal_max <= vol.cal_min) {
                  vol.cal_min = 0; vol.cal_max = Math.max(p99, maxV, 1);
                }
                setModality('MR/other');
                try {
                  if (typeof (nv as any).setVolumeRenderIllumination === 'function') {
                    (nv as any).setVolumeRenderIllumination(0.4);
                  }
                } catch {}
              }
              console.info('[case-story] auto-window',
                { modality: isCT ? 'CT' : 'MR/other', min: minV, max: maxV,
                  p50, p95, p99, colormap: vol.colormap,
                  applied: [vol.cal_min, vol.cal_max] });
            }
          }

          // ── Ambient occlusion for depth cues ────────────────────────
          try {
            if (typeof (nv as any).setRenderDrawAmbientOcclusion === 'function') {
              (nv as any).setRenderDrawAmbientOcclusion(0.4);
            }
          } catch {}

          // Clip plane is OFF by default (previous auto -0.3 cut too
          // aggressively → user saw a triangle). Doctor enables it via
          // the "Cut through" button when they want a peek inside.
          try {
            if (typeof (nv as any).setClipPlane === 'function') {
              (nv as any).setClipPlane([2, 0, 0]);  // 2 = disabled
            }
          } catch {}
        } catch (e) { console.warn('[case-story] auto-window failed', e); }
        try { nv.updateGLVolume(); } catch {}
        try { nv.drawScene?.(); } catch {}

        // Read total slices for slice-range clip planes
        try {
          const dims = nv.volumes?.[0]?.dimsRAS ?? nv.volumes?.[0]?.dims ?? [];
          const dz = dims[3] ?? 1;
          setTotalSlices(dz);
        } catch {}

        setStatus('ready');
        setStep('');
      } catch (e: any) {
        console.error('[3D] init failed', e);
        setStatus('error');
        setErrMsg(String(e?.message ?? e));
      }
    })();
    return () => {
      disposed = true;
      if (rotateRAFRef.current != null) cancelAnimationFrame(rotateRAFRef.current);
      if (playTimerRef.current != null) clearTimeout(playTimerRef.current);
      try { window.speechSynthesis?.cancel(); } catch {}
      nvRef.current = null;
    };
  }, [uid]);

  // ── Story fetch (cache-aware) ─────────────────────────────────────
  // The backend caches the result on disk, so re-opening a study is instant
  // even on weak internet. Setting `force=true` (via the Regenerate button)
  // invalidates the cache and forces a fresh LLM call.
  const fetchStory = useCallback(async (force = false) => {
    if (!uid) return;
    setStoryLoading(true);
    setStoryErr('');
    setFromCache(false);
    try {
      if (force) {
        try {
          await fetch(`/api/mcp/ai/cache/${encodeURIComponent(uid)}/case_story`, {
            method: 'DELETE',
          });
        } catch {}
      }
      const r = await fetch('/api/mcp/ai/case-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ study_uid: uid }),
      });
      const j = await r.json();
      if (!j?.ok) { setStoryErr(j?.error || `HTTP ${r.status}`); return; }
      setStory(j.story ?? null);
      setFromCache(Boolean(j.from_cache));
    } catch (e: any) {
      setStoryErr(String(e?.message ?? e));
    } finally {
      setStoryLoading(false);
    }
  }, [uid]);

  useEffect(() => { fetchStory(false); }, [fetchStory]);

  // ── Auto-rotate loop ───────────────────────────────────────────────
  useEffect(() => {
    if (!autoRotate || status !== 'ready') {
      if (rotateRAFRef.current != null) {
        cancelAnimationFrame(rotateRAFRef.current);
        rotateRAFRef.current = null;
      }
      return;
    }
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      const nv = nvRef.current;
      if (nv?.scene) {
        const cur = nv.scene.renderAzimuth ?? 0;
        nv.scene.renderAzimuth = (cur + (dt * 0.02)) % 360; // ~20°/sec
        try { nv.drawScene?.(); } catch {}
      }
      rotateRAFRef.current = requestAnimationFrame(tick);
    };
    rotateRAFRef.current = requestAnimationFrame(tick);
    return () => {
      if (rotateRAFRef.current != null) cancelAnimationFrame(rotateRAFRef.current);
      rotateRAFRef.current = null;
    };
  }, [autoRotate, status]);

  // ── Camera focus for a chapter ─────────────────────────────────────
  const focusChapter = useCallback((chapter: Chapter) => {
    const nv = nvRef.current;
    if (!nv) return;
    const az = chapter.camera_hint?.azimuth;
    const el = chapter.camera_hint?.elevation;
    const zm = chapter.camera_hint?.zoom;
    try {
      if (typeof az === 'number' && nv.scene) nv.scene.renderAzimuth = az;
      if (typeof el === 'number' && nv.scene) nv.scene.renderElevation = el;
      // Optional: focus the crosshair on the mid-slice of the finding so a
      // clip-plane could later reveal just this region.
      const range = parseRange(chapter.slice_range);
      if (range && totalSlices > 1 && nv.scene) {
        const mid = (range[0] + range[1]) / 2;
        const zf = Math.max(0, Math.min(1, (mid - 1) / (totalSlices - 1)));
        const cp = nv.scene.crosshairPos ?? [0.5, 0.5, 0.5];
        nv.scene.crosshairPos = [cp[0] ?? 0.5, cp[1] ?? 0.5, zf];
      }
      if (typeof zm === 'number') { try { nv.scene.pan2Dxyzmm = [0, 0, 0, zm]; } catch {} }
      nv.updateGLVolume?.();
      nv.drawScene?.();
    } catch (e) { console.warn('focusChapter failed', e); }
  }, [totalSlices]);

  // ── Play mode: cycle through chapters ─────────────────────────────
  useEffect(() => {
    if (!playing || !story?.chapters?.length) return;
    // Suspend auto-rotate during play so camera hints stick
    setAutoRotate(false);
    const ch = story.chapters[activeIdx];
    if (ch) {
      focusChapter(ch);
      speakChapter(ch);
    }
    // Read time proportional to how much text there is
    const wc = ((ch?.what_it_is || '') + (ch?.why_it_matters || '') + (ch?.what_happens_next || '')).split(/\s+/).length;
    const durMs = Math.max(5500, Math.min(15000, wc * 350));
    playTimerRef.current = setTimeout(() => {
      const next = activeIdx + 1;
      if (next < (story.chapters?.length ?? 0)) {
        setActiveIdx(next);
      } else {
        setPlaying(false);
        setAutoRotate(true);
      }
    }, durMs);
    return () => {
      if (playTimerRef.current != null) {
        clearTimeout(playTimerRef.current);
        playTimerRef.current = null;
      }
    };
  }, [playing, activeIdx, story, focusChapter]);

  // ── Apply colormap live ───────────────────────────────────────────
  useEffect(() => {
    const nv = nvRef.current;
    if (!nv || status !== 'ready' || !nv.volumes?.[0]) return;
    try {
      nv.volumes[0].colormap = colormap;
      nv.updateGLVolume?.();
      nv.drawScene?.();
    } catch (e) { console.warn('colormap failed', e); }
  }, [colormap, status]);

  // ── Apply clip plane toggle live ──────────────────────────────────
  // clipOn=true  → mild cut at -0.1 depth (small anterior wedge → still
  //                shows most of the volume + reveals interior)
  // clipOn=false → depth=2 which is NiiVue's disabled sentinel
  useEffect(() => {
    const nv = nvRef.current;
    if (!nv || status !== 'ready') return;
    try {
      if (typeof (nv as any).setClipPlane === 'function') {
        (nv as any).setClipPlane(clipOn ? [-0.1, 120, 15] : [2, 0, 0]);
      }
      nv.drawScene?.();
    } catch (e) { console.warn('clip plane failed', e); }
  }, [clipOn, status]);

  // ── TTS narration ──────────────────────────────────────────────────
  const speakChapter = (ch: Chapter) => {
    if (!ttsOn) return;
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      synth.cancel();
      const text = [
        ch.title,
        ch.what_it_is,
        ch.why_it_matters,
        ch.what_happens_next,
      ].filter(Boolean).join('. ');
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 0.95;
      utter.pitch = 1.0;
      utter.lang = 'en-US';
      synth.speak(utter);
    } catch {}
  };

  // ── Manual chapter selection ──────────────────────────────────────
  const selectChapter = (idx: number) => {
    if (!story?.chapters?.length) return;
    const bounded = Math.max(0, Math.min(story.chapters.length - 1, idx));
    const ch = story.chapters[bounded];
    if (!ch) return;
    setActiveIdx(bounded);
    focusChapter(ch);
    if (playing) speakChapter(ch);
  };

  const activeChapter = story?.chapters?.[activeIdx];

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
          <div className="text-sm font-bold text-cyan-300">Case Story</div>
          <div className="rounded bg-purple-500/20 px-2 py-0.5 text-[10px] font-bold text-purple-300">
            3D · Educational Playback
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/viewer/${encodeURIComponent(uid)}`}
            className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700 hover:text-cyan-300"
          >
            <Box className="h-3 w-3" />
            Pro Viewer (MPR)
          </Link>
          <Link
            href="/guide#case-story"
            target="_blank"
            className="flex items-center gap-1 rounded bg-cyan-500/20 px-2 py-1 text-[11px] font-bold text-cyan-300 hover:bg-cyan-500/40"
            title="Learn how Case Story works — controls, chapters, safety"
          >
            <Sparkles className="h-3 w-3" />
            How to use this
          </Link>
        </div>
      </div>

      {/* Main area — 3D on left, chapters on right */}
      <div className="flex flex-1 overflow-hidden">
        {/* 3D pane */}
        <div className="relative flex-1 bg-black">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full"
            style={{ width: '100%', height: '100%' }}
          />

          {status === 'loading' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80">
              <Loader2 className="mb-2 h-8 w-8 animate-spin text-cyan-400" />
              <div className="text-sm text-slate-300">{step}</div>
              <div className="mt-1 text-[10px] text-slate-500">
                Reconstructing the volume for 3D playback…
              </div>
            </div>
          )}
          {status === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 text-rose-300">
              <AlertTriangle className="mb-2 h-8 w-8" />
              <div className="text-sm font-bold">3D reconstruction failed</div>
              <div className="mt-1 max-w-md px-4 text-center text-[11px] text-slate-400">{errMsg}</div>
            </div>
          )}

          {/* Active-chapter narration overlay */}
          {status === 'ready' && activeChapter && (
            <div className="pointer-events-none absolute inset-x-4 bottom-24 flex justify-center">
              <div className="pointer-events-auto max-w-2xl rounded-xl border border-purple-500/50 bg-slate-950/85 p-4 shadow-2xl backdrop-blur">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      {activeChapter.acr_priority && (
                        <span
                          className={
                            'rounded px-1.5 py-0.5 text-[10px] font-bold ' +
                            priorityColor(activeChapter.acr_priority)
                          }
                        >
                          {activeChapter.acr_priority.toUpperCase()}
                        </span>
                      )}
                      <span className="text-[10px] uppercase tracking-widest text-purple-300">
                        Chapter {activeIdx + 1} of {story?.chapters?.length ?? 0}
                      </span>
                      {activeChapter.slice_range && (
                        <span className="text-[10px] text-slate-400">
                          · slices {activeChapter.slice_range}
                        </span>
                      )}
                    </div>
                    <h2 className="text-base font-bold text-cyan-200">
                      {activeChapter.title}
                    </h2>
                    {activeChapter.layperson_name && (
                      <div className="mt-0.5 text-xs italic text-slate-400">
                        In plain words: {activeChapter.layperson_name}
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-3 space-y-2 text-[13px] leading-relaxed text-slate-200">
                  {activeChapter.what_it_is && (
                    <p>
                      <span className="mr-1 text-[10px] font-bold uppercase tracking-widest text-cyan-400">
                        What it is
                      </span>
                      {activeChapter.what_it_is}
                    </p>
                  )}
                  {activeChapter.why_it_matters && (
                    <p>
                      <span className="mr-1 text-[10px] font-bold uppercase tracking-widest text-amber-400">
                        Why it matters
                      </span>
                      {activeChapter.why_it_matters}
                    </p>
                  )}
                  {activeChapter.what_happens_next && (
                    <p>
                      <span className="mr-1 text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                        Next step
                      </span>
                      {activeChapter.what_happens_next}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Player controls */}
          {status === 'ready' && (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
              <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/95 px-4 py-2 shadow-2xl backdrop-blur">
                <button
                  type="button"
                  onClick={() => selectChapter(activeIdx - 1)}
                  disabled={!story?.chapters?.length || activeIdx === 0}
                  className="rounded-full p-2 text-slate-300 hover:bg-slate-800 hover:text-cyan-300 disabled:opacity-30"
                  title="Previous chapter"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!story?.chapters?.length) return;
                    setPlaying((p) => !p);
                  }}
                  disabled={!story?.chapters?.length}
                  className={
                    'flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold transition ' +
                    (playing
                      ? 'bg-rose-500 text-white hover:bg-rose-400'
                      : 'bg-emerald-500 text-slate-900 hover:bg-emerald-400 disabled:opacity-30')
                  }
                  title={playing ? 'Pause narration' : 'Play case story'}
                >
                  {playing ? <><Pause className="h-4 w-4" /> Pause</> : <><Play className="h-4 w-4" /> Play</>}
                </button>

                <button
                  type="button"
                  onClick={() => selectChapter(activeIdx + 1)}
                  disabled={!story?.chapters?.length || activeIdx >= (story.chapters.length - 1)}
                  className="rounded-full p-2 text-slate-300 hover:bg-slate-800 hover:text-cyan-300 disabled:opacity-30"
                  title="Next chapter"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>

                <div className="mx-1 h-4 w-px bg-slate-700" />

                <button
                  type="button"
                  onClick={() => setAutoRotate((r) => !r)}
                  className={
                    'flex items-center gap-1 rounded-full px-2 py-1 text-[11px] transition ' +
                    (autoRotate
                      ? 'bg-cyan-500/25 text-cyan-300 hover:bg-cyan-500/40'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200')
                  }
                  title="Turntable rotation"
                >
                  <RotateCw className={'h-3 w-3 ' + (autoRotate ? 'animate-spin-slow' : '')} />
                  {autoRotate ? 'Rotating' : 'Rotate'}
                </button>

                <button
                  type="button"
                  onClick={() => setTtsOn((t) => !t)}
                  className={
                    'flex items-center gap-1 rounded-full px-2 py-1 text-[11px] transition ' +
                    (ttsOn
                      ? 'bg-purple-500/25 text-purple-200 hover:bg-purple-500/40'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200')
                  }
                  title="Read narration aloud"
                >
                  {ttsOn ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
                  {ttsOn ? 'Voice on' : 'Voice off'}
                </button>

                <button
                  type="button"
                  onClick={() => setClipOn((v) => !v)}
                  className={
                    'flex items-center gap-1 rounded-full px-2 py-1 text-[11px] transition ' +
                    (clipOn
                      ? 'bg-amber-500/25 text-amber-200 hover:bg-amber-500/40'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200')
                  }
                  title="Cut through the front of the volume to reveal internal anatomy"
                >
                  ✂ {clipOn ? 'Cutting' : 'Cut through'}
                </button>

                <div className="mx-1 h-4 w-px bg-slate-700" />

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowColorPicker((v) => !v)}
                    className={
                      'flex items-center gap-1 rounded-full px-2 py-1 text-[11px] transition ' +
                      (colormap !== 'gray'
                        ? 'bg-fuchsia-500/25 text-fuchsia-200 hover:bg-fuchsia-500/40'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200')
                    }
                    title="Recolor the 3D volume"
                  >
                    <Palette className="h-3 w-3" />
                    {COLORMAPS.find((c) => c.id === colormap)?.label ?? 'Color'}
                  </button>
                  {showColorPicker && (
                    <div className="absolute bottom-full right-0 mb-2 w-56 rounded-lg border border-slate-700 bg-slate-950/95 p-2 shadow-2xl backdrop-blur">
                      <div className="mb-1 px-1 text-[10px] uppercase tracking-widest text-slate-500">
                        Colormap
                      </div>
                      {COLORMAPS.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => { setColormap(c.id); setShowColorPicker(false); }}
                          className={
                            'flex w-full flex-col items-start rounded px-2 py-1.5 text-left transition ' +
                            (colormap === c.id
                              ? 'bg-fuchsia-500/25 text-fuchsia-200'
                              : 'text-slate-300 hover:bg-slate-800 hover:text-white')
                          }
                        >
                          <span className="text-xs font-bold">{c.label}</span>
                          <span className="text-[10px] leading-tight text-slate-400">{c.desc}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {fromCache && (
                  <button
                    type="button"
                    onClick={() => fetchStory(true)}
                    disabled={storyLoading}
                    className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-slate-400 hover:bg-slate-800 hover:text-cyan-300 disabled:opacity-40"
                    title="Force regenerate the story (bypass cache)"
                  >
                    <RefreshCw className={'h-3 w-3 ' + (storyLoading ? 'animate-spin' : '')} />
                    Regenerate
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right side — chapters panel */}
        <aside className="flex w-96 flex-col border-l border-slate-800 bg-slate-900/70">
          <div className="border-b border-slate-800 p-3">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-purple-400">
              <Sparkles className="h-3 w-3" />
              Case Storyboard
            </div>
            {storyLoading ? (
              <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                <Loader2 className="h-3 w-3 animate-spin" />
                Generating patient-friendly narration…
              </div>
            ) : storyErr ? (
              <div className="mt-2 text-xs text-rose-300">Error: {storyErr}</div>
            ) : story?.patient_summary ? (
              <p className="mt-2 text-[13px] leading-snug text-slate-200">
                {story.patient_summary}
              </p>
            ) : (
              <div className="mt-2 text-xs text-slate-500">No summary available.</div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {story?.no_pathology && (
              <div className="mb-3 rounded-lg border border-emerald-700 bg-emerald-900/30 p-3 text-xs text-emerald-200">
                No abnormal findings detected on AI review. The volume appears
                within normal limits — always confirm with your radiologist.
              </div>
            )}

            {story?.chapters?.map((ch, i) => {
              const isActive = i === activeIdx;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => selectChapter(i)}
                  className={
                    'mb-2 w-full rounded-lg border p-3 text-left transition ' +
                    (isActive
                      ? 'border-purple-500 bg-purple-500/10 shadow-inner'
                      : 'border-slate-700 bg-slate-800/40 hover:border-slate-600 hover:bg-slate-800/70')
                  }
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span className="font-mono text-[10px] text-slate-500">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    {ch.acr_priority && (
                      <span
                        className={
                          'rounded px-1 py-0 text-[9px] font-bold ' + priorityColor(ch.acr_priority)
                        }
                      >
                        {ch.acr_priority.toUpperCase()}
                      </span>
                    )}
                    {ch.slice_range && (
                      <span className="text-[9px] text-slate-500">
                        slices {ch.slice_range}
                      </span>
                    )}
                  </div>
                  <div className="text-[13px] font-bold text-cyan-200">{ch.title}</div>
                  {ch.layperson_name && (
                    <div className="mt-0.5 text-[11px] italic text-slate-400">
                      {ch.layperson_name}
                    </div>
                  )}
                  {ch.location_plain && (
                    <div className="mt-1 text-[11px] text-slate-300">
                      📍 {ch.location_plain}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {story?.final_note && (
            <div className="border-t border-slate-800 bg-slate-950 p-3">
              <p className="text-[10px] leading-snug text-slate-400">
                <AlertTriangle className="mr-1 inline h-3 w-3 text-amber-400" />
                {story.final_note}
              </p>
            </div>
          )}
        </aside>
      </div>

      <style>{`
        @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin-slow { animation: spin-slow 3s linear infinite; }
      `}</style>
    </div>
  );
}
