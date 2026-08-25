'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ZoomIn,
  Move,
  Contrast,
  RotateCcw,
  Ruler,
  Circle,
  Triangle,
  Palette,
  FlipHorizontal,
  FlipVertical,
  Loader2,
  RotateCw,
  Maximize2,
  Target,
  Play,
  Pause,
  Layers,
  Box,
  Sparkles,
  Grid3x3,
  Info,
} from 'lucide-react';
import { SliceGrid } from './slice-grid';
import { DicomTagInspector } from './dicom-tag-inspector';
import { AdvancedFilters } from './advanced-filters';
import { SegmentationOverlay } from './segmentation-overlay';

const RENDERING_ENGINE_ID = 'midcine-engine';
const VIEWPORT_ID = 'midcine-stack-1';
const VOLUME_VIEWPORT_ID = 'midcine-volume-1';
const TOOL_GROUP_ID = 'midcine-tools';
const VOLUME_ID = 'midcine:volume';

type ViewMode = '2D' | '3D' | 'MIP' | 'MPR' | 'GRID';

// ---- Hanging protocols: persist WL + colormap per modality/body_part ----
interface HangingProtocol {
  wl?: string;
  colormap?: string;
  rotation?: number;
  invert?: boolean;
}

function hpKey(modality: string, bodyPart: string): string {
  return `midcine.hanging.${(modality || 'any').toUpperCase()}.${(bodyPart || 'any').toUpperCase()}`;
}

function loadHangingProtocol(modality: string, bodyPart: string): HangingProtocol | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(hpKey(modality, bodyPart));
    return raw ? (JSON.parse(raw) as HangingProtocol) : null;
  } catch {
    return null;
  }
}

function saveHangingProtocol(modality: string, bodyPart: string, hp: HangingProtocol): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(hpKey(modality, bodyPart), JSON.stringify(hp));
  } catch {}
}

type ToolName =
  | 'WindowLevel'
  | 'Zoom'
  | 'Pan'
  | 'Length'
  | 'Angle'
  | 'EllipticalROI'
  | 'PlanarFreehandROI'
  | 'Probe';

interface WLPreset {
  id: string;
  label: string;
  center: number;
  width: number;
}

// Radiology standard window/level presets (Hounsfield units for CT, native for MR).
const WL_PRESETS: WLPreset[] = [
  { id: 'dicom', label: 'DICOM VOI', center: 40, width: 400 }, // placeholder — overridden by DICOM VOI tag
  { id: 'default', label: 'Default', center: 40, width: 400 },
  { id: 'soft', label: 'Soft tissue', center: 40, width: 400 },
  { id: 'lung', label: 'Lung', center: -600, width: 1500 },
  { id: 'bone', label: 'Bone', center: 400, width: 1800 },
  { id: 'brain', label: 'Brain', center: 40, width: 80 },
  { id: 'stroke', label: 'Stroke', center: 32, width: 8 },
  { id: 'abdomen', label: 'Abdomen', center: 60, width: 400 },
  { id: 'mediastinum', label: 'Mediastinum', center: 50, width: 350 },
  { id: 'liver', label: 'Liver', center: 90, width: 150 },
  { id: 'mri', label: 'MRI', center: 300, width: 600 },
];

// Cornerstone3D built-in colormaps (from vtk.js).
// Names come from vtkColorMaps.getPresetNames() — verified via cornerstone core.
interface Colormap {
  id: string;
  label: string;
  // vtk preset name
  vtk: string;
}

const COLORMAPS: Colormap[] = [
  { id: 'grayscale', label: 'Grayscale', vtk: 'Grayscale' },
  { id: 'hotIron', label: 'Hot iron', vtk: 'Black-Body Radiation' },
  { id: 'pet', label: 'PET', vtk: 'X Ray' },
  { id: 'rainbow', label: 'Rainbow', vtk: 'Rainbow Desaturated' },
  { id: 'jet', label: 'Jet', vtk: 'jet' },
  { id: 'redYellow', label: 'Red hot', vtk: 'Cool to Warm' },
  { id: 'bone', label: 'Bone', vtk: 'Bone' },
];

const TOOLS: { id: ToolName; label: string; icon: typeof ZoomIn }[] = [
  { id: 'WindowLevel', label: 'W/L', icon: Contrast },
  { id: 'Zoom', label: 'Zoom', icon: ZoomIn },
  { id: 'Pan', label: 'Pan', icon: Move },
  { id: 'Length', label: 'Length', icon: Ruler },
  { id: 'Angle', label: 'Angle', icon: Triangle },
  { id: 'EllipticalROI', label: 'ROI', icon: Circle },
  { id: 'PlanarFreehandROI', label: 'Freehand', icon: Sparkles },
  { id: 'Probe', label: 'Probe', icon: Target },
];

interface ProbeReadout {
  x: number | null;
  y: number | null;
  raw: number | null;
  hu: number | null;
}

interface Props {
  studyUid?: string | null;
  modality?: string;
  bodyPart?: string;
}

export function DicomViewer({ studyUid, modality, bodyPart }: Props) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<string>('Initializing…');
  const [activeTool, setActiveTool] = useState<ToolName>('WindowLevel');
  const [activeWL, setActiveWL] = useState<string>('default');
  const [activeColormap, setActiveColormap] = useState<string>('grayscale');
  const [inverted, setInverted] = useState(false);
  const [interpolate, setInterpolate] = useState(true);
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [frameCount, setFrameCount] = useState(1);
  const [frameIndex, setFrameIndex] = useState(0);
  const [cinePlaying, setCinePlaying] = useState(false);
  const [cineFps, setCineFps] = useState(15);
  const [probe, setProbe] = useState<ProbeReadout>({ x: null, y: null, raw: null, hu: null });
  // Default to MPR so the doctor sees 3-plane synced view immediately on
  // opening any study — critical for verifying the AI report slice by
  // slice. 2D is available on the mode selector but not the entry view.
  const [viewMode, setViewMode] = useState<ViewMode>('MPR');
  const [volumeLoading, setVolumeLoading] = useState(false);
  const [volumeError, setVolumeError] = useState<string | null>(null);
  const [tagInspectorOpen, setTagInspectorOpen] = useState(false);
  const [segmentationOn, setSegmentationOn] = useState(false);
  const filterOverlayRef = useRef<HTMLCanvasElement>(null);
  const [sourceCanvas, setSourceCanvas] = useState<HTMLCanvasElement | null>(null);
  // Sub-series switcher: a single study can contain multiple acquisitions
  // (T1/T2/localizer/sagittal…) — the backend groups them and we let the
  // doctor pick which one to render. `null` = use the primary (default).
  const [seriesGroups, setSeriesGroups] = useState<
    Array<{ series_uid: string; description: string; modality: string; slice_count: number }>
  >([]);
  const [activeSeriesUid, setActiveSeriesUid] = useState<string | null>(null);

  const toolGroupRef = useRef<any>(null);
  const csRef = useRef<any>(null);
  const toolsRef = useRef<any>(null);
  const initializedRef = useRef(false);
  const cineTimerRef = useRef<number | null>(null);
  const imageIdsRef = useRef<string[]>([]);
  const volumeElRef = useRef<HTMLDivElement>(null);
  const mprAxRef = useRef<HTMLDivElement>(null);
  const mprSagRef = useRef<HTMLDivElement>(null);
  const mprCorRef = useRef<HTMLDivElement>(null);
  const currentModeRef = useRef<ViewMode>('2D');

  // Auto-pick sensible default preset from modality/body part
  const suggestedPreset = useMemo(() => {
    const bp = (bodyPart ?? '').toLowerCase();
    const mod = (modality ?? '').toUpperCase();
    if (mod === 'MR') return 'mri';
    if (bp.includes('brain')) return 'brain';
    if (bp.includes('chest')) return 'lung';
    if (bp.includes('abdomen')) return 'abdomen';
    if (bp.includes('bone') || bp.includes('msk') || bp.includes('spine')) return 'bone';
    return 'default';
  }, [modality, bodyPart]);

  // ---- Core init effect (runs once) ----
  useEffect(() => {
    if (!elementRef.current || initializedRef.current) return;
    initializedRef.current = true;
    let cancelled = false;
    let renderingEngine: any = null;

    (async () => {
      try {
        setStep('Loading Cornerstone…');
        const cs = await import('@cornerstonejs/core');
        const tools = await import('@cornerstonejs/tools');
        const dicomLoader: any = await import('@cornerstonejs/dicom-image-loader');
        csRef.current = cs;
        toolsRef.current = tools;

        setStep('Initializing engine…');
        await cs.init();
        await tools.init();

        const dicomInit = dicomLoader.init ?? dicomLoader.default?.init;
        await dicomInit({
          maxWebWorkers: Math.min(navigator.hardwareConcurrency || 2, 2),
        });

        if (cancelled || !elementRef.current) return;

        setStep('Creating viewport…');
        renderingEngine = new cs.RenderingEngine(RENDERING_ENGINE_ID);
        renderingEngine.enableElement({
          viewportId: VIEWPORT_ID,
          type: cs.Enums.ViewportType.STACK,
          element: elementRef.current,
          defaultOptions: { background: [0, 0, 0] as [number, number, number] },
        });

        // Watch container size — Cornerstone needs an explicit resize() call
        // whenever the flex-1 viewport changes dimensions (initial mount often
        // measures 0×0 before layout settles).
        if (typeof ResizeObserver !== 'undefined' && elementRef.current) {
          const ro = new ResizeObserver(() => {
            try { renderingEngine?.resize(true, true); } catch {}
          });
          ro.observe(elementRef.current);
          (renderingEngine as any).__midcineRO = ro;
        }

        setStep('Registering tools…');
        const {
          ToolGroupManager,
          WindowLevelTool,
          ZoomTool,
          PanTool,
          LengthTool,
          AngleTool,
          EllipticalROITool,
          PlanarFreehandROITool,
          ProbeTool,
          StackScrollTool,
          CrosshairsTool,
          Enums: ToolEnums,
        } = tools;

        const registerTools = [
          WindowLevelTool,
          ZoomTool,
          PanTool,
          LengthTool,
          AngleTool,
          EllipticalROITool,
          PlanarFreehandROITool,
          ProbeTool,
          StackScrollTool,
          CrosshairsTool,
        ];

        for (const T of registerTools) {
          try {
            tools.addTool(T);
          } catch {
            // already added — ignore
          }
        }

        const toolGroup =
          ToolGroupManager.getToolGroup(TOOL_GROUP_ID) ??
          ToolGroupManager.createToolGroup(TOOL_GROUP_ID);
        if (!toolGroup) throw new Error('ToolGroup creation failed');
        for (const T of registerTools) {
          try {
            toolGroup.addTool(T.toolName);
          } catch {}
        }
        toolGroup.addViewport(VIEWPORT_ID, RENDERING_ENGINE_ID);
        toolGroupRef.current = toolGroup;

        toolGroup.setToolActive(WindowLevelTool.toolName, {
          bindings: [{ mouseButton: ToolEnums.MouseBindings.Primary }],
        });
        // Always-on wheel scroll for stack navigation
        toolGroup.setToolActive(StackScrollTool.toolName, {
          bindings: [{ mouseButton: ToolEnums.MouseBindings.Wheel }],
        });

        // Probe tool: track cursor movement to read pixel value
        const el = elementRef.current;
        const onMouseMove = (ev: MouseEvent) => {
          try {
            const vp: any = cs.getRenderingEngine(RENDERING_ENGINE_ID)?.getViewport(VIEWPORT_ID);
            if (!vp) return;
            const rect = el!.getBoundingClientRect();
            const canvasPoint: [number, number] = [ev.clientX - rect.left, ev.clientY - rect.top];
            const worldPoint = vp.canvasToWorld(canvasPoint);
            if (!worldPoint) return;
            const imageData = vp.getImageData?.();
            if (!imageData) return;
            const ijk: [number, number, number] = [0, 0, 0];
            imageData.imageData?.worldToIndex?.(worldPoint, ijk);
            const ix = Math.round(ijk[0]);
            const iy = Math.round(ijk[1]);
            const dims = imageData.dimensions ?? [0, 0, 0];
            if (ix < 0 || iy < 0 || ix >= dims[0] || iy >= dims[1]) {
              setProbe({ x: null, y: null, raw: null, hu: null });
              return;
            }
            const scalars = imageData.imageData?.getPointData?.().getScalars?.().getData?.();
            if (!scalars) return;
            const raw = scalars[iy * dims[0] + ix] ?? null;
            // For CT the raw value already reflects rescale slope/intercept (HU).
            const modality = vp.modality ?? null;
            const hu = modality === 'CT' && raw !== null ? Math.round(raw as number) : null;
            setProbe({ x: ix, y: iy, raw: raw as number, hu });
          } catch {
            // silent
          }
        };
        el?.addEventListener('mousemove', onMouseMove);
        (el as any).__midcineMouseMove = onMouseMove;

        if (!cancelled) {
          setStatus('ready');
          setStep('');
        }
      } catch (e: any) {
        console.error('[DicomViewer] init failed:', e);
        if (!cancelled) {
          setError(e?.message ?? String(e));
          setStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        const cs = csRef.current;
        const eng = cs?.getRenderingEngine?.(RENDERING_ENGINE_ID);
        const el = elementRef.current;
        const mm = (el as any)?.__midcineMouseMove;
        if (el && mm) el.removeEventListener('mousemove', mm);
        eng?.disableElement?.(VIEWPORT_ID);
        eng?.destroy?.();
      } catch {}
      initializedRef.current = false;
    };
  }, []);

  // ---- SINGLE unified effect: reset viewports + load study whenever studyUid changes ----
  // Consolidated to avoid ordering bugs: previously the load effect grabbed a stale
  // (destroyed) viewport before the reset effect re-created it, causing black screen.
  useEffect(() => {
    if (!studyUid || status !== 'ready') return;
    let cancelled = false;
    // AbortController for in-flight fetches (per code_reviewer feedback: prevents
    // the viewer from trying to setStack on a stale response when user switches cases fast).
    const controller = new AbortController();

    (async () => {
      const cs = csRef.current;
      if (!cs) return;
      const eng = cs.getRenderingEngine?.(RENDERING_ENGINE_ID);
      if (!eng) return;

      // === Phase 1: full reset ===
      // 1a. Disable ALL viewports from the previous case
      for (const vid of [
        VIEWPORT_ID,
        VOLUME_VIEWPORT_ID,
        'midcine-mpr-ax',
        'midcine-mpr-sag',
        'midcine-mpr-cor',
      ]) {
        try {
          eng.disableElement(vid);
        } catch {}
      }

      // 1b. Purge Cornerstone image + volume caches
      try {
        cs.cache?.purgeCache?.();
      } catch {}

      // 1c. Reset UI state
      setViewMode('2D');
      currentModeRef.current = '2D';
      setVolumeError(null);
      setFrameIndex(0);
      setCinePlaying(false);
      setProbe({ x: null, y: null, raw: null, hu: null });

      if (cancelled || !elementRef.current) return;

      // 1d. Re-enable the 2D stack viewport freshly (element is now visible)
      try {
        eng.enableElement({
          viewportId: VIEWPORT_ID,
          type: cs.Enums.ViewportType.STACK,
          element: elementRef.current,
          defaultOptions: { background: [0, 0, 0] as [number, number, number] },
        });
        toolGroupRef.current?.addViewport(VIEWPORT_ID, RENDERING_ENGINE_ID);
      } catch (e) {
        console.warn('[DicomViewer] re-enable 2D viewport failed:', e);
      }

      // === Phase 2: load new study ===
      try {
        // Fetch series list (multi-slice) — if empty, fall back to single-file endpoint.
        // If the doctor picked a specific sub-series (T1/T2/etc.), use its group
        // endpoint; otherwise the /series endpoint returns the primary (largest).
        let ids: string[] = [];
        try {
          const seriesUrl = activeSeriesUid
            ? `/api/mcp/studies/${encodeURIComponent(studyUid)}/series/group/${encodeURIComponent(activeSeriesUid)}`
            : `/api/mcp/studies/${encodeURIComponent(studyUid)}/series`;
          const r = await fetch(seriesUrl, { signal: controller.signal });
          if (r.ok) {
            const info = (await r.json()) as {
              slices: string[];
              slice_count: number;
              groups?: Array<{
                series_uid: string;
                description: string;
                modality: string;
                slice_count: number;
              }>;
              primary_series_uid?: string;
            };
            if (info.slice_count > 0) {
              ids = info.slices.map(
                (name) =>
                  `wadouri:/api/mcp/studies/${encodeURIComponent(studyUid)}/series/${encodeURIComponent(name)}`,
              );
            }
            // Only refresh the switcher list from the /series call (has groups)
            if (info.groups && info.groups.length > 0) {
              setSeriesGroups(info.groups);
              // On first load: seed activeSeriesUid to the primary so the
              // dropdown reflects reality (without triggering a reload loop).
              if (!activeSeriesUid && info.primary_series_uid) {
                setActiveSeriesUid(info.primary_series_uid);
              }
            }
          }
        } catch (e: any) {
          if (e?.name === 'AbortError') return; // user switched cases mid-fetch
        }

        if (cancelled || controller.signal.aborted) return;

        // Always fetch a FRESH viewport reference after any re-enable
        const vp: any = eng.getViewport(VIEWPORT_ID);
        if (!vp) {
          console.warn('[DicomViewer] viewport not found after re-enable');
          return;
        }

        if (ids.length === 0) {
          const baseUrl = `/api/mcp/studies/${encodeURIComponent(studyUid)}/dicom`;
          const firstId = `wadouri:${baseUrl}`;
          // Probe single file — if the API returns 404, viewer stays empty
          const head = await fetch(baseUrl, {
            method: 'HEAD',
            signal: controller.signal,
          });
          if (controller.signal.aborted || cancelled) return;
          if (!head.ok) {
            setError(`No DICOM attached to this study (HTTP ${head.status})`);
            return;
          }
          await vp.setStack([firstId], 0);
          ids = [firstId];
          try {
            const meta = cs.metaData.get('multiFrameModule', firstId);
            const n = Number(meta?.NumberOfFrames ?? 1);
            if (n > 1) {
              ids = Array.from({ length: n }, (_, i) => `wadouri:${baseUrl}?frame=${i}`);
            }
          } catch {}
        }

        if (cancelled) return;

        await vp.setStack(ids, 0);
        imageIdsRef.current = ids;
        setFrameCount(ids.length);
        setError(null);

        vp.resetCamera?.();
        vp.render();

        // 1st priority: read Window/Level from the DICOM itself (what PACS viewers do).
        // Many hospitals bake the correct W/L into VOI LUT tags — respect those.
        let usedDicomVoi = false;
        try {
          const voiMeta = cs.metaData.get('voiLutModule', ids[0]);
          if (voiMeta) {
            const centers = Array.isArray(voiMeta.windowCenter)
              ? voiMeta.windowCenter
              : [voiMeta.windowCenter];
            const widths = Array.isArray(voiMeta.windowWidth)
              ? voiMeta.windowWidth
              : [voiMeta.windowWidth];
            const c = Number(centers[0]);
            const w = Number(widths[0]);
            if (Number.isFinite(c) && Number.isFinite(w) && w > 0) {
              vp.setProperties({ voiRange: { lower: c - w / 2, upper: c + w / 2 } });
              vp.render();
              usedDicomVoi = true;
              setActiveWL('dicom');
            }
          }
        } catch (e) {
          console.warn('[DicomViewer] failed to read DICOM VOI:', e);
        }

        // Fallback: hanging protocol or modality-suggested preset
        const hp = loadHangingProtocol(modality ?? '', bodyPart ?? '');
        if (!usedDicomVoi) {
          const presetId = hp?.wl ?? suggestedPreset;
          const preset = WL_PRESETS.find((p) => p.id === presetId) ?? WL_PRESETS[0]!;
          applyWL(preset);
          setActiveWL(preset.id);
        }
        if (hp?.colormap) {
          const c = COLORMAPS.find((c) => c.id === hp.colormap);
          if (c) {
            try {
              vp.setProperties({ colormap: { name: c.vtk } });
              vp.render();
              setActiveColormap(c.id);
            } catch {}
          }
        }
        if (hp?.rotation) {
          try {
            vp.setProperties({ rotation: hp.rotation });
            vp.render();
            setRotation(hp.rotation);
          } catch {}
        }
        if (hp?.invert) {
          try {
            vp.setProperties({ invert: true });
            vp.render();
            setInverted(true);
          } catch {}
        }
      } catch (e: any) {
        console.error('[DicomViewer] load failed:', e);
        setError(e?.message ?? String(e));
      }
    })();

    return () => {
      cancelled = true;
      controller.abort(); // aborts any in-flight fetch (per code_reviewer race-fix)
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyUid, status, activeSeriesUid]);

  // When the doctor picks a different sub-series, clear cached groups from
  // the previous study so the switcher list stays coherent while re-fetching.
  useEffect(() => {
    setSeriesGroups([]);
    setActiveSeriesUid(null);
  }, [studyUid]);

  // ---- Persist hanging protocol whenever user changes WL/colormap/rotation/invert ----
  useEffect(() => {
    if (status !== 'ready' || !modality) return;
    saveHangingProtocol(modality ?? '', bodyPart ?? '', {
      wl: activeWL,
      colormap: activeColormap,
      rotation,
      invert: inverted,
    });
  }, [status, modality, bodyPart, activeWL, activeColormap, rotation, inverted]);

  // ---- Switch view mode (2D / 3D / MIP / MPR) ----
  const switchViewMode = useCallback(
    async (mode: ViewMode) => {
      if (mode === viewMode) return;
      const cs = csRef.current;
      const eng = cs?.getRenderingEngine?.(RENDERING_ENGINE_ID);
      const ids = imageIdsRef.current;
      if (!cs || !eng) return;
      currentModeRef.current = mode;
      setViewMode(mode);
      setVolumeError(null);

      // Disable all other viewports first
      const otherIds = [
        VIEWPORT_ID,
        VOLUME_VIEWPORT_ID,
        'midcine-mpr-ax',
        'midcine-mpr-sag',
        'midcine-mpr-cor',
      ];
      for (const vid of otherIds) {
        try {
          eng.disableElement(vid);
        } catch {}
      }

      if (mode === '2D') {
        try {
          eng.enableElement({
            viewportId: VIEWPORT_ID,
            type: cs.Enums.ViewportType.STACK,
            element: elementRef.current!,
            defaultOptions: { background: [0, 0, 0] as [number, number, number] },
          });
          toolGroupRef.current?.addViewport(VIEWPORT_ID, RENDERING_ENGINE_ID);
          const vp: any = eng.getViewport(VIEWPORT_ID);
          await vp.setStack(ids, frameIndex);
          vp.resetCamera?.();
          vp.render();
        } catch (e) {
          console.warn('[DicomViewer] 2D switch failed:', e);
        }
        return;
      }

      if (mode === 'GRID') {
        // GRID has its own component; nothing to enable here.
        return;
      }

      // 3D / MIP / MPR require a volume
      if (ids.length < 3) {
        setVolumeError(`${mode} needs ≥3 slices. Upload a full series.`);
        return;
      }

      setVolumeLoading(true);
      try {
        // ═══ 3D quality gates: validate + sort BEFORE building the volume ═══

        // Step 1: verify each slice has minimum metadata for volumetric rendering.
        // Without ImageOrientationPatient + ImagePositionPatient + PixelSpacing, the
        // resulting 3D is garbage. Fail fast with a clear message.
        const missingMeta: string[] = [];
        try {
          const md = cs.metaData.get('imagePlaneModule', ids[0]!);
          if (!md?.imageOrientationPatient) missingMeta.push('ImageOrientationPatient');
          if (!md?.imagePositionPatient) missingMeta.push('ImagePositionPatient');
          if (!md?.pixelSpacing && !md?.rowPixelSpacing) missingMeta.push('PixelSpacing');
          if (!md?.sliceThickness) missingMeta.push('SliceThickness');
        } catch {
          missingMeta.push('metadata unavailable');
        }
        if (missingMeta.length) {
          setVolumeError(
            `3D unreliable — DICOM missing: ${missingMeta.join(', ')}. Result may distort.`,
          );
        }

        // Step 2: reject multi-series (dominant cause of inaccurate 3D).
        try {
          const sample = [ids[0]!, ids[Math.floor(ids.length / 2)]!, ids[ids.length - 1]!];
          const seriesUids = new Set<string>();
          const frameOfRefs = new Set<string>();
          for (const id of sample) {
            const gs = cs.metaData.get('generalSeriesModule', id);
            if (gs?.seriesInstanceUID) seriesUids.add(gs.seriesInstanceUID);
            const fr = cs.metaData.get('frameOfReferenceModule', id);
            if (fr?.frameOfReferenceUID) frameOfRefs.add(fr.frameOfReferenceUID);
          }
          if (seriesUids.size > 1) {
            setVolumeError(
              `Cannot build 3D: ${seriesUids.size} distinct SeriesInstanceUIDs. Load a single series.`,
            );
            setVolumeLoading(false);
            return;
          }
          if (frameOfRefs.size > 1) {
            setVolumeError(
              `Cannot build 3D: ${frameOfRefs.size} distinct FrameOfReferenceUIDs (misaligned scans).`,
            );
            setVolumeLoading(false);
            return;
          }
        } catch {}

        // Step 2.5: PREFETCH metadata + filter localizers.
        // Cornerstone parses DICOM metadata LAZILY — it's only populated
        // after the pixel loader touches each file. If we run the filter
        // before that, `metaData.get(...)` returns undefined for slices
        // that just weren't parsed yet (not truly missing).
        //   Fix: explicitly load each image (which pulls metadata as a
        //   side-effect) BEFORE deciding what to drop. Then re-filter.
        try {
          if (typeof cs.imageLoader?.loadAndCacheImage === 'function') {
            // Fire all requests in parallel; ignore individual failures
            // (a corrupt slice shouldn't block MPR for the whole study).
            await Promise.allSettled(
              ids.map((id) => cs.imageLoader.loadAndCacheImage(id)),
            );
          }
        } catch (e) {
          console.warn('[3D] metadata prefetch had errors (continuing):', e);
        }

        const validIds: string[] = [];
        const droppedIds: string[] = [];
        for (const id of ids) {
          const md = cs.metaData.get('imagePlaneModule', id);
          if (md?.imagePositionPatient && md?.imageOrientationPatient) {
            validIds.push(id);
          } else {
            droppedIds.push(id);
          }
        }
        if (droppedIds.length > 0) {
          console.warn(
            `[3D] Dropped ${droppedIds.length}/${ids.length} slices missing ImagePositionPatient (likely localizer/scout)`,
          );
        }
        if (validIds.length < 3) {
          // AUTO-FALLBACK: this study genuinely can't be built as a
          // volume (single-frame X-ray, badly-tagged DICOM, or all
          // localizer scouts). Drop back to 2D so the doctor still
          // sees the images instead of a black screen.
          console.warn(
            '[3D] Not enough spatially-registered slices — falling back to 2D stack view.',
          );
          setVolumeError(null);
          setVolumeLoading(false);
          setViewMode('2D');
          return;
        }

        // Step 3: sort valid imageIds by spatial position along the slice
        // normal. File-name order is NOT always spatial order.
        let sortedIds = validIds;
        try {
          const util = cs.utilities?.sortImageIdsAndGetSpacing;
          if (util) {
            const result = util(validIds);
            if (result?.sortedImageIds?.length === validIds.length) {
              sortedIds = result.sortedImageIds;
              if (result.zSpacing && result.zSpacing < 0.5) {
                console.warn(`[3D] Very thin slices (${result.zSpacing}mm) — expect huge volume`);
              }
            }
          }
        } catch (e) {
          console.warn('[3D] Could not sort imageIds, using file order:', e);
        }

        // Step 4: build volume from SORTED imageIds
        const volumeId = `${VOLUME_ID}:${studyUid}`;
        try {
          cs.cache?.removeVolumeLoadObject?.(volumeId);
        } catch {}
        const volume: any = await cs.volumeLoader.createAndCacheVolume(volumeId, {
          imageIds: sortedIds,
        });
        await volume.load?.();

        if (mode === 'MPR') {
          const panes = [
            { id: 'midcine-mpr-ax', el: mprAxRef.current, orient: cs.Enums.OrientationAxis.AXIAL },
            { id: 'midcine-mpr-sag', el: mprSagRef.current, orient: cs.Enums.OrientationAxis.SAGITTAL },
            { id: 'midcine-mpr-cor', el: mprCorRef.current, orient: cs.Enums.OrientationAxis.CORONAL },
          ];
          for (const p of panes) {
            if (!p.el) continue;
            eng.enableElement({
              viewportId: p.id,
              type: cs.Enums.ViewportType.ORTHOGRAPHIC,
              element: p.el,
              defaultOptions: {
                background: [0, 0, 0] as [number, number, number],
                orientation: p.orient,
              },
            });
            toolGroupRef.current?.addViewport(p.id, RENDERING_ENGINE_ID);
          }
          await cs.setVolumesForViewports(
            eng,
            [{ volumeId }],
            panes.map((p) => p.id),
          );
          for (const p of panes) {
            const vpv: any = eng.getViewport(p.id);
            vpv?.resetCamera?.();
            vpv?.render();
          }
          // ---- Activate Crosshairs across all 3 MPR viewports ----
          // Moving the crosshair in one pane auto-updates the other 2 to the
          // same anatomical point (Aidoc/Sectra-style sync).
          try {
            const tg = toolGroupRef.current;
            const _tools: any = toolsRef.current;
            const _crosshairs = _tools?.CrosshairsTool;
            const _enums = _tools?.Enums;
            if (tg && _crosshairs && _enums) {
              tg.setToolConfiguration?.(_crosshairs.toolName, {
                getReferenceLineColor: (id: string) => {
                  if (id.includes('ax')) return 'rgb(0, 200, 255)';
                  if (id.includes('sag')) return 'rgb(255, 100, 100)';
                  if (id.includes('cor')) return 'rgb(150, 255, 100)';
                  return 'rgb(255, 255, 255)';
                },
                getReferenceLineControllable: () => true,
                getReferenceLineDraggableRotatable: () => true,
                getReferenceLineSlabThicknessControlsOn: () => false,
              });
              tg.setToolActive(_crosshairs.toolName, {
                bindings: [{ mouseButton: _enums.MouseBindings.Primary }],
              });
            }
          } catch (crosshairErr) {
            console.warn('CrosshairsTool activation failed:', crosshairErr);
          }
        } else {
          // 3D or MIP: single viewport.
          //
          // For MR non-brain (spine/knee/shoulder/abdomen/pelvis) VOLUME_3D
          // with a preset produces unreadable white/black blocks because MR
          // pixel scales are arbitrary and don't match any preset's transfer
          // function. Best result = ORTHOGRAPHIC + MIP blend + auto-VOI.
          const modUpper = (modality ?? '').toUpperCase();
          const bpLower = (bodyPart ?? '').toLowerCase();
          const isMrNonBrain =
            (modUpper === 'MR' || modUpper === 'MRI') &&
            !bpLower.includes('brain') &&
            !bpLower.includes('head');

          // Force MIP path for MR non-brain even when user clicked "3D".
          const effectiveMode = mode === '3D' && isMrNonBrain ? 'MIP' : mode;

          eng.enableElement({
            viewportId: VOLUME_VIEWPORT_ID,
            type:
              effectiveMode === '3D'
                ? cs.Enums.ViewportType.VOLUME_3D
                : cs.Enums.ViewportType.ORTHOGRAPHIC,
            element: volumeElRef.current!,
            defaultOptions: {
              background: [0, 0, 0] as [number, number, number],
              orientation: cs.Enums.OrientationAxis.AXIAL,
            },
          });
          toolGroupRef.current?.addViewport(VOLUME_VIEWPORT_ID, RENDERING_ENGINE_ID);
          await cs.setVolumesForViewports(
            eng,
            [
              {
                volumeId,
                blendMode:
                  effectiveMode === 'MIP'
                    ? cs.Enums.BlendModes.MAXIMUM_INTENSITY_BLEND
                    : cs.Enums.BlendModes.COMPOSITE,
              },
            ],
            [VOLUME_VIEWPORT_ID],
          );
          const vpv: any = eng.getViewport(VOLUME_VIEWPORT_ID);

          // Toast if we degraded 3D → MIP because MR non-brain doesn't
          // render well with any preset in Cornerstone3D.
          if (effectiveMode === 'MIP' && mode === '3D' && isMrNonBrain) {
            window.dispatchEvent(
              new CustomEvent('midcine:toast', {
                detail: {
                  text: `MR ${bodyPart || ''} 3D not supported — showing MIP projection.`,
                },
              }),
            );
          }

          // Helper: apply auto-VOI (works for both MIP and VOLUME_3D fallback).
          // For 3D presets, VOI comes from the preset's transfer function.
          // For MIP or fallback we set it explicitly from actual voxel range.
          const applyAutoVoi = () => {
            try {
              const vol: any = cs.cache?.getVolume?.(volumeId);
              const scalarData = vol?.getScalarData?.() ?? vol?.scalarData;
              if (!scalarData || scalarData.length === 0) return false;
              let mn = Infinity;
              let mx = -Infinity;
              const step = Math.max(1, Math.floor(scalarData.length / 100000));
              for (let i = 0; i < scalarData.length; i += step) {
                const v = scalarData[i];
                if (v === 0) continue;
                if (v < mn) mn = v;
                if (v > mx) mx = v;
              }
              if (!isFinite(mn) || !isFinite(mx) || mn >= mx) return false;
              const range = mx - mn;
              const lower = mn + range * 0.02;
              const upper = mn + range * 0.98;
              vpv.setProperties?.({ voiRange: { lower, upper } });
              return true;
            } catch {
              return false;
            }
          };

          if (effectiveMode === '3D') {
            // Choose preset from Cornerstone3D's REAL preset list (verified
            // from viewportPresets.js — only 26 presets ship with the lib).
            // Valid MR presets: MR-Default, MR-Angio, MR-MIP, MR-T2-Brain,
            //                   DTI-FA-Brain.
            // Valid CT presets: CT-AAA, CT-AAA2, CT-Air, CT-Bone, CT-Bones,
            //   CT-Cardiac(2/3), CT-Chest-Contrast-Enhanced, CT-Chest-Vessels,
            //   CT-Coronary-Arteries(-2/-3), CT-Cropped-Volume-Bone, CT-Fat,
            //   CT-Liver-Vasculature, CT-Lung, CT-MIP, CT-Muscle,
            //   CT-Pulmonary-Arteries, CT-Soft-Tissue.
            // No PT/NM/PET preset exists — use CT-MIP or MR-MIP as fallback.
            const bp = (bodyPart ?? '').toLowerCase();
            const mod = (modality ?? '').toUpperCase();
            const presetChain: string[] = [];
            if (mod === 'CT') {
              if (bp.includes('brain') || bp.includes('head') || bp.includes('neck')) {
                presetChain.push('CT-AAA', 'CT-Soft-Tissue', 'CT-MIP', 'CT-Bone');
              } else if (bp.includes('chest') || bp.includes('lung') || bp.includes('thorax')) {
                presetChain.push('CT-Chest-Contrast-Enhanced', 'CT-Lung', 'CT-MIP', 'CT-Bone');
              } else if (bp.includes('abdomen') || bp.includes('liver') || bp.includes('pelvis')) {
                presetChain.push('CT-Liver-Vasculature', 'CT-Soft-Tissue', 'CT-MIP', 'CT-Bone');
              } else if (bp.includes('cardiac') || bp.includes('heart')) {
                presetChain.push('CT-Cardiac', 'CT-Coronary-Arteries', 'CT-MIP');
              } else if (
                bp.includes('bone') || bp.includes('msk') || bp.includes('spine') ||
                bp.includes('knee') || bp.includes('hip') || bp.includes('shoulder')
              ) {
                presetChain.push('CT-Bone', 'CT-Bones', 'CT-MIP');
              } else {
                presetChain.push('CT-Soft-Tissue', 'CT-MIP', 'CT-Bone');
              }
            } else if (mod === 'MR' || mod === 'MRI') {
              // MR presets are minimal in Cornerstone3D. MR-Default is the
              // most permissive; MR-MIP a robust fallback that renders
              // anything as maximum-intensity.
              if (bp.includes('brain') || bp.includes('head')) {
                presetChain.push('MR-T2-Brain', 'MR-Default', 'MR-MIP');
              } else if (bp.includes('angio') || bp.includes('vessel')) {
                presetChain.push('MR-Angio', 'MR-MIP', 'MR-Default');
              } else {
                // Spine/knee/shoulder/abdomen/pelvis MR — MR-Default rarely
                // renders well because its transfer function is brain-tuned.
                // Fall straight to MR-MIP which shows any MR volume.
                presetChain.push('MR-MIP', 'MR-Default');
              }
            } else if (mod === 'PT' || mod === 'NM' || mod === 'PET') {
              // No PET preset in Cornerstone3D — use MIP.
              presetChain.push('MR-MIP', 'CT-MIP');
            } else {
              presetChain.push('CT-MIP', 'MR-MIP', 'CT-Bone');
            }

            // Try presets in order. If ALL fail, degrade to plain MIP blend
            // mode on the ORTHOGRAPHIC viewport (no preset needed).
            let applied = '';
            for (const p of presetChain) {
              try {
                vpv.setProperties?.({ preset: p });
                applied = p;
                console.info(`[3D] applied preset "${p}" for ${mod}/${bp}`);
                break;
              } catch (err) {
                console.warn(`[3D] preset "${p}" failed:`, err);
              }
            }
            if (!applied) {
              // Last-resort fallback: switch the blend to MIP so at least
              // something is visible.
              console.warn('[3D] all presets failed — falling back to MIP blend');
              try {
                vpv.setBlendMode?.(cs.Enums.BlendModes.MAXIMUM_INTENSITY_BLEND);
              } catch {}
              applyAutoVoi();
              window.dispatchEvent(
                new CustomEvent('midcine:toast', {
                  detail: {
                    text: `3D preset not available for ${mod || 'this'} — showing MIP instead.`,
                  },
                }),
              );
            } else {
              // Preset applied — but many CT/MR volumes still render black
              // because their voxel range doesn't match the preset's expected
              // 0–255 mapping. Apply auto-VOI as a safety net (won't hurt
              // presets that work, will save presets that don't).
              applyAutoVoi();
            }
          } else if (effectiveMode === 'MIP') {
            // Native MIP path — always apply auto-VOI.
            applyAutoVoi();
          }
          vpv.resetCamera?.();
          vpv.render();
          // Re-apply VOI + render at 3 checkpoints. Streaming volumes fill
          // in over 500–2000ms; if we only measured VOI on the empty (all-
          // zeros) buffer at t=0 the screen stays black. Recomputing at
          // 300/900/2000ms guarantees a visible image once slices arrive.
          for (const delay of [300, 900, 2000]) {
            setTimeout(() => {
              try {
                applyAutoVoi();
                try { eng.resize(true, true); } catch {}
                vpv.resetCamera?.();
                vpv.render();
              } catch {}
            }, delay);
          }
        }
      } catch (e: any) {
        console.error('[DicomViewer] volume load failed:', e);
        const raw = e?.message ?? String(e);
        // Translate common Cornerstone errors to human hints
        let hint = raw;
        if (/orientation|frameOfReference|different series|imageOrientationPatient/i.test(raw)) {
          hint =
            'Slices are not from one contiguous series (missing/mismatched ImageOrientationPatient). Upload a single-series export.';
        } else if (/pixelSpacing|slice.?thickness/i.test(raw)) {
          hint = 'Missing PixelSpacing / SliceThickness metadata. 3D needs full spatial info.';
        } else if (/webgl|texture|memory/i.test(raw)) {
          hint = 'GPU memory / WebGL error. Try a smaller series or close other tabs.';
        }
        setVolumeError(hint);
      } finally {
        setVolumeLoading(false);
      }
    },
    [viewMode, frameIndex, modality, studyUid],
  );

  // ---- Track slice index changes (mouse wheel scroll updates frameIndex) ----
  useEffect(() => {
    if (status !== 'ready') return;
    const cs = csRef.current;
    const eng = cs?.getRenderingEngine?.(RENDERING_ENGINE_ID);
    const vp: any = eng?.getViewport?.(VIEWPORT_ID);
    if (!vp || !elementRef.current) return;
    const listener = () => {
      try {
        const idx = vp.getCurrentImageIdIndex?.() ?? 0;
        setFrameIndex(idx);
      } catch {}
    };
    elementRef.current.addEventListener(cs.Enums.Events.STACK_NEW_IMAGE, listener);
    const el = elementRef.current;
    return () => {
      el?.removeEventListener(cs.Enums.Events.STACK_NEW_IMAGE, listener);
    };
  }, [status]);

  // ---- Keyboard slice navigation: ← → ↑ ↓ scroll slices ----
  // Doctor's core workflow: open case → arrow through every slice to
  // verify AI report. Works in both 2D stack and MPR viewports (last
  // viewport with focus takes the input). Skips when a text field has
  // focus so typing in the report composer isn't hijacked.
  useEffect(() => {
    if (status !== 'ready') return;
    const isTypingTarget = (t: EventTarget | null): boolean => {
      if (!t || !(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        t.isContentEditable === true
      );
    };
    const handler = (ev: KeyboardEvent) => {
      if (isTypingTarget(ev.target)) return;
      // Ignore modified combos (Ctrl+arrow = word nav, etc.)
      if (ev.ctrlKey || ev.altKey || ev.metaKey) return;
      let delta = 0;
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown' || ev.key === 'PageDown') delta = 1;
      else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' || ev.key === 'PageUp') delta = -1;
      else if (ev.key === 'Home') delta = -999999;
      else if (ev.key === 'End') delta = 999999;
      else return;
      ev.preventDefault();

      const cs = csRef.current;
      const eng = cs?.getRenderingEngine?.(RENDERING_ENGINE_ID);
      if (!eng) return;

      if (viewMode === '2D') {
        const vp: any = eng.getViewport?.(VIEWPORT_ID);
        if (!vp) return;
        const total = imageIdsRef.current?.length ?? 0;
        if (total <= 1) return;
        const cur = vp.getCurrentImageIdIndex?.() ?? 0;
        let next = cur + delta;
        if (delta > 100000) next = total - 1;
        else if (delta < -100000) next = 0;
        next = Math.max(0, Math.min(total - 1, next));
        try {
          vp.setImageIdIndex?.(next);
          vp.render?.();
          setFrameIndex(next);
        } catch {}
      } else if (viewMode === 'MPR' || viewMode === '3D') {
        // Cornerstone 3D: scroll the axial viewport (primary) along its
        // slice-index axis. `scroll()` respects the current camera.
        const vpIds = ['midcine-mpr-ax', 'midcine-volume-1'];
        for (const id of vpIds) {
          const vp: any = eng.getViewport?.(id);
          if (!vp) continue;
          try {
            if (typeof vp.scroll === 'function') {
              // scroll(delta, loop?, volumeId?)
              const step = delta > 100000 ? 999 : delta < -100000 ? -999 : delta;
              vp.scroll(step, false);
              vp.render?.();
              return;
            }
          } catch {}
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [status, viewMode]);

  // ---- Interactive report hyperlinks: listen for jump events ----
  useEffect(() => {
    if (status !== 'ready') return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { sliceIndex?: number } | undefined;
      const target = detail?.sliceIndex;
      if (typeof target !== 'number') return;
      const cs = csRef.current;
      const eng = cs?.getRenderingEngine?.(RENDERING_ENGINE_ID);
      const vp: any = eng?.getViewport?.(VIEWPORT_ID);
      if (!vp) return;
      try {
        const total = imageIdsRef.current?.length ?? 0;
        const clamped = Math.max(0, Math.min(target, total - 1));
        vp.setImageIdIndex?.(clamped);
        vp.render?.();
        setFrameIndex(clamped);
      } catch {}
    };
    window.addEventListener('midcine:viewer:jump', handler as EventListener);
    return () => window.removeEventListener('midcine:viewer:jump', handler as EventListener);
  }, [status]);

  // ---- Cine play/pause: manual loop via setInterval calling setImageIdIndex ----
  useEffect(() => {
    if (!cinePlaying || frameCount <= 1) return;
    const cs = csRef.current;
    const eng = cs?.getRenderingEngine?.(RENDERING_ENGINE_ID);
    const vp: any = eng?.getViewport?.(VIEWPORT_ID);
    if (!vp) return;
    const interval = 1000 / Math.max(1, Math.min(60, cineFps));
    cineTimerRef.current = window.setInterval(() => {
      const cur = vp.getCurrentImageIdIndex?.() ?? 0;
      const next = (cur + 1) % imageIdsRef.current.length;
      vp.setImageIdIndex?.(next);
    }, interval);
    return () => {
      if (cineTimerRef.current !== null) {
        clearInterval(cineTimerRef.current);
        cineTimerRef.current = null;
      }
    };
  }, [cinePlaying, cineFps, frameCount]);

  // ---- Tool selection ----
  const selectTool = useCallback((toolId: ToolName) => {
    const tg = toolGroupRef.current;
    const tEnums = toolsRef.current?.Enums;
    if (!tg || !tEnums) return;
    for (const t of TOOLS) {
      if (t.id === toolId) {
        tg.setToolActive(t.id, {
          bindings: [{ mouseButton: tEnums.MouseBindings.Primary }],
        });
      } else {
        tg.setToolPassive(t.id);
      }
    }
    // Also passivate Crosshairs so it doesn't fight for the primary button.
    try {
      tg.setToolPassive('Crosshairs');
    } catch {}
    setActiveTool(toolId);
  }, []);

  // ---- W/L preset ----
  const applyWL = useCallback((preset: WLPreset) => {
    try {
      const cs = csRef.current;
      const eng = cs?.getRenderingEngine?.(RENDERING_ENGINE_ID);
      const vp: any = eng?.getViewport?.(VIEWPORT_ID);
      if (!vp) return;
      const lower = preset.center - preset.width / 2;
      const upper = preset.center + preset.width / 2;
      vp.setProperties({ voiRange: { lower, upper } });
      vp.render();
    } catch (e) {
      console.warn('[DicomViewer] W/L failed:', e);
    }
  }, []);

  const onSelectWL = useCallback(
    (preset: WLPreset) => {
      applyWL(preset);
      setActiveWL(preset.id);
    },
    [applyWL],
  );

  // ---- Colormap ----
  const applyColormap = useCallback((c: Colormap) => {
    try {
      const cs = csRef.current;
      const eng = cs?.getRenderingEngine?.(RENDERING_ENGINE_ID);
      const vp: any = eng?.getViewport?.(VIEWPORT_ID);
      if (!vp) return;
      vp.setProperties({ colormap: { name: c.vtk } });
      vp.render();
      setActiveColormap(c.id);
    } catch (e) {
      console.warn('[DicomViewer] colormap failed:', e);
    }
  }, []);

  // ---- Invert ----
  const toggleInvert = useCallback(() => {
    try {
      const cs = csRef.current;
      const eng = cs?.getRenderingEngine?.(RENDERING_ENGINE_ID);
      const vp: any = eng?.getViewport?.(VIEWPORT_ID);
      if (!vp) return;
      const next = !inverted;
      vp.setProperties({ invert: next });
      vp.render();
      setInverted(next);
    } catch {}
  }, [inverted]);

  // ---- Interpolation ----
  const toggleInterpolation = useCallback(() => {
    try {
      const cs = csRef.current;
      const eng = cs?.getRenderingEngine?.(RENDERING_ENGINE_ID);
      const vp: any = eng?.getViewport?.(VIEWPORT_ID);
      if (!vp) return;
      const next = !interpolate;
      vp.setProperties({
        interpolationType: next
          ? cs.Enums.InterpolationType.LINEAR
          : cs.Enums.InterpolationType.NEAREST,
      });
      vp.render();
      setInterpolate(next);
    } catch {}
  }, [interpolate]);

  // ---- Rotate 90° CW ----
  const rotate = useCallback(() => {
    try {
      const cs = csRef.current;
      const eng = cs?.getRenderingEngine?.(RENDERING_ENGINE_ID);
      const vp: any = eng?.getViewport?.(VIEWPORT_ID);
      if (!vp) return;
      const next = (rotation + 90) % 360;
      vp.setProperties?.({ rotation: next });
      vp.render();
      setRotation(next);
    } catch {}
  }, [rotation]);

  // ---- Flip H/V ----
  const toggleFlipH = useCallback(() => {
    try {
      const cs = csRef.current;
      const eng = cs?.getRenderingEngine?.(RENDERING_ENGINE_ID);
      const vp: any = eng?.getViewport?.(VIEWPORT_ID);
      if (!vp) return;
      const next = !flipH;
      // In Cornerstone3D 2.x, camera flip is via setCamera({ flipHorizontal })
      const cam = vp.getCamera?.() ?? {};
      vp.setCamera?.({ ...cam, flipHorizontal: next });
      vp.render();
      setFlipH(next);
    } catch {}
  }, [flipH]);

  const toggleFlipV = useCallback(() => {
    try {
      const cs = csRef.current;
      const eng = cs?.getRenderingEngine?.(RENDERING_ENGINE_ID);
      const vp: any = eng?.getViewport?.(VIEWPORT_ID);
      if (!vp) return;
      const next = !flipV;
      const cam = vp.getCamera?.() ?? {};
      vp.setCamera?.({ ...cam, flipVertical: next });
      vp.render();
      setFlipV(next);
    } catch {}
  }, [flipV]);

  // ---- Zoom to fit ----
  const zoomToFit = useCallback(() => {
    try {
      const cs = csRef.current;
      const eng = cs?.getRenderingEngine?.(RENDERING_ENGINE_ID);
      const vp: any = eng?.getViewport?.(VIEWPORT_ID);
      vp?.resetCamera?.();
      vp?.render();
    } catch {}
  }, []);

  // ---- Reset ----
  const resetView = useCallback(() => {
    try {
      const cs = csRef.current;
      const eng = cs?.getRenderingEngine?.(RENDERING_ENGINE_ID);
      const vp: any = eng?.getViewport?.(VIEWPORT_ID);
      vp?.resetCamera?.();
      vp?.resetProperties?.();
      vp?.setProperties({ colormap: { name: 'Grayscale' }, invert: false, rotation: 0 });
      const cam = vp?.getCamera?.() ?? {};
      vp?.setCamera?.({ ...cam, flipHorizontal: false, flipVertical: false });
      vp?.render?.();
      setActiveColormap('grayscale');
      setInverted(false);
      setActiveWL('default');
      setRotation(0);
      setFlipH(false);
      setFlipV(false);
    } catch {}
  }, []);

  return (
    <div className="flex h-full flex-col bg-black text-white" dir="ltr">
      {tagInspectorOpen && (
        <DicomTagInspector
          imageId={imageIdsRef.current[frameIndex] ?? null}
          onClose={() => setTagInspectorOpen(false)}
        />
      )}
      {/* Top toolbar — tools + reset */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-800 bg-slate-950 px-2 py-1.5 text-xs">
        {TOOLS.map((t) => {
          const Icon = t.icon;
          const isActive = activeTool === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => selectTool(t.id)}
              className={
                'flex items-center gap-1 rounded px-2 py-1 transition ' +
                (isActive
                  ? 'bg-cyan-500 text-slate-950'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white')
              }
              title={t.label}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          );
        })}
        <div className="mx-1 h-4 w-px bg-slate-700" />
        <button
          type="button"
          onClick={toggleInvert}
          className={
            'flex items-center gap-1 rounded px-2 py-1 ' +
            (inverted
              ? 'bg-slate-700 text-white'
              : 'text-slate-300 hover:bg-slate-800 hover:text-white')
          }
          title="Invert"
        >
          <FlipHorizontal className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Invert</span>
        </button>
        <button
          type="button"
          onClick={toggleInterpolation}
          className="rounded px-2 py-1 text-slate-300 hover:bg-slate-800 hover:text-white"
          title="Toggle smoothing"
        >
          {interpolate ? 'Smooth' : 'Pixel'}
        </button>
        <div className="mx-1 h-4 w-px bg-slate-700" />
        <button
          type="button"
          onClick={rotate}
          className="flex items-center gap-1 rounded px-2 py-1 text-slate-300 hover:bg-slate-800 hover:text-white"
          title="Rotate 90° CW"
        >
          <RotateCw className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{rotation}°</span>
        </button>
        <button
          type="button"
          onClick={toggleFlipH}
          className={
            'flex items-center gap-1 rounded px-2 py-1 ' +
            (flipH
              ? 'bg-slate-700 text-white'
              : 'text-slate-300 hover:bg-slate-800 hover:text-white')
          }
          title="Flip horizontal"
        >
          <FlipHorizontal className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={toggleFlipV}
          className={
            'flex items-center gap-1 rounded px-2 py-1 ' +
            (flipV
              ? 'bg-slate-700 text-white'
              : 'text-slate-300 hover:bg-slate-800 hover:text-white')
          }
          title="Flip vertical"
        >
          <FlipVertical className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={zoomToFit}
          className="flex items-center gap-1 rounded px-2 py-1 text-slate-300 hover:bg-slate-800 hover:text-white"
          title="Zoom to fit"
        >
          <Maximize2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Fit</span>
        </button>
        <button
          type="button"
          onClick={() => setTagInspectorOpen(true)}
          className="flex items-center gap-1 rounded px-2 py-1 text-slate-300 hover:bg-slate-800 hover:text-white"
          title="Inspect DICOM tags"
        >
          <Info className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Tags</span>
        </button>
        <AdvancedFilters
          sourceCanvas={sourceCanvas}
          overlayCanvas={filterOverlayRef.current}
          frameKey={`${studyUid}:${frameIndex}`}
        />
        <button
          type="button"
          onClick={() => setSegmentationOn((v) => !v)}
          className={
            'flex items-center gap-1 rounded px-2 py-1 text-xs ' +
            (segmentationOn
              ? 'bg-emerald-500/20 text-emerald-300'
              : 'text-slate-300 hover:bg-slate-800 hover:text-white')
          }
          title="AI tissue segmentation overlay"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Segment</span>
        </button>
        <button
          type="button"
          onClick={resetView}
          className="ml-auto flex items-center gap-1 rounded px-2 py-1 text-slate-300 hover:bg-slate-800 hover:text-white"
          title="Reset"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Reset</span>
        </button>
      </div>

      {/* View mode switcher: 2D / 3D / MIP */}
      <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-950 px-2 py-1 text-[10px]">
        <span className="font-bold uppercase tracking-widest text-slate-500">View</span>
        {(
          [
            { id: '2D', icon: Layers, label: '2D' },
            { id: 'GRID', icon: Grid3x3, label: 'All Slices' },
            { id: 'MPR', icon: Target, label: 'MPR' },
            { id: '3D', icon: Box, label: '3D Volume' },
            { id: 'MIP', icon: Sparkles, label: 'MIP' },
          ] as const
        ).map((m) => {
          const Icon = m.icon;
          const active = viewMode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => switchViewMode(m.id)}
              className={
                'flex items-center gap-1 rounded px-2 py-1 transition ' +
                (active
                  ? 'bg-fuchsia-500/20 text-fuchsia-300 ring-1 ring-fuchsia-500/50'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200')
              }
              title={m.label}
            >
              <Icon className="h-3 w-3" />
              {m.label}
            </button>
          );
        })}
        {frameCount > 1 && (
          <span className="ml-2 text-slate-500">
            Series · <span className="text-cyan-400">{frameCount} slices</span>
          </span>
        )}
        {/* Sub-series switcher — only appears when a study has >1 acquisition */}
        {seriesGroups.length > 1 && (
          <label className="ml-2 flex items-center gap-1 text-slate-400">
            <span className="uppercase tracking-widest text-slate-500">Series</span>
            <select
              value={activeSeriesUid ?? ''}
              onChange={(e) => setActiveSeriesUid(e.target.value)}
              disabled={status === 'loading' || volumeLoading}
              className="rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-[10px] text-cyan-300 focus:border-cyan-500 focus:outline-none disabled:opacity-40"
              title="Switch between T1/T2/localizer/… acquisitions in this study"
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
        {volumeError && <span className="ml-auto text-amber-400">{volumeError}</span>}
      </div>

      {/* Second toolbar — W/L presets + colormap */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-800 bg-slate-900 px-2 py-1.5 text-[10px]">
        <span className="mr-1 font-bold uppercase tracking-widest text-slate-500">Window</span>
        {WL_PRESETS.slice(0, 8).map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelectWL(p)}
            className={
              'rounded px-2 py-1 transition ' +
              (activeWL === p.id
                ? 'bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-500/50'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200')
            }
            title={`C: ${p.center}  W: ${p.width}`}
          >
            {p.label}
          </button>
        ))}
        <div className="mx-1 h-3 w-px bg-slate-700" />
        <Palette className="h-3 w-3 text-slate-500" />
        <span className="font-bold uppercase tracking-widest text-slate-500">Colormap</span>
        {COLORMAPS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => applyColormap(c)}
            className={
              'rounded px-2 py-1 transition ' +
              (activeColormap === c.id
                ? 'bg-fuchsia-500/20 text-fuchsia-300 ring-1 ring-fuchsia-500/50'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200')
            }
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Viewport (2D stack + 3D volume share space; only one visible per view mode) */}
      <div className="relative flex-1">
        <div
          ref={elementRef}
          className={
            'absolute inset-0 cursor-crosshair select-none ' +
            (viewMode === '2D' ? '' : 'hidden')
          }
          onContextMenu={(e) => e.preventDefault()}
          onMouseEnter={() => {
            // Cornerstone lazily creates the canvas — grab it once it exists
            const c = elementRef.current?.querySelector('canvas') as HTMLCanvasElement | null;
            if (c && c !== sourceCanvas) setSourceCanvas(c);
          }}
        />
        {/* Overlay canvas for post-processing filters */}
        <canvas
          ref={filterOverlayRef}
          className="pointer-events-none absolute inset-0"
          style={{ display: 'none', width: '100%', height: '100%' }}
        />
        {segmentationOn && viewMode === '2D' && studyUid && (
          <SegmentationOverlay
            studyUid={studyUid}
            sliceIndex={frameIndex}
            className="pointer-events-none absolute inset-0"
          />
        )}
        <div
          ref={volumeElRef}
          className={
            'absolute inset-0 cursor-move select-none ' +
            (viewMode === '3D' || viewMode === 'MIP' ? '' : 'hidden')
          }
          onContextMenu={(e) => e.preventDefault()}
        />
        {/* GRID: all slices as thumbnails */}
        {viewMode === 'GRID' && studyUid && imageIdsRef.current.length > 0 && (
          <div className="absolute inset-0 z-10">
            <SliceGrid
              studyUid={studyUid}
              imageIds={imageIdsRef.current}
              activeIndex={frameIndex}
              onPickSlice={(i) => {
                // Use switchViewMode to properly re-enable the 2D viewport
                // (it was disabled when we entered GRID mode). Then jump to slice.
                setFrameIndex(i);
                void switchViewMode('2D').then(() => {
                  const cs = csRef.current;
                  const vp: any = cs
                    ?.getRenderingEngine?.(RENDERING_ENGINE_ID)
                    ?.getViewport?.(VIEWPORT_ID);
                  if (vp) {
                    try {
                      vp.setImageIdIndex?.(i);
                      vp.render?.();
                    } catch (e) {
                      console.warn('[DicomViewer] jump to slice failed:', e);
                    }
                  }
                });
              }}
            />
          </div>
        )}

        {/* MPR: 3 orthographic panes in a 2x2 grid (Ax + Sag + Cor + label) */}
        <div
          className={
            'absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px bg-slate-900 ' +
            (viewMode === 'MPR' ? '' : 'hidden')
          }
        >
          <div className="relative bg-black" onContextMenu={(e) => e.preventDefault()}>
            <div ref={mprAxRef} className="absolute inset-0 cursor-crosshair" />
            <span className="pointer-events-none absolute left-1 top-1 rounded bg-slate-950/80 px-1.5 py-0.5 text-[9px] font-bold text-cyan-300">
              AXIAL
            </span>
          </div>
          <div className="relative bg-black" onContextMenu={(e) => e.preventDefault()}>
            <div ref={mprSagRef} className="absolute inset-0 cursor-crosshair" />
            <span className="pointer-events-none absolute left-1 top-1 rounded bg-slate-950/80 px-1.5 py-0.5 text-[9px] font-bold text-fuchsia-300">
              SAGITTAL
            </span>
          </div>
          <div className="relative bg-black" onContextMenu={(e) => e.preventDefault()}>
            <div ref={mprCorRef} className="absolute inset-0 cursor-crosshair" />
            <span className="pointer-events-none absolute left-1 top-1 rounded bg-slate-950/80 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">
              CORONAL
            </span>
          </div>
          <div className="flex flex-col items-center justify-center gap-2 bg-slate-950 p-3 text-center text-[10px] text-slate-500">
            <Target className="h-6 w-6 text-slate-600" />
            <div className="font-bold text-slate-300">MPR — Cross planes</div>
            <div className="max-w-40 text-[9px]">
              Axial · Sagittal · Coronal reconstructions from the same volume.
              Left-drag on any pane to window/level.
            </div>
          </div>
        </div>
        {volumeLoading && (
          <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-black/60 text-slate-200">
            <Loader2 className="h-6 w-6 animate-spin text-fuchsia-400" />
            <div className="text-xs">Building {viewMode} volume from {frameCount} slices…</div>
            <div className="text-[10px] text-slate-500">
              First-time volumes take a few seconds; cached after.
            </div>
          </div>
        )}
        {/* Pixel probe overlay (always shown when data present) */}
        {(probe.x !== null || probe.hu !== null) && (
          <div className="pointer-events-none absolute right-2 top-2 z-10 rounded border border-cyan-500/40 bg-slate-950/90 p-1.5 font-mono text-[10px] leading-tight text-cyan-200 backdrop-blur-sm">
            {probe.hu !== null ? (
              <div>
                HU: <span className="text-cyan-300">{probe.hu}</span>
              </div>
            ) : probe.raw !== null ? (
              <div>
                Val: <span className="text-cyan-300">{Math.round(probe.raw)}</span>
              </div>
            ) : (
              <div className="text-slate-500">Val: —</div>
            )}
            <div className="text-slate-400">
              X,Y: {probe.x ?? '—'}, {probe.y ?? '—'}
            </div>
          </div>
        )}
        {/* Slice indicator (top-left) */}
        {frameCount > 1 && (
          <div className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-slate-950/80 px-2 py-1 font-mono text-[10px] text-slate-300 backdrop-blur-sm">
            Slice {frameIndex + 1} / {frameCount}
          </div>
        )}
        {/* Orientation labels (L/R/A/P/S/I) — critical for radiologist trust.
            Right/Left flip if flipH; Anterior/Posterior swap if flipV. */}
        {viewMode === '2D' && (
          <>
            <div className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 rounded bg-slate-950/70 px-1.5 py-0.5 text-xs font-black text-amber-400 backdrop-blur-sm">
              {flipH ? 'L' : 'R'}
            </div>
            <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded bg-slate-950/70 px-1.5 py-0.5 text-xs font-black text-amber-400 backdrop-blur-sm">
              {flipH ? 'R' : 'L'}
            </div>
            <div className="pointer-events-none absolute left-1/2 top-8 -translate-x-1/2 rounded bg-slate-950/70 px-1.5 py-0.5 text-xs font-black text-amber-400 backdrop-blur-sm">
              {flipV ? 'P' : 'A'}
            </div>
            <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded bg-slate-950/70 px-1.5 py-0.5 text-xs font-black text-amber-400 backdrop-blur-sm">
              {flipV ? 'A' : 'P'}
            </div>
          </>
        )}
        {status === 'loading' && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
            <div className="text-xs">Preparing viewer…</div>
            <div className="text-[10px] text-slate-500">{step}</div>
          </div>
        )}
        {status === 'ready' && !studyUid && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-slate-500">
            <div className="text-sm">No study selected</div>
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-rose-400">
            <span>Failed to load DICOM</span>
            <code className="max-w-md text-center text-[10px] text-rose-300">{error}</code>
            <span className="text-[10px] text-slate-500">Check DevTools → Console</span>
          </div>
        )}
      </div>

      {/* Cine / slice bar (only if multi-frame) */}
      {frameCount > 1 && (
        <div className="flex items-center gap-2 border-t border-slate-800 bg-slate-900 px-3 py-1.5 text-[10px]">
          <button
            type="button"
            onClick={() => setCinePlaying((p) => !p)}
            className={
              'flex items-center gap-1 rounded px-2 py-0.5 ' +
              (cinePlaying
                ? 'bg-emerald-500/20 text-emerald-300'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white')
            }
          >
            {cinePlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            <span>{cinePlaying ? 'Pause' : 'Play'}</span>
          </button>
          <input
            type="range"
            min={0}
            max={frameCount - 1}
            step={1}
            value={frameIndex}
            onChange={(e) => {
              const idx = Number(e.target.value);
              const cs = csRef.current;
              const vp: any = cs
                ?.getRenderingEngine?.(RENDERING_ENGINE_ID)
                ?.getViewport?.(VIEWPORT_ID);
              vp?.setImageIdIndex?.(idx);
              setFrameIndex(idx);
            }}
            className="flex-1 accent-cyan-500"
          />
          <span className="w-14 text-right font-mono text-slate-400">
            {frameIndex + 1} / {frameCount}
          </span>
          <label className="flex items-center gap-1 text-slate-500">
            <span>fps</span>
            <input
              type="number"
              min={1}
              max={60}
              value={cineFps}
              onChange={(e) => setCineFps(Math.max(1, Math.min(60, Number(e.target.value) || 15)))}
              className="w-10 rounded bg-slate-800 px-1 text-center text-slate-300"
            />
          </label>
        </div>
      )}

      {/* Footer hint */}
      <div className="flex items-center justify-between border-t border-slate-800 bg-slate-950 px-3 py-1.5 text-[10px] text-slate-500">
        <span>
          Left = <span className="text-slate-300">{activeTool}</span> · Wheel /{' '}
          <kbd className="rounded bg-slate-800 px-1 text-[9px] text-slate-300">←</kbd>{' '}
          <kbd className="rounded bg-slate-800 px-1 text-[9px] text-slate-300">→</kbd> = scroll ·{' '}
          <kbd className="rounded bg-slate-800 px-1 text-[9px] text-slate-300">Home</kbd>/
          <kbd className="rounded bg-slate-800 px-1 text-[9px] text-slate-300">End</kbd> = first/last · Auto:{' '}
          <span className="text-cyan-400">{suggestedPreset}</span>
        </span>
        {studyUid && (
          <span className="max-w-md truncate text-slate-600">
            {modality} · {bodyPart} · {studyUid.slice(-24)}
          </span>
        )}
      </div>
    </div>
  );
}
