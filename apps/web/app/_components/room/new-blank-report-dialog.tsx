'use client';

/**
 * NewBlankReportDialog — entry point for the "New blank report" flow.
 *
 * Accepts:
 *   - Individual files or a whole folder (webkitdirectory)
 *   - Pasted plain text
 *
 * Upload strategy:
 *   - ≤ 15 files AND ≤ 25 MB total → single POST /api/mcp/ai/report-sessions
 *     (fast path: one HTTP round-trip)
 *   - > 15 files OR larger total → chunked upload:
 *       1. POST /init  (creates empty session)
 *       2. POST /{sid}/files repeatedly (batches of 8 files)
 *       3. POST /{sid}/process (triggers AI extract + compose)
 *     Then navigates to /reports/generate/{sid}.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  X,
  Upload,
  Loader2,
  FileText,
  Trash2,
  Sparkles,
  AlertTriangle,
  FolderUp,
} from 'lucide-react';

interface PickedFile {
  file: File;
  id: string;
  relPath?: string; // for folder-picked files
}

// Hard client-side caps — well within backend + browser tolerances.
const MAX_FILES = 200;
const MAX_TOTAL_BYTES = 300 * 1024 * 1024; // 300 MB
const MAX_PER_FILE_BYTES = 30 * 1024 * 1024; // 30 MB per file
const SINGLE_SHOT_FILE_LIMIT = 15;
const SINGLE_SHOT_TOTAL_BYTES = 25 * 1024 * 1024; // 25 MB
const CHUNK_BATCH_SIZE = 8; // files per HTTP request in chunked mode
const CHUNK_BATCH_BYTES = 20 * 1024 * 1024; // hard cap per batch

// File types we accept — anything else is skipped silently on folder drop
const ACCEPT_EXTS = new Set([
  '.pdf', '.txt', '.md', '.rtf', '.doc', '.docx',
  '.png', '.jpg', '.jpeg', '.webp',
]);

type Phase =
  | 'select'
  | 'uploading'
  | 'appending'
  | 'processing';

export function NewBlankReportDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [pastedText, setPastedText] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('select');
  const [uploadPct, setUploadPct] = useState<number>(0);
  const [processHint, setProcessHint] = useState<string>('');
  const fileRef = useRef<HTMLInputElement | null>(null);
  const folderRef = useRef<HTMLInputElement | null>(null);

  const pick = useCallback((fs: FileList | File[] | null) => {
    if (!fs || (fs as FileList).length === 0) return;
    const arr = Array.from(fs);
    setErr(null);
    setWarn(null);

    // Filter to accepted types + skip empty
    const filtered = arr.filter((f) => {
      if (f.size === 0) return false;
      const ext = ('.' + (f.name.split('.').pop() ?? '')).toLowerCase();
      return ACCEPT_EXTS.has(ext);
    });

    if (filtered.length === 0 && arr.length > 0) {
      setErr(
        `None of the ${arr.length} selected items are supported report types ` +
        `(PDF/TXT/MD/RTF/DOC/DOCX/PNG/JPG/WEBP). Please pick medical reports, ` +
        `not the template library or DICOM slices.`,
      );
      return;
    }

    setFiles((prev) => {
      const combined: PickedFile[] = [...prev];
      let totalBytes = combined.reduce((s, p) => s + p.file.size, 0);
      let skippedType = arr.length - filtered.length;
      let skippedOversized = 0;
      let skippedForCount = 0;
      let skippedForTotal = 0;

      for (const f of filtered) {
        if (combined.length >= MAX_FILES) {
          skippedForCount++;
          continue;
        }
        if (f.size > MAX_PER_FILE_BYTES) {
          skippedOversized++;
          continue;
        }
        if (totalBytes + f.size > MAX_TOTAL_BYTES) {
          skippedForTotal++;
          continue;
        }
        // For folder-picked items, File.webkitRelativePath holds the sub-path
        const relPath = (f as File & { webkitRelativePath?: string }).webkitRelativePath;
        combined.push({
          file: f,
          id: crypto.randomUUID(),
          relPath: relPath || undefined,
        });
        totalBytes += f.size;
      }

      const notes: string[] = [];
      if (skippedType)
        notes.push(`${skippedType} skipped (unsupported type)`);
      if (skippedForCount)
        notes.push(`${skippedForCount} skipped (max ${MAX_FILES} files)`);
      if (skippedForTotal)
        notes.push(
          `${skippedForTotal} skipped (total > ${MAX_TOTAL_BYTES / 1024 / 1024}MB)`,
        );
      if (skippedOversized)
        notes.push(
          `${skippedOversized} skipped (single file > ${
            MAX_PER_FILE_BYTES / 1024 / 1024
          }MB)`,
        );
      setWarn(notes.length ? notes.join(' · ') : null);
      return combined;
    });
  }, []);

  const totalSize = useMemo(
    () => files.reduce((s, f) => s + f.file.size, 0),
    [files],
  );

  const useChunked = useMemo(
    () =>
      files.length > SINGLE_SHOT_FILE_LIMIT ||
      totalSize > SINGLE_SHOT_TOTAL_BYTES,
    [files.length, totalSize],
  );

  // ---- Chunked upload helpers ----

  const initSession = useCallback(async (): Promise<string> => {
    const fd = new FormData();
    if (title.trim()) fd.append('title', title.trim());
    const r = await fetch('/api/mcp/ai/report-sessions/init', {
      method: 'POST',
      body: fd,
    });
    const j = await r.json();
    if (!j?.ok || !j.session_id) {
      throw new Error(j?.error ?? `init HTTP ${r.status}`);
    }
    return j.session_id as string;
  }, [title]);

  const uploadBatch = useCallback(
    async (sid: string, batch: PickedFile[]) => {
      const fd = new FormData();
      for (const p of batch) fd.append('files', p.file, p.file.name);
      const r = await fetch(
        `/api/mcp/ai/report-sessions/${encodeURIComponent(sid)}/files`,
        { method: 'POST', body: fd },
      );
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
    },
    [],
  );

  const processSession = useCallback(
    async (sid: string) => {
      const fd = new FormData();
      if (title.trim()) fd.append('title', title.trim());
      const r = await fetch(
        `/api/mcp/ai/report-sessions/${encodeURIComponent(sid)}/process`,
        { method: 'POST', body: fd },
      );
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      return j;
    },
    [title],
  );

  // ---- Submit orchestrator ----

  const submit = useCallback(async () => {
    if (files.length === 0 && !pastedText.trim()) {
      setErr('Attach at least one report OR paste some text.');
      return;
    }
    if (totalSize > MAX_TOTAL_BYTES) {
      setErr(
        `Total upload is ${(totalSize / 1024 / 1024).toFixed(1)}MB — over the ` +
        `${MAX_TOTAL_BYTES / 1024 / 1024}MB limit.`,
      );
      return;
    }
    setBusy(true);
    setErr(null);
    setUploadPct(0);

    try {
      let sid: string;

      if (useChunked) {
        // ---- Chunked path ----
        setPhase('uploading');
        setProcessHint(
          `Uploading ${files.length} file${files.length === 1 ? '' : 's'} in batches…`,
        );

        sid = await initSession();

        // Build batches respecting per-batch byte cap
        const batches: PickedFile[][] = [];
        let cur: PickedFile[] = [];
        let curBytes = 0;
        for (const p of files) {
          if (
            cur.length >= CHUNK_BATCH_SIZE ||
            curBytes + p.file.size > CHUNK_BATCH_BYTES
          ) {
            if (cur.length) batches.push(cur);
            cur = [];
            curBytes = 0;
          }
          cur.push(p);
          curBytes += p.file.size;
        }
        if (cur.length) batches.push(cur);

        for (let i = 0; i < batches.length; i++) {
          const batch = batches[i];
          if (!batch) continue;
          await uploadBatch(sid, batch);
          setUploadPct(Math.round(((i + 1) / batches.length) * 100));
        }

        // Optional pasted text — one more small batch
        if (pastedText.trim()) {
          const fd = new FormData();
          fd.append('text', pastedText.trim());
          const r = await fetch(
            `/api/mcp/ai/report-sessions/${encodeURIComponent(sid)}/files`,
            { method: 'POST', body: fd },
          );
          const j = await r.json();
          if (!j?.ok) throw new Error(j?.error ?? `paste HTTP ${r.status}`);
        }

        setPhase('processing');
        setProcessHint(
          `Extracting patient info + drafting critical report from ${files.length} files… this can take 1–5 minutes for large folders.`,
        );

        const result = await processSession(sid);
        onClose();
        router.push(
          `/reports/generate/${encodeURIComponent(result.session_id ?? sid)}`,
        );
      } else {
        // ---- Single-shot path (small uploads) ----
        setPhase('processing');
        setProcessHint(
          'AI extracting patient info + drafting critical report…',
        );
        const fd = new FormData();
        for (const f of files) fd.append('files', f.file, f.file.name);
        if (pastedText.trim()) fd.append('text', pastedText.trim());
        if (title.trim()) fd.append('title', title.trim());

        const ctl = new AbortController();
        const to = setTimeout(() => ctl.abort(), 240_000);
        let r: Response;
        try {
          r = await fetch('/api/mcp/ai/report-sessions', {
            method: 'POST',
            body: fd,
            signal: ctl.signal,
          });
        } catch (netErr) {
          clearTimeout(to);
          const name = (netErr as Error).name;
          if (name === 'AbortError') {
            throw new Error(
              'Request timed out. The AI may still finish — check the Reports list soon.',
            );
          }
          throw new Error(
            'Network error uploading the reports. Try with fewer files or paste the text directly.',
          );
        }
        clearTimeout(to);
        const j = await r.json();
        if (!j?.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
        onClose();
        router.push(`/reports/generate/${encodeURIComponent(j.session_id)}`);
      }
    } catch (e) {
      setErr(String((e as Error).message ?? e));
      setPhase('select');
    } finally {
      setBusy(false);
    }
  }, [
    files,
    pastedText,
    title,
    totalSize,
    useChunked,
    initSession,
    uploadBatch,
    processSession,
    onClose,
    router,
  ]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur"
      onClick={() => !busy && onClose()}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-fuchsia-400" />
            <div>
              <div className="text-sm font-bold text-slate-100">
                New blank report
              </div>
              <div className="text-[10px] text-slate-500">
                Upload individual reports OR a whole patient folder — AI
                extracts every detail, then drafts a focused critical-only
                report in the SAME STYLE.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            disabled={busy}
            className="rounded p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-40"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-slate-500">
              Optional report title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Follow-up review — 2026-07-08"
              className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
              disabled={busy}
              dir="auto"
            />
          </div>

          {/* Usage hint */}
          <div className="rounded border border-cyan-500/25 bg-cyan-500/5 p-2 text-[10px] text-cyan-200">
            <strong>What to upload:</strong> reports THIS patient brought
            (referrals · labs · prior imaging · discharge summaries · notes).
            Individual files OR a whole folder — supported types are auto-picked,
            other files (DICOM slices, images, etc.) are ignored.
          </div>

          {/* Two side-by-side buttons: files vs folder */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                pick(e.dataTransfer.files);
              }}
              disabled={busy}
              className="flex h-28 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-700 bg-slate-950/60 text-sm text-slate-500 transition hover:border-cyan-500/40 hover:text-cyan-300 disabled:opacity-40"
            >
              <Upload className="h-5 w-5" />
              <span className="text-xs font-bold">Pick individual files</span>
              <span className="text-[10px] text-slate-600">
                Drop or click · multiple OK
              </span>
            </button>

            <button
              type="button"
              onClick={() => folderRef.current?.click()}
              disabled={busy}
              className="flex h-28 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-700 bg-slate-950/60 text-sm text-slate-500 transition hover:border-fuchsia-500/40 hover:text-fuchsia-300 disabled:opacity-40"
            >
              <FolderUp className="h-5 w-5" />
              <span className="text-xs font-bold">Pick a whole folder</span>
              <span className="text-[10px] text-slate-600">
                Up to {MAX_FILES} files · {MAX_TOTAL_BYTES / 1024 / 1024}MB total
              </span>
            </button>
          </div>

          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".pdf,.txt,.md,.rtf,.doc,.docx,.png,.jpg,.jpeg,.webp"
            className="hidden"
            onChange={(e) => {
              pick(e.target.files);
              e.target.value = '';
            }}
          />
          <input
            ref={folderRef}
            type="file"
            // @ts-expect-error webkitdirectory is not in the standard HTML lib
            webkitdirectory=""
            directory=""
            multiple
            className="hidden"
            onChange={(e) => {
              pick(e.target.files);
              e.target.value = '';
            }}
          />

          {files.length > 0 && (
            <div className="space-y-1 rounded-xl border border-slate-800 bg-slate-950/60 p-2">
              <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest">
                <span className="text-slate-500">
                  {files.length}/{MAX_FILES} files · {(totalSize / 1024 / 1024).toFixed(1)}MB / {MAX_TOTAL_BYTES / 1024 / 1024}MB
                  {useChunked && (
                    <span className="ml-2 rounded bg-fuchsia-500/20 px-1.5 py-0.5 text-[9px] text-fuchsia-300">
                      chunked upload
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setFiles([]);
                    setWarn(null);
                  }}
                  disabled={busy}
                  className="text-[10px] font-normal text-slate-500 hover:text-rose-300 disabled:opacity-40"
                >
                  Clear all
                </button>
              </div>
              <div className="max-h-56 space-y-0.5 overflow-y-auto pr-1">
                {files.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between gap-2 rounded border border-slate-800 bg-slate-900/60 px-2 py-1 text-xs"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                      <span className="truncate text-slate-300" title={f.relPath ?? f.file.name}>
                        {f.relPath ?? f.file.name}
                      </span>
                      <span className="shrink-0 text-[10px] text-slate-600">
                        {(f.file.size / 1024).toFixed(0)}KB
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setFiles((prev) => prev.filter((p) => p.id !== f.id))
                      }
                      disabled={busy}
                      className="rounded p-1 text-slate-500 hover:bg-rose-500/20 hover:text-rose-300 disabled:opacity-40"
                      title="Remove"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Or paste text */}
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-slate-500">
              Or paste report text (adds one more source)
            </label>
            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              rows={3}
              dir="auto"
              disabled={busy}
              placeholder="Paste any medical text — patient identity, prior findings, symptoms, medications, etc."
              className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none disabled:opacity-40"
            />
          </div>

          {warn && !err && (
            <div className="flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{warn}</span>
            </div>
          )}
          {err && (
            <div className="flex items-start gap-2 rounded border border-rose-500/40 bg-rose-500/10 p-2 text-[11px] text-rose-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{err}</span>
            </div>
          )}

          {busy && (
            <div className="rounded border border-cyan-500/30 bg-cyan-500/5 p-3 text-[11px] text-cyan-200">
              <div className="mb-1 flex items-center gap-2 font-bold">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {phase === 'uploading' && `Uploading files… ${uploadPct}%`}
                {phase === 'processing' && 'AI processing…'}
                {phase === 'appending' && 'Adding files to session…'}
              </div>
              {phase === 'uploading' && (
                <div className="h-1.5 w-full overflow-hidden rounded bg-slate-800">
                  <div
                    className="h-full bg-gradient-to-r from-fuchsia-500 to-cyan-500 transition-all"
                    style={{ width: `${uploadPct}%` }}
                  />
                </div>
              )}
              <div className="mt-1 text-[10px] text-slate-400">
                {processHint}
              </div>
              <div className="mt-1 text-[10px] text-slate-500">
                Keep this dialog open. It's safe to switch tabs; don't reload.
              </div>
            </div>
          )}
        </div>

        {/* footer */}
        <div className="flex items-center justify-between gap-2 border-t border-slate-800 bg-slate-950 px-4 py-3">
          <div className="text-[10px] text-slate-500">
            {useChunked ? (
              <>
                <span className="font-bold text-fuchsia-300">Chunked upload:</span>{' '}
                files sent in batches of {CHUNK_BATCH_SIZE}, AI processes
                {' '}the combined set once done.
              </>
            ) : (
              'Fast path: single upload → AI extracts + drafts critical report.'
            )}
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={busy || (files.length === 0 && !pastedText.trim())}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-fuchsia-500 to-cyan-500 px-4 py-2 text-sm font-bold text-slate-950 hover:from-fuchsia-400 hover:to-cyan-400 disabled:opacity-40"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Generate report
          </button>
        </div>
      </div>
    </div>
  );
}
