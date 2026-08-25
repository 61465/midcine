'use client';

import { useCallback, useRef, useState } from 'react';
import {
  X,
  Upload,
  FileText,
  Image as ImageIcon,
  StickyNote,
  Loader2,
  Stethoscope,
  AlertTriangle,
  ClipboardCheck,
  Sparkles,
  Copy,
  ScanLine,
} from 'lucide-react';

export interface DiagnosticReport {
  diagnostic_report?: {
    one_liner?: string;
    problem_representation?: string;
    differential_diagnosis?: {
      dx: string;
      probability: number;
      supporting?: string[];
      against?: string[];
    }[];
    leading_diagnosis?: string;
    confidence?: number;
    recommended_next_steps?: string[];
    recommended_medications?: {
      drug: string;
      dose?: string;
      reason?: string;
      cautions?: string;
    }[];
    red_flags?: string[];
    medications_conflicts?: string[];
  };
  correlation_map?: {
    imaging_matches_symptoms?: { finding: string; symptom: string }[];
    labs_supporting?: string[];
    history_relevance?: string[];
  };
  dossier?: {
    dicom_slice_count?: number;
    pdf_texts?: { name: string }[];
    notes?: { name: string }[];
    photos?: string[];
  };
  latency_ms?: number;
  raw?: string;
  parse_error?: boolean;
}

interface Props {
  studyUid: string;
  modality: string;
  bodyPart: string;
  age?: number | null;
  sex?: string | null;
  symptoms?: string;
  clinicalHistory?: string;
  findings?: string;
  onClose: () => void;
  onCopyToReport?: (text: string) => void;
}

type Phase = 'select' | 'uploading' | 'diagnosing' | 'done' | 'error';

interface ClassifiedFile {
  file: File;
  kind: 'dicom' | 'pdf' | 'note' | 'photo' | 'unknown';
}

function classifyLocal(f: File): ClassifiedFile['kind'] {
  const n = f.name.toLowerCase();
  if (n.endsWith('.pdf')) return 'pdf';
  if (/\.(txt|md|rtf|doc|docx)$/.test(n)) return 'note';
  if (/\.(jpg|jpeg|png|webp|bmp)$/.test(n)) return 'photo';
  if (/\.(dcm|dicom|ima|dic)$/.test(n)) return 'dicom';
  // Bare files or unusual — default to DICOM (PACS often has no extension)
  return 'dicom';
}

export function PatientIntakeDialog({
  studyUid,
  modality,
  bodyPart,
  age,
  sex,
  symptoms,
  clinicalHistory,
  findings,
  onClose,
  onCopyToReport,
}: Props) {
  const [files, setFiles] = useState<ClassifiedFile[]>([]);
  const [drag, setDrag] = useState(false);
  const [phase, setPhase] = useState<Phase>('select');
  const [progress, setProgress] = useState(0);
  const [diagnosis, setDiagnosis] = useState<DiagnosticReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  const pick = useCallback((fs: FileList | File[] | null) => {
    if (!fs || fs.length === 0) return;
    const classified = Array.from(fs)
      .filter((f) => f.size > 0)
      .map((file) => ({ file, kind: classifyLocal(file) }));
    setFiles(classified);
    setErr(null);
  }, []);

  const counts = files.reduce(
    (acc, f) => {
      acc[f.kind] = (acc[f.kind] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const runFullFlow = useCallback(async () => {
    setErr(null);

    if (files.length > 0) {
      setPhase('uploading');
      setProgress(0);
      // Upload in chunks of 10 to avoid multipart-size explosions
      const CHUNK = 10;
      for (let i = 0; i < files.length; i += CHUNK) {
        const chunk = files.slice(i, i + CHUNK);
        const fd = new FormData();
        for (const c of chunk) fd.append('files', c.file, c.file.name);
        try {
          const r = await fetch(`/api/mcp/studies/${encodeURIComponent(studyUid)}/intake`, {
            method: 'POST',
            body: fd,
          });
          if (!r.ok) {
            setPhase('error');
            setErr(`Intake failed at file ${i + 1}: HTTP ${r.status}`);
            return;
          }
        } catch (e: any) {
          setPhase('error');
          setErr(String(e?.message ?? e));
          return;
        }
        setProgress(Math.round(((i + chunk.length) / files.length) * 100));
      }
    }

    // Trigger diagnosis (works even when no new files were uploaded — uses
    // whatever the study already has: DICOM slices, prior reports, notes, etc.)
    setPhase('diagnosing');
    try {
      const r = await fetch('/api/mcp/ai/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          study_uid: studyUid,
          modality,
          body_part: bodyPart,
          patient_age: age ?? null,
          patient_sex: sex ?? null,
          symptoms: symptoms ?? '',
          clinical_history: clinicalHistory ?? '',
          findings: findings ?? '',
        }),
      });
      const data = (await r.json()) as DiagnosticReport & { ok?: boolean; error?: string };
      if (!r.ok || (data as any).ok === false) {
        setPhase('error');
        setErr((data as any).error ?? 'Diagnose call failed');
        return;
      }
      setDiagnosis(data);
      setPhase('done');
    } catch (e: any) {
      setPhase('error');
      setErr(String(e?.message ?? e));
    }
  }, [files, studyUid, modality, bodyPart, age, sex, symptoms, clinicalHistory, findings]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-8">
      <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <div className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-fuchsia-400" />
            <div>
              <h2 className="text-sm font-bold text-slate-200">Full patient intake</h2>
              <p className="text-[10px] text-slate-500">
                Upload every file about the patient (DICOMs · labs · prescriptions · notes ·
                photos) — AI will correlate and diagnose.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {phase === 'select' && (
          <div className="p-6">
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
                pick(e.dataTransfer.files);
              }}
              onClick={() => folderInput.current?.click()}
              className={
                'flex h-48 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-sm transition ' +
                (drag
                  ? 'border-fuchsia-400 bg-fuchsia-500/10 text-fuchsia-300'
                  : 'border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300')
              }
            >
              <Upload className="h-8 w-8" />
              <span>Drop the patient folder here or click to browse</span>
              <span className="text-[10px] text-slate-600">
                Accepts every file: MR/CT slices · PDF lab reports · prescriptions · text notes ·
                clinical photos
              </span>
            </button>
            <input
              ref={folderInput}
              type="file"
              // @ts-expect-error webkitdirectory not in TS lib
              webkitdirectory=""
              directory=""
              multiple
              className="hidden"
              onChange={(e) => pick(e.target.files)}
            />
            <input
              ref={fileInput}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => pick(e.target.files)}
            />
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="text-xs text-slate-500 underline hover:text-cyan-300"
              >
                Or pick individual files instead of a folder
              </button>
            </div>

            {files.length === 0 && (
              <button
                type="button"
                onClick={runFullFlow}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 py-3 text-sm font-bold text-cyan-200 hover:bg-cyan-500/20"
                title="Run AI diagnosis using DICOM slices + reports already attached to this study"
              >
                <Sparkles className="h-4 w-4" />
                Skip upload — diagnose from existing study data
              </button>
            )}

            {files.length > 0 && (
              <div className="mt-5 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-300">
                    Detected {files.length} files
                  </div>
                  <button
                    type="button"
                    onClick={() => setFiles([])}
                    className="text-[10px] text-slate-500 hover:text-slate-300"
                  >
                    Clear
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <TypeChip
                    icon={<ScanLine className="h-3 w-3" />}
                    label="DICOM slices"
                    count={counts.dicom ?? 0}
                    color="cyan"
                  />
                  <TypeChip
                    icon={<FileText className="h-3 w-3" />}
                    label="PDF reports"
                    count={counts.pdf ?? 0}
                    color="fuchsia"
                  />
                  <TypeChip
                    icon={<StickyNote className="h-3 w-3" />}
                    label="Notes"
                    count={counts.note ?? 0}
                    color="amber"
                  />
                  <TypeChip
                    icon={<ImageIcon className="h-3 w-3" />}
                    label="Clinical photos"
                    count={counts.photo ?? 0}
                    color="emerald"
                  />
                </div>
                <button
                  type="button"
                  onClick={runFullFlow}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-fuchsia-500 to-cyan-500 py-3 text-sm font-bold text-slate-950 hover:from-fuchsia-400 hover:to-cyan-400"
                >
                  <Sparkles className="h-4 w-4" />
                  Upload + Diagnose (AI correlates everything)
                </button>
              </div>
            )}
          </div>
        )}

        {(phase === 'uploading' || phase === 'diagnosing') && (
          <div className="p-8 text-center">
            <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-fuchsia-400" />
            <div className="text-sm font-bold text-slate-200">
              {phase === 'uploading'
                ? `Uploading files… ${progress}%`
                : 'AI reading + correlating everything…'}
            </div>
            <div className="mt-2 text-[11px] text-slate-500">
              {phase === 'diagnosing'
                ? 'Ensembling 5 models (Mistral Large + Medium + Llama 3.3 70B + Llama 4 Scout + GPT-OSS 120B) for medical accuracy.'
                : `${files.length} files being classified and stored.`}
            </div>
            {phase === 'uploading' && (
              <div className="mt-4 h-2 overflow-hidden rounded bg-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-fuchsia-500 to-cyan-500 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </div>
        )}

        {phase === 'error' && (
          <div className="p-8 text-center">
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-rose-400" />
            <div className="text-sm font-bold text-rose-300">Something went wrong</div>
            <div className="mt-2 text-xs text-rose-200">{err}</div>
            <button
              type="button"
              onClick={() => setPhase('select')}
              className="mt-4 rounded bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400"
            >
              Try again
            </button>
          </div>
        )}

        {phase === 'done' && diagnosis && (
          <DiagnosisView
            report={diagnosis}
            onCopyToReport={onCopyToReport}
            onDismiss={onClose}
          />
        )}
      </div>
    </div>
  );
}

function TypeChip({
  icon,
  label,
  count,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  color: 'cyan' | 'fuchsia' | 'amber' | 'emerald';
}) {
  const styles: Record<string, string> = {
    cyan: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300',
    fuchsia: 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300',
    amber: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
    emerald: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  };
  return (
    <div className={`rounded border p-2 text-center ${styles[color]}`}>
      <div className="mb-0.5 flex items-center justify-center gap-1 text-[10px] font-bold">
        {icon} {label}
      </div>
      <div className="text-xl font-black">{count}</div>
    </div>
  );
}

function DiagnosisView({
  report,
  onCopyToReport,
  onDismiss,
}: {
  report: DiagnosticReport;
  onCopyToReport?: (text: string) => void;
  onDismiss: () => void;
}) {
  const dx = report.diagnostic_report;
  const corr = report.correlation_map;

  if (report.parse_error && report.raw) {
    return (
      <div className="max-h-[75vh] space-y-4 overflow-y-auto p-6">
        <div className="rounded border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-200">
          AI returned unstructured output. Raw response:
        </div>
        <pre className="whitespace-pre-wrap rounded bg-slate-900 p-3 text-[11px] text-slate-300">
          {report.raw}
        </pre>
      </div>
    );
  }

  const combinedText = dx
    ? `IMPRESSION\n${dx.one_liner ?? ''}\n\nLeading Dx: ${dx.leading_diagnosis ?? '?'} (confidence ${Math.round((dx.confidence ?? 0) * 100)}%)\n\n${dx.problem_representation ?? ''}\n\nDIFFERENTIAL:\n${(dx.differential_diagnosis ?? [])
        .map(
          (d, i) =>
            `${i + 1}. ${d.dx} (${Math.round(d.probability * 100)}%) — for: ${(d.supporting ?? []).join(', ')} — against: ${(d.against ?? []).join(', ')}`,
        )
        .join('\n')}\n\nNEXT STEPS:\n${(dx.recommended_next_steps ?? []).map((s) => `• ${s}`).join('\n')}\n\n${
        dx.recommended_medications && dx.recommended_medications.length
          ? 'MEDICATIONS:\n' +
            dx.recommended_medications
              .map((m) => `• ${m.drug} ${m.dose ?? ''} — ${m.reason ?? ''}${m.cautions ? ` (caution: ${m.cautions})` : ''}`)
              .join('\n')
          : ''
      }${
        dx.red_flags && dx.red_flags.length
          ? '\n\n⚠️ RED FLAGS:\n' + dx.red_flags.map((r) => `• ${r}`).join('\n')
          : ''
      }`
    : '';

  return (
    <div className="max-h-[75vh] space-y-4 overflow-y-auto p-6">
      {report.dossier && (
        <div className="rounded border border-slate-800 bg-slate-900/40 p-3 text-[10px] text-slate-400">
          Correlated {report.dossier.dicom_slice_count ?? 0} DICOM slices,{' '}
          {report.dossier.pdf_texts?.length ?? 0} PDFs, {report.dossier.notes?.length ?? 0} notes,{' '}
          {report.dossier.photos?.length ?? 0} photos in {report.latency_ms}ms via Unified Brain (5
          models merged)
        </div>
      )}

      {dx?.one_liner && (
        <div className="rounded-lg border border-fuchsia-500/40 bg-fuchsia-500/10 p-4">
          <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-fuchsia-300">
            <ClipboardCheck className="h-3 w-3" />
            Executive summary
          </div>
          <div className="text-sm font-bold text-slate-100">{dx.one_liner}</div>
        </div>
      )}

      {dx?.leading_diagnosis && (
        <div className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 p-4">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-cyan-300">
            Leading diagnosis
          </div>
          <div className="text-lg font-black text-slate-100">{dx.leading_diagnosis}</div>
          {typeof dx.confidence === 'number' && (
            <div className="mt-2">
              <div className="mb-1 flex items-center justify-between text-[10px] text-cyan-200">
                <span>Confidence</span>
                <span className="font-bold">{Math.round(dx.confidence * 100)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded bg-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500"
                  style={{ width: `${Math.round(dx.confidence * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {dx?.problem_representation && (
        <div>
          <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Problem representation
          </div>
          <div className="text-sm leading-relaxed text-slate-300">
            {dx.problem_representation}
          </div>
        </div>
      )}

      {dx?.differential_diagnosis && dx.differential_diagnosis.length > 0 && (
        <div>
          <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Differential diagnosis
          </div>
          <div className="space-y-2">
            {dx.differential_diagnosis.map((d, i) => (
              <div
                key={i}
                className="rounded border border-slate-800 bg-slate-900/40 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-bold text-slate-200">{d.dx}</div>
                  <div
                    className={
                      'shrink-0 rounded px-2 py-0.5 text-[10px] font-bold ' +
                      (d.probability > 0.6
                        ? 'bg-emerald-500 text-slate-950'
                        : d.probability > 0.3
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-slate-700 text-slate-300')
                    }
                  >
                    {Math.round(d.probability * 100)}%
                  </div>
                </div>
                {d.supporting && d.supporting.length > 0 && (
                  <div className="mt-1.5 text-[10px] text-emerald-300">
                    <strong>For:</strong> {d.supporting.join(' · ')}
                  </div>
                )}
                {d.against && d.against.length > 0 && (
                  <div className="mt-0.5 text-[10px] text-rose-300">
                    <strong>Against:</strong> {d.against.join(' · ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {corr?.imaging_matches_symptoms && corr.imaging_matches_symptoms.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Correlation map
          </div>
          <ul className="space-y-1 text-[11px] text-slate-300">
            {corr.imaging_matches_symptoms.map((m, i) => (
              <li key={i} className="rounded border border-slate-800 bg-slate-900/40 p-2">
                <strong className="text-cyan-300">{m.finding}</strong> ↔{' '}
                <span className="text-fuchsia-300">{m.symptom}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {dx?.recommended_medications && dx.recommended_medications.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Recommended medications
          </div>
          <div className="space-y-1.5">
            {dx.recommended_medications.map((m, i) => (
              <div key={i} className="rounded border border-slate-800 bg-slate-900/40 p-2 text-[11px]">
                <div className="font-bold text-slate-200">
                  {m.drug} {m.dose && <span className="text-slate-400">— {m.dose}</span>}
                </div>
                {m.reason && <div className="mt-0.5 text-slate-400">Reason: {m.reason}</div>}
                {m.cautions && (
                  <div className="mt-0.5 text-amber-300">Caution: {m.cautions}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {dx?.recommended_next_steps && dx.recommended_next_steps.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Next steps
          </div>
          <ul className="space-y-1 text-[11px] text-slate-300">
            {dx.recommended_next_steps.map((s, i) => (
              <li key={i} className="flex items-start gap-2 rounded border border-slate-800 bg-slate-900/40 p-2">
                <span className="mt-0.5 h-3 w-3 shrink-0 rounded-sm border border-slate-700" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {dx?.red_flags && dx.red_flags.length > 0 && (
        <div className="rounded-lg border border-rose-500/50 bg-rose-500/10 p-3">
          <div className="mb-1 flex items-center gap-2 text-[10px] font-bold text-rose-300">
            <AlertTriangle className="h-3 w-3" /> RED FLAGS
          </div>
          <ul className="space-y-1 text-[11px] text-rose-100">
            {dx.red_flags.map((r, i) => (
              <li key={i}>• {r}</li>
            ))}
          </ul>
        </div>
      )}

      {dx?.medications_conflicts && dx.medications_conflicts.length > 0 && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3">
          <div className="mb-1 text-[10px] font-bold text-amber-300">Medication conflicts</div>
          <ul className="space-y-1 text-[11px] text-amber-100">
            {dx.medications_conflicts.map((r, i) => (
              <li key={i}>• {r}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-slate-800 pt-4">
        {onCopyToReport && (
          <button
            type="button"
            onClick={() => onCopyToReport(combinedText)}
            className="flex items-center gap-1 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-cyan-400"
          >
            <Copy className="h-3.5 w-3.5" />
            Paste into report
          </button>
        )}
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(combinedText)}
          className="flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
        >
          <Copy className="h-3.5 w-3.5" />
          Copy to clipboard
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="ml-auto rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800"
        >
          Close
        </button>
      </div>
    </div>
  );
}
