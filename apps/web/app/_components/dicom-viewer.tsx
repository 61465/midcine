'use client';

import { useEffect, useRef, useState } from 'react';
import { ZoomIn, Move, Contrast, RotateCcw } from 'lucide-react';

// Use a LOCAL DICOM file served from /public/samples/ to avoid CORS.
const SAMPLE_IMAGE_ID = 'wadouri:/samples/ct-001.dcm';

type ToolName = 'WindowLevel' | 'Zoom' | 'Pan';

const TOOLS: { id: ToolName; label: string; icon: typeof ZoomIn }[] = [
  { id: 'WindowLevel', label: 'تباين', icon: Contrast },
  { id: 'Zoom', label: 'تكبير', icon: ZoomIn },
  { id: 'Pan', label: 'تحريك', icon: Move },
];

const VIEWPORT_ID = 'midcine-stack-1';
const RENDERING_ENGINE_ID = 'midcine-engine';
const TOOL_GROUP_ID = 'midcine-tools';

export function DicomViewer() {
  const elementRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<string>('بدء التهيئة…');
  const [activeTool, setActiveTool] = useState<ToolName>('WindowLevel');
  const toolGroupRef = useRef<any>(null);
  const csRef = useRef<any>(null);

  useEffect(() => {
    if (!elementRef.current) return;
    let cancelled = false;
    let renderingEngine: any = null;

    (async () => {
      try {
        setStep('استيراد cornerstone…');
        const cs = await import('@cornerstonejs/core');
        const tools = await import('@cornerstonejs/tools');
        const dicomLoader: any = await import('@cornerstonejs/dicom-image-loader');
        csRef.current = cs;

        setStep('init cornerstone…');
        await cs.init();
        await tools.init();

        setStep('تكوين محمّل DICOM…');
        // v2 API: dicomImageLoader.init() auto-wires cornerstone + dicom-parser
        // and self-registers scheme handlers (wadouri:, wadors:).
        // No `.external` refs anymore.
        const dicomInit = dicomLoader.init ?? dicomLoader.default?.init;
        await dicomInit({
          maxWebWorkers: Math.min(navigator.hardwareConcurrency || 2, 2),
        });

        if (cancelled || !elementRef.current) return;

        setStep('إنشاء viewport…');
        renderingEngine = new cs.RenderingEngine(RENDERING_ENGINE_ID);
        renderingEngine.enableElement({
          viewportId: VIEWPORT_ID,
          type: cs.Enums.ViewportType.STACK,
          element: elementRef.current,
          defaultOptions: { background: [0, 0, 0] as [number, number, number] },
        });

        setStep('تحميل الشريحة…');
        const viewport = renderingEngine.getViewport(VIEWPORT_ID) as any;
        await viewport.setStack([SAMPLE_IMAGE_ID], 0);
        viewport.render();

        setStep('تفعيل الأدوات…');
        const { ToolGroupManager, WindowLevelTool, ZoomTool, PanTool, Enums: ToolEnums } = tools;

        tools.addTool(WindowLevelTool);
        tools.addTool(ZoomTool);
        tools.addTool(PanTool);

        const toolGroup = ToolGroupManager.createToolGroup(TOOL_GROUP_ID);
        if (!toolGroup) throw new Error('ToolGroup creation failed');
        toolGroup.addTool(WindowLevelTool.toolName);
        toolGroup.addTool(ZoomTool.toolName);
        toolGroup.addTool(PanTool.toolName);
        toolGroup.addViewport(VIEWPORT_ID, RENDERING_ENGINE_ID);
        toolGroupRef.current = toolGroup;

        toolGroup.setToolActive(WindowLevelTool.toolName, {
          bindings: [{ mouseButton: ToolEnums.MouseBindings.Primary }],
        });
        toolGroup.setToolPassive(ZoomTool.toolName);
        toolGroup.setToolPassive(PanTool.toolName);

        if (!cancelled) {
          setStatus('ready');
          setStep('');
        }
      } catch (e: any) {
        // eslint-disable-next-line no-console
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
        renderingEngine?.disableElement?.(VIEWPORT_ID);
        renderingEngine?.destroy?.();
      } catch {}
    };
  }, []);

  function selectTool(toolId: ToolName) {
    const tg = toolGroupRef.current;
    if (!tg) return;
    for (const t of TOOLS) {
      if (t.id === toolId) {
        tg.setToolActive(t.id, { bindings: [{ mouseButton: 1 }] });
      } else {
        tg.setToolPassive(t.id);
      }
    }
    setActiveTool(toolId);
  }

  function resetView() {
    try {
      const cs = csRef.current;
      const eng = cs?.getRenderingEngine?.(RENDERING_ENGINE_ID);
      const vp = eng?.getViewport?.(VIEWPORT_ID);
      vp?.resetCamera?.();
      vp?.resetProperties?.();
      vp?.render?.();
    } catch {}
  }

  return (
    <div className="flex h-full flex-col bg-black text-white">
      <div className="flex items-center gap-1 border-b border-gray-700 bg-gray-900 px-2 py-1.5">
        {TOOLS.map((t) => {
          const Icon = t.icon;
          const isActive = activeTool === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => selectTool(t.id)}
              className={
                'flex items-center gap-1.5 rounded px-2 py-1 text-xs transition ' +
                (isActive
                  ? 'bg-brand-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white')
              }
            >
              <Icon className="h-4 w-4" />
              <span>{t.label}</span>
            </button>
          );
        })}
        <div className="mx-1 h-5 w-px bg-gray-700" />
        <button
          type="button"
          onClick={resetView}
          className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-gray-300 hover:bg-gray-800 hover:text-white"
        >
          <RotateCcw className="h-4 w-4" />
          <span>إعادة</span>
        </button>
        <div className="flex-1" />
        <span className="ltr-only text-xs text-gray-400">
          {status === 'ready' ? 'CT · sample' : status === 'error' ? 'خطأ' : 'تحميل'}
        </span>
      </div>

      <div className="relative flex-1">
        <div
          ref={elementRef}
          className="absolute inset-0 cursor-crosshair select-none"
          onContextMenu={(e) => e.preventDefault()}
        />
        {status === 'loading' && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 text-gray-400">
            <div>جارٍ التحميل…</div>
            <div className="ltr-only text-[10px] text-gray-500">{step}</div>
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-red-400">
            <span>تعذّر تحميل العيّنة</span>
            <code className="ltr-only max-w-md text-center text-[10px] text-red-300">{error}</code>
            <span className="text-[10px] text-gray-500">افتح DevTools → Console للتفاصيل</span>
          </div>
        )}
      </div>

      <div className="border-t border-gray-700 bg-gray-900 px-3 py-1.5 text-[10px] text-gray-400">
        نصيحة: <span className="text-gray-300">سحب يسار</span> = الأداة المختارة (افتراضي: تباين) ·{' '}
        <span className="text-gray-300">يمين</span> = قائمة معطّلة
      </div>
    </div>
  );
}
