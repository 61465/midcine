'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileUp, Check, X, Loader2 } from 'lucide-react';
import { createStudy, uploadDicomFor } from '../../lib/studies';

interface Item {
  file: File;
  status: 'queued' | 'uploading' | 'ok' | 'err';
  err?: string;
  uid?: string;
}

export default function UploadPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [drag, setDrag] = useState(false);
  const [defaults, setDefaults] = useState({
    patient_id: '',
    patient_name: '',
    modality: 'CT',
    body_part: 'CHEST',
    priority: 'P3',
    referrer: '',
  });

  const addFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const next: Item[] = Array.from(files).map((f) => ({ file: f, status: 'queued' }));
    setItems((cur) => [...cur, ...next]);
  }, []);

  const upload = useCallback(async () => {
    for (let i = 0; i < items.length; i++) {
      const it = items[i]!;
      if (it.status !== 'queued') continue;
      setItems((cur) =>
        cur.map((x, idx) => (idx === i ? { ...x, status: 'uploading' as const } : x)),
      );
      const rec = await createStudy({
        patient_id: defaults.patient_id || `AUTO-${Date.now()}-${i}`,
        patient_name: defaults.patient_name || `File ${it.file.name}`,
        modality: defaults.modality,
        body_part: defaults.body_part,
        priority: defaults.priority,
        referrer: defaults.referrer,
        description: `Batch upload — ${it.file.name}`,
      });
      if (!rec) {
        setItems((cur) =>
          cur.map((x, idx) =>
            idx === i ? { ...x, status: 'err' as const, err: 'Study create failed' } : x,
          ),
        );
        continue;
      }
      const ok = await uploadDicomFor(rec.study_uid, it.file);
      setItems((cur) =>
        cur.map((x, idx) =>
          idx === i
            ? {
                ...x,
                status: ok ? ('ok' as const) : ('err' as const),
                uid: rec.study_uid,
                err: ok ? undefined : 'DICOM upload failed',
              }
            : x,
        ),
      );
    }
  }, [items, defaults]);

  const queued = items.filter((i) => i.status === 'queued').length;
  const ok = items.filter((i) => i.status === 'ok').length;

  return (
    <div className="min-h-screen bg-[#0A0E14] p-6 text-slate-200">
      <header className="mx-auto mb-6 flex max-w-4xl items-center gap-3">
        <Link
          href="/room"
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-cyan-300"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Reading room
        </Link>
        <div className="h-4 w-px bg-slate-800" />
        <FileUp className="h-4 w-4 text-cyan-400" />
        <span className="text-sm font-bold">Batch upload DICOM</span>
      </header>

      <main className="mx-auto max-w-4xl">
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <button
              type="button"
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                addFiles(e.dataTransfer.files);
              }}
              onClick={() => document.getElementById('batch-input')?.click()}
              className={
                'flex h-48 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-sm transition ' +
                (drag
                  ? 'border-cyan-400 bg-cyan-500/10 text-cyan-300'
                  : 'border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300')
              }
            >
              <FileUp className="h-8 w-8" />
              <span>Drop DICOM files here or click to browse</span>
              <span className="text-[10px] text-slate-600">
                Every file becomes its own study record
              </span>
            </button>
            <input
              id="batch-input"
              type="file"
              multiple
              accept=".dcm,.dicom,application/dicom"
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />

            {items.length > 0 && (
              <div className="mt-4 rounded border border-slate-800 bg-slate-950">
                <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2 text-xs">
                  <span className="text-slate-400">
                    {items.length} files · {ok} done · {queued} queued
                  </span>
                  <button
                    type="button"
                    onClick={() => setItems([])}
                    className="text-slate-500 hover:text-slate-300"
                  >
                    Clear
                  </button>
                </div>
                <ul className="max-h-72 overflow-y-auto text-xs">
                  {items.map((it, idx) => (
                    <li
                      key={idx}
                      className="flex items-center justify-between border-b border-slate-900 px-3 py-1.5"
                    >
                      <span className="truncate">{it.file.name}</span>
                      <span>
                        {it.status === 'queued' && (
                          <span className="text-slate-500">queued</span>
                        )}
                        {it.status === 'uploading' && (
                          <Loader2 className="h-3 w-3 animate-spin text-cyan-400" />
                        )}
                        {it.status === 'ok' && <Check className="h-3 w-3 text-emerald-400" />}
                        {it.status === 'err' && (
                          <span className="flex items-center gap-1 text-rose-400">
                            <X className="h-3 w-3" />
                            {it.err ?? 'error'}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="rounded border border-slate-800 bg-slate-950 p-4">
            <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Defaults for batch
            </div>
            <div className="space-y-2 text-[11px]">
              <label className="block">
                <span className="text-slate-400">Patient name</span>
                <input
                  value={defaults.patient_name}
                  onChange={(e) => setDefaults({ ...defaults, patient_name: e.target.value })}
                  placeholder="(from file if blank)"
                  className="mt-0.5 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200"
                />
              </label>
              <label className="block">
                <span className="text-slate-400">MRN prefix</span>
                <input
                  value={defaults.patient_id}
                  onChange={(e) => setDefaults({ ...defaults, patient_id: e.target.value })}
                  placeholder="(auto)"
                  className="mt-0.5 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200"
                />
              </label>
              <label className="block">
                <span className="text-slate-400">Modality</span>
                <select
                  value={defaults.modality}
                  onChange={(e) => setDefaults({ ...defaults, modality: e.target.value })}
                  className="mt-0.5 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200"
                >
                  {['CT', 'MR', 'CR', 'DR', 'US', 'MG', 'NM', 'PT'].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-slate-400">Body part</span>
                <select
                  value={defaults.body_part}
                  onChange={(e) => setDefaults({ ...defaults, body_part: e.target.value })}
                  className="mt-0.5 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200"
                >
                  {[
                    'BRAIN',
                    'CHEST',
                    'ABDOMEN',
                    'PELVIS',
                    'SPINE',
                    'MSK',
                    'CARDIAC',
                    'NECK',
                    'OTHER',
                  ].map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-slate-400">Priority</span>
                <select
                  value={defaults.priority}
                  onChange={(e) => setDefaults({ ...defaults, priority: e.target.value })}
                  className="mt-0.5 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200"
                >
                  {['P1', 'P2', 'P3', 'P4'].map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-slate-400">Referrer</span>
                <input
                  value={defaults.referrer}
                  onChange={(e) => setDefaults({ ...defaults, referrer: e.target.value })}
                  placeholder="Dr. ..."
                  className="mt-0.5 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200"
                />
              </label>
              <button
                type="button"
                onClick={upload}
                disabled={queued === 0}
                className="mt-2 w-full rounded bg-cyan-500 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 disabled:bg-slate-700 disabled:text-slate-400"
              >
                Upload {queued} file{queued === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
