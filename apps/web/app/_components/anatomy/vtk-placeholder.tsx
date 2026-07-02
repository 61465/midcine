'use client';

import { Layers } from 'lucide-react';

// Placeholder for the VTK.js volumetric renderer.
// Will render actual patient DICOM series once segmentation pipeline
// (mcp-bridge → MONAI TotalSegmentator) is wired up in Sprint 4.
export function VtkPlaceholder() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-slate-950 p-6 text-center text-slate-400">
      <Layers className="h-10 w-10 text-slate-600" />
      <div className="text-sm font-semibold text-slate-300">Volumetric Rendering (VTK.js)</div>
      <div className="max-w-sm text-xs leading-relaxed">
        سيعرض هنا التقديم الحجمي للأعضاء المستخرجة من DICOM المريض عبر TotalSegmentator، مع تمييز
        الشرايين والبنى المرضية بألوان مختلفة.
      </div>
      <div className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] text-slate-500">
        Sprint 4 · يعتمد على mcp-bridge + segmentation model
      </div>
    </div>
  );
}
