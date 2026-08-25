'use client';

import { useCallback, useRef, useState } from 'react';
import { Upload, X, FileText, Check, AlertCircle } from 'lucide-react';
import { createStudy, uploadDicomFor, uploadSeriesSlice } from '../../../lib/studies';

const MODALITIES = ['CT', 'MR', 'CR', 'DR', 'US', 'MG', 'NM', 'PT'] as const;
const BODY_PARTS = [
  'BRAIN',
  'CHEST',
  'ABDOMEN',
  'PELVIS',
  'SPINE',
  'MSK',
  'CARDIAC',
  'NECK',
  'OTHER',
] as const;
const PRIORITIES = [
  { id: 'P1', label: 'P1 · STAT' },
  { id: 'P2', label: 'P2 · Urgent' },
  { id: 'P3', label: 'P3 · Routine' },
  { id: 'P4', label: 'P4 · Deferred' },
] as const;

interface Props {
  onClose: () => void;
  onCreated: (studyUid: string) => void;
}

type Step = 'form' | 'uploading' | 'done' | 'error';

export function AddCaseDialog({ onClose, onCreated }: Props) {
  const [step, setStep] = useState<Step>('form');
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [drag, setDrag] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [form, setForm] = useState({
    patient_name: '',
    patient_id: '',
    age: '',
    sex: '',
    modality: 'CT' as string,
    body_part: 'CHEST' as string,
    priority: 'P3' as string,
    description: '',
    symptoms: '',
    clinical_history: '',
    referrer: '',
  });
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  const pickFiles = useCallback((fs: FileList | File[] | null) => {
    if (!fs || fs.length === 0) return;
    // Accept any file the user picked. Real DICOM files may have no extension
    // (PACS often names them by SOPInstanceUID). We validate on upload, not here.
    const arr = Array.from(fs).filter((f) => f.size > 0);
    if (arr.length === 0) {
      setErrMsg('Selected file is empty');
      return;
    }
    if (arr.length === 1) {
      setFile(arr[0] ?? null);
      setFiles([]);
    } else {
      setFile(null);
      setFiles(arr);
    }
    setErrMsg(null);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDrag(false);
      pickFiles(e.dataTransfer.files);
    },
    [pickFiles],
  );

  const submit = useCallback(async () => {
    setErrMsg(null);
    if (!form.patient_name.trim() || !form.patient_id.trim()) {
      setErrMsg('Patient name and MRN are required');
      return;
    }
    setStep('uploading');
    const created = await createStudy({
      patient_id: form.patient_id,
      patient_name: form.patient_name,
      age: form.age ? Number(form.age) : null,
      sex: form.sex || null,
      modality: form.modality,
      body_part: form.body_part,
      priority: form.priority,
      description: form.description,
      symptoms: form.symptoms,
      clinical_history: form.clinical_history,
      referrer: form.referrer,
    });
    if (!created) {
      setStep('error');
      setErrMsg('Bridge rejected the study record. Check mcp-bridge on :8210.');
      return;
    }
    if (file) {
      const ok = await uploadDicomFor(created.study_uid, file);
      if (!ok) {
        setStep('error');
        setErrMsg('Study saved but DICOM upload failed.');
        return;
      }
    } else if (files.length > 0) {
      // Parallel upload in batches of 4 with retry — much faster for large series
      const BATCH = 4;
      let completed = 0;
      const failedFiles: string[] = [];

      const uploadOne = async (f: File): Promise<boolean> => {
        for (let attempt = 0; attempt < 3; attempt++) {
          const ok = await uploadSeriesSlice(created.study_uid, f.name, f);
          if (ok) return true;
          // Exponential backoff for retries (250ms, 500ms, 1000ms)
          await new Promise((r) => setTimeout(r, 250 * (attempt + 1) * 2));
        }
        return false;
      };

      for (let i = 0; i < files.length; i += BATCH) {
        const batch = files.slice(i, i + BATCH);
        const results = await Promise.all(batch.map(uploadOne));
        results.forEach((ok, idx) => {
          if (!ok) failedFiles.push(batch[idx]!.name);
          completed += 1;
          setUploadProgress(Math.round((completed / files.length) * 100));
        });
      }

      if (failedFiles.length > 0) {
        setStep('error');
        setErrMsg(
          `${failedFiles.length}/${files.length} slices failed after 3 retries. First: ${failedFiles[0]}`,
        );
        return;
      }
    }
    setStep('done');
    setTimeout(() => onCreated(created.study_uid), 400);
  }, [file, files, form, onCreated]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <div>
            <h2 className="text-sm font-bold text-slate-200">Add case</h2>
            <p className="mt-0.5 text-[10px] text-slate-500">
              Drop a DICOM file or add manually. Study appears in worklist immediately.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-5 p-5">
          <div>
            <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              DICOM file (optional)
            </div>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={onDrop}
              className={
                'flex h-40 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-xs transition ' +
                (drag
                  ? 'border-cyan-400 bg-cyan-500/10 text-cyan-300'
                  : 'border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300')
              }
            >
              {file ? (
                <>
                  <FileText className="h-6 w-6 text-cyan-400" />
                  <span className="max-w-full truncate px-3 text-slate-200">{file.name}</span>
                  <span className="text-[10px] text-slate-500">
                    {(file.size / 1024).toFixed(1)} KB · single frame
                  </span>
                </>
              ) : files.length > 0 ? (
                <>
                  <FileText className="h-6 w-6 text-fuchsia-400" />
                  <span className="text-slate-200">Series · {files.length} slices</span>
                  <span className="text-[10px] text-slate-500">
                    {(files.reduce((a, b) => a + b.size, 0) / 1024 / 1024).toFixed(1)} MB · enables 3D
                  </span>
                </>
              ) : (
                <>
                  <Upload className="h-6 w-6" />
                  <span>Drop DICOM here or click</span>
                  <span className="text-[10px] text-slate-600">
                    single .dcm or select multiple for series (3D)
                  </span>
                </>
              )}
            </button>
            <input
              ref={fileInput}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => pickFiles(e.target.files)}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] text-cyan-300 hover:bg-slate-800"
              >
                📁 Files
              </button>
              <button
                type="button"
                onClick={() => folderInput.current?.click()}
                className="rounded border border-fuchsia-500/40 bg-fuchsia-500/10 px-2 py-1 text-[10px] font-bold text-fuchsia-300 hover:bg-fuchsia-500/20"
              >
                📂 Whole folder (Siemens/GE PACS)
              </button>
            </div>
            <input
              ref={folderInput}
              type="file"
              // @ts-expect-error webkitdirectory is not in TS lib but works everywhere
              webkitdirectory=""
              directory=""
              multiple
              className="hidden"
              onChange={(e) => pickFiles(e.target.files)}
            />
            <p className="mt-2 text-[10px] text-slate-600">
              Single file = 2D · Multiple files or folder = 3D + MPR + MIP · <span className="text-cyan-400">ZIP</span> auto-extracted · <span className="text-fuchsia-300">.IMA / .dcm</span> / any DICOM extension OK
            </p>
            {step === 'uploading' && files.length > 0 && (
              <div className="mt-2">
                <div className="mb-1 flex items-center justify-between text-[10px] text-slate-400">
                  <span>Uploading slices…</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-1 overflow-hidden rounded bg-slate-800">
                  <div
                    className="h-full rounded bg-fuchsia-500 transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 text-[11px]">
              <span className="text-slate-400">Patient name *</span>
              <input
                type="text"
                value={form.patient_name}
                onChange={(e) => setForm({ ...form, patient_name: e.target.value })}
                placeholder="Doe, John"
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 outline-none focus:border-cyan-500"
              />
            </label>
            <label className="text-[11px]">
              <span className="text-slate-400">MRN *</span>
              <input
                type="text"
                value={form.patient_id}
                onChange={(e) => setForm({ ...form, patient_id: e.target.value })}
                placeholder="P-000123"
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 outline-none focus:border-cyan-500"
              />
            </label>
            <label className="text-[11px]">
              <span className="text-slate-400">Age</span>
              <input
                type="number"
                value={form.age}
                onChange={(e) => setForm({ ...form, age: e.target.value })}
                placeholder="58"
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 outline-none focus:border-cyan-500"
              />
            </label>
            <label className="text-[11px]">
              <span className="text-slate-400">Sex</span>
              <select
                value={form.sex}
                onChange={(e) => setForm({ ...form, sex: e.target.value })}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 outline-none focus:border-cyan-500"
              >
                <option value="">—</option>
                <option value="M">M</option>
                <option value="F">F</option>
              </select>
            </label>
            <label className="text-[11px]">
              <span className="text-slate-400">Modality</span>
              <select
                value={form.modality}
                onChange={(e) => setForm({ ...form, modality: e.target.value })}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 outline-none focus:border-cyan-500"
              >
                {MODALITIES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px]">
              <span className="text-slate-400">Body part</span>
              <select
                value={form.body_part}
                onChange={(e) => setForm({ ...form, body_part: e.target.value })}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 outline-none focus:border-cyan-500"
              >
                {BODY_PARTS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
            <label className="col-span-2 text-[11px]">
              <span className="text-slate-400">Priority</span>
              <div className="mt-1 flex gap-1">
                {PRIORITIES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setForm({ ...form, priority: p.id })}
                    className={
                      'flex-1 rounded border px-2 py-1 text-[10px] ' +
                      (form.priority === p.id
                        ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
                        : 'border-slate-700 text-slate-400 hover:border-slate-600')
                    }
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </label>
            <label className="col-span-2 text-[11px]">
              <span className="text-slate-400">
                Symptoms / reason for exam <span className="text-amber-400">*</span>
              </span>
              <textarea
                value={form.symptoms}
                onChange={(e) => setForm({ ...form, symptoms: e.target.value })}
                placeholder="e.g., right knee pain after fall, unable to bear weight, swelling +++"
                rows={2}
                className="mt-1 w-full resize-none rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 outline-none focus:border-cyan-500"
              />
              <span className="mt-0.5 block text-[9px] text-slate-500">
                Feeds AI + appears on the radiologist screen. Maps to DICOM (0032,1030).
              </span>
            </label>
            <label className="col-span-2 text-[11px]">
              <span className="text-slate-400">Clinical history (optional)</span>
              <input
                type="text"
                value={form.clinical_history}
                onChange={(e) => setForm({ ...form, clinical_history: e.target.value })}
                placeholder="HTN, DM, prior meniscus repair 2022"
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 outline-none focus:border-cyan-500"
              />
            </label>
            <label className="col-span-2 text-[11px]">
              <span className="text-slate-400">Study description (optional)</span>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="MR right knee, without contrast"
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 outline-none focus:border-cyan-500"
              />
            </label>
            <label className="col-span-2 text-[11px]">
              <span className="text-slate-400">Referring physician</span>
              <input
                type="text"
                value={form.referrer}
                onChange={(e) => setForm({ ...form, referrer: e.target.value })}
                placeholder="Dr. Ahmed / ER"
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 outline-none focus:border-cyan-500"
              />
            </label>
          </div>
        </div>

        {errMsg && (
          <div className="mx-5 mb-3 flex items-start gap-2 rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{errMsg}</span>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-800 bg-slate-900/40 px-5 py-3">
          <span className="text-[10px] text-slate-500">
            {file
              ? '1 DICOM file — will attach after save'
              : files.length > 0
                ? `${files.length} slices — series will enable 3D`
                : 'Manual case — no DICOM'}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={step === 'uploading'}
              className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={step === 'uploading' || step === 'done'}
              className="flex items-center gap-2 rounded bg-cyan-500 px-4 py-1.5 text-xs font-bold text-slate-950 hover:bg-cyan-400 disabled:bg-slate-700 disabled:text-slate-400"
            >
              {step === 'uploading' && 'Saving…'}
              {step === 'done' && (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Added
                </>
              )}
              {step === 'form' && 'Add to worklist'}
              {step === 'error' && 'Retry'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
