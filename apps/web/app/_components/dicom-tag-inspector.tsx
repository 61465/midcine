'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Copy, Search } from 'lucide-react';

const MODULES = [
  { key: 'patientModule', label: 'Patient' },
  { key: 'generalStudyModule', label: 'Study' },
  { key: 'generalSeriesModule', label: 'Series' },
  { key: 'generalImageModule', label: 'Image' },
  { key: 'imagePlaneModule', label: 'Plane' },
  { key: 'imagePixelModule', label: 'Pixel' },
] as const;

interface Props {
  imageId: string | null;
  onClose: () => void;
}

export function DicomTagInspector({ imageId, onClose }: Props) {
  const [modules, setModules] = useState<Record<string, Record<string, unknown> | null>>({});
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!imageId) return;
    (async () => {
      const cs = await import('@cornerstonejs/core');
      const next: Record<string, Record<string, unknown> | null> = {};
      for (const m of MODULES) {
        try {
          next[m.key] = cs.metaData.get(m.key, imageId) ?? null;
        } catch {
          next[m.key] = null;
        }
      }
      setModules(next);
    })();
  }, [imageId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const groups = useMemo(() => {
    const query = q.trim().toLowerCase();
    return MODULES.map((m) => {
      const data = modules[m.key];
      if (!data) return { ...m, entries: [] as [string, unknown][] };
      const entries = Object.entries(data).filter(
        ([k, v]) =>
          !query ||
          k.toLowerCase().includes(query) ||
          String(v).toLowerCase().includes(query),
      );
      return { ...m, entries };
    }).filter((g) => g.entries.length > 0);
  }, [modules, q]);

  const totalEntries = groups.reduce((n, g) => n + g.entries.length, 0);

  function fmt(v: unknown): string {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <div>
            <h2 className="text-sm font-bold text-slate-200">DICOM Tag Inspector</h2>
            <div className="mt-0.5 text-[10px] text-slate-500">
              {totalEntries} tag{totalEntries === 1 ? '' : 's'} in {groups.length} module
              {groups.length === 1 ? '' : 's'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-slate-800 px-5 py-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Filter tags…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-900 py-1.5 pl-7 pr-2 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {!imageId && (
            <div className="p-10 text-center text-xs text-slate-500">
              No image loaded. Open a study first.
            </div>
          )}
          {imageId && groups.length === 0 && (
            <div className="p-10 text-center text-xs text-slate-500">
              No matching tags. This can happen if the DICOM has minimal metadata.
            </div>
          )}
          {groups.map((g) => (
            <div key={g.key} className="border-b border-slate-800 last:border-0">
              <div className="border-b border-slate-800 bg-slate-900 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-cyan-400">
                {g.label}
              </div>
              <table className="w-full text-[11px]">
                <tbody>
                  {g.entries.map(([k, v]) => (
                    <tr key={k} className="border-b border-slate-900 hover:bg-slate-900/50">
                      <td className="px-3 py-1.5 font-mono text-slate-400" style={{ width: '40%' }}>
                        {k}
                      </td>
                      <td className="max-w-0 truncate px-3 py-1.5 text-slate-200" title={fmt(v)}>
                        {fmt(v)}
                      </td>
                      <td className="w-8 px-2 text-right">
                        <button
                          type="button"
                          onClick={() => navigator.clipboard.writeText(fmt(v))}
                          className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-cyan-300"
                          title="Copy value"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
