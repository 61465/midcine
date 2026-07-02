'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Info, Loader2, Search, Box, Copy, Check, Sparkles } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Sketchfab Anatomy Viewer — free replacement for BioDigital.
//
// Why Sketchfab:
//   - No API key needed for public models
//   - No domain whitelist
//   - Thousands of free anatomy models (Z-Anatomy, NIH 3D, community)
//   - Embed URL is `https://sketchfab.com/models/{UUID}/embed`
//
// Workflow:
//   1. Search Sketchfab in a new tab → copy the model UUID (from the URL)
//   2. Paste UUID into the input below → embeds immediately
//   3. Or pre-populate NEXT_PUBLIC_SKETCHFAB_UUIDS in env (JSON array)
//   4. Recent UUIDs saved to localStorage for quick recall
// ─────────────────────────────────────────────────────────────────────────────

// The component name/export stays "BioDigitalEmbed" to avoid touching every
// consumer in anatomy-lab.tsx; internally this is now Sketchfab-powered.

const ENV_UUIDS =
  typeof process !== 'undefined' ? (process.env.NEXT_PUBLIC_SKETCHFAB_UUIDS ?? '') : '';

type Preset = { uuid: string; label: string };

function loadPresets(): Preset[] {
  try {
    if (!ENV_UUIDS) return [];
    const parsed = JSON.parse(ENV_UUIDS) as Preset[];
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return [];
}

// Sanitize any input the user might paste — full URL, UUID, or model page URL.
function extractUuid(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  // Bare 32-char alphanumeric (typical UUID without dashes)
  const bare = s.match(/^[a-f0-9]{20,40}$/i);
  if (bare) return bare[0];
  // /models/<slug>-<UUID> in URL
  const match = s.match(/models\/([a-f0-9]{20,40})/i) || s.match(/-([a-f0-9]{20,40})(?:\/|\?|$)/i);
  if (match) return match[1] ?? null;
  return null;
}

function buildEmbed(uuid: string) {
  const params = new URLSearchParams({
    autostart: '1',
    ui_infos: '0',
    ui_watermark: '0',
    ui_stop: '0',
    ui_help: '1',
    ui_settings: '1',
    ui_annotations: '1',
    transparent: '0',
  });
  return `https://sketchfab.com/models/${uuid}/embed?${params.toString()}`;
}

const STORAGE_KEY = 'midcine.sketchfab.recent';

function loadRecent(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as string[];
    return Array.isArray(arr) ? arr.slice(0, 5) : [];
  } catch {
    return [];
  }
}

function saveRecent(uuid: string) {
  if (typeof window === 'undefined') return;
  try {
    const cur = loadRecent();
    const next = [uuid, ...cur.filter((u) => u !== uuid)].slice(0, 5);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
}

const SEARCH_SHORTCUTS = [
  { q: 'z-anatomy', label: 'Z-Anatomy (مكتبة كاملة)' },
  { q: 'human heart anatomy', label: 'قلب' },
  { q: 'human lungs anatomy', label: 'رئتين' },
  { q: 'human brain anatomy', label: 'دماغ' },
  { q: 'human kidney anatomy', label: 'كليتين' },
  { q: 'human skeleton anatomy', label: 'هيكل عظمي' },
];

type State = 'idle' | 'loading' | 'ready';

export function BioDigitalEmbed({ compact = false }: { compact?: boolean }) {
  const presets = loadPresets();
  const [uuid, setUuid] = useState<string>(presets[0]?.uuid ?? '');
  const [input, setInput] = useState<string>('');
  const [recent, setRecent] = useState<string[]>([]);
  const [state, setState] = useState<State>('idle');
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  useEffect(() => {
    setRecent(loadRecent());
  }, []);

  useEffect(() => {
    if (!uuid) {
      setState('idle');
      return;
    }
    setState('loading');
    saveRecent(uuid);
    setRecent(loadRecent());
  }, [uuid]);

  function applyInput() {
    const parsed = extractUuid(input);
    if (parsed) {
      setUuid(parsed);
      setInput('');
    }
  }

  function copyUrl(u: string) {
    try {
      navigator.clipboard?.writeText(u);
      setCopiedUrl(u);
      setTimeout(() => setCopiedUrl(null), 1500);
    } catch {}
  }

  return (
    <div className="flex h-full w-full flex-col bg-slate-900 text-slate-100">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-slate-700 bg-slate-800 px-3 py-1.5">
        <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
        <span className="text-xs font-semibold">Sketchfab Anatomy</span>
        <span className="ltr-only rounded bg-emerald-600/30 px-2 py-0.5 text-[9px] font-bold text-emerald-300">
          free
        </span>
        <div className="flex-1" />
        <a
          href="https://sketchfab.com/search?type=models&features=downloadable&q=anatomy"
          target="_blank"
          rel="noopener"
          className="ltr-only flex items-center gap-1 text-[10px] text-slate-400 hover:text-white"
        >
          browse Sketchfab <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* UUID entry — only when no active viewer or in compact expand */}
      {(!uuid || !compact) && (
        <div className="border-b border-slate-700 bg-slate-800/60 px-3 py-2">
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applyInput()}
                placeholder="الصق UUID أو رابط النموذج من Sketchfab…"
                className="ltr-only w-full rounded border border-slate-600 bg-slate-950 px-2 py-1 text-[11px] text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={applyInput}
              disabled={!extractUuid(input)}
              className="rounded bg-cyan-600 px-3 py-1 text-[10px] font-bold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              عرض
            </button>
          </div>

          {/* Search shortcuts */}
          {!compact && (
            <div className="mt-2">
              <div className="mb-1 flex items-center gap-1 text-[9px] uppercase tracking-wider text-slate-500">
                <Search className="h-2.5 w-2.5" /> ابحث في Sketchfab
              </div>
              <div className="flex flex-wrap gap-1">
                {SEARCH_SHORTCUTS.map((s) => (
                  <a
                    key={s.q}
                    href={`https://sketchfab.com/search?type=models&q=${encodeURIComponent(s.q)}`}
                    target="_blank"
                    rel="noopener"
                    className="rounded bg-slate-700 px-2 py-0.5 text-[10px] text-slate-200 transition hover:bg-slate-600 hover:text-cyan-300"
                  >
                    {s.label}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Env presets */}
          {presets.length > 0 && (
            <div className="mt-2">
              <div className="mb-1 text-[9px] uppercase tracking-wider text-slate-500">جاهزة</div>
              <div className="flex flex-wrap gap-1">
                {presets.map((p) => (
                  <button
                    key={p.uuid}
                    type="button"
                    onClick={() => setUuid(p.uuid)}
                    className={
                      'rounded px-2 py-0.5 text-[10px] transition ' +
                      (p.uuid === uuid
                        ? 'bg-cyan-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600')
                    }
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Recent from localStorage */}
          {recent.length > 0 && (
            <div className="mt-2">
              <div className="mb-1 text-[9px] uppercase tracking-wider text-slate-500">
                نماذج حديثة
              </div>
              <div className="flex flex-wrap gap-1">
                {recent.map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUuid(u)}
                    className={
                      'ltr-only flex items-center gap-1 rounded px-2 py-0.5 text-[10px] transition ' +
                      (u === uuid
                        ? 'bg-cyan-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600')
                    }
                    title={u}
                  >
                    <Box className="h-2.5 w-2.5" />
                    {u.slice(0, 6)}…{u.slice(-4)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Viewer */}
      <div className="relative min-h-0 flex-1 bg-slate-950">
        {!uuid && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <Box className="h-10 w-10 text-cyan-500/60" />
            <div className="text-sm font-bold text-slate-200">اختر نموذج تشريح من Sketchfab</div>
            <p className="max-w-md text-xs leading-relaxed text-slate-400">
              افتح أحد روابط البحث بالأعلى، تصفّح Sketchfab، انسخ رابط النموذج (أو الـ UUID)، والصقه
              في الحقل. الآلاف من نماذج التشريح المجانية متاحة عبر Z-Anatomy وغيرها.
            </p>
            <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3 text-right text-[10px] leading-relaxed text-slate-400">
              <div className="mb-1 font-bold text-cyan-400">مثال:</div>
              <div className="ltr-only">
                رابط:{' '}
                <code className="rounded bg-slate-950 px-1">
                  sketchfab.com/models/<span className="text-cyan-300">6e0c1e...</span>
                </code>
              </div>
              <div className="mt-1">→ يمكنك لصق الرابط كاملاً، سنستخرج UUID تلقائياً.</div>
            </div>
          </div>
        )}

        {uuid && (
          <>
            <iframe
              key={uuid}
              src={buildEmbed(uuid)}
              onLoad={() => setState('ready')}
              className="absolute inset-0 h-full w-full border-0 bg-slate-950"
              title="Sketchfab Anatomy Model"
              allow="autoplay; fullscreen; xr-spatial-tracking; accelerometer; gyroscope"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
            {state === 'loading' && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/60 text-slate-300">
                <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
                <div className="text-xs">تحميل النموذج…</div>
              </div>
            )}
            {state === 'ready' && (
              <button
                type="button"
                onClick={() => copyUrl(`https://sketchfab.com/models/${uuid}`)}
                className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded bg-slate-900/80 px-2 py-1 text-[10px] text-slate-300 backdrop-blur transition hover:bg-slate-800"
                title="نسخ رابط النموذج"
              >
                {copiedUrl ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-400" /> نُسخ
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" /> رابط
                  </>
                )}
              </button>
            )}
          </>
        )}
      </div>

      {!compact && uuid && (
        <div className="flex items-start gap-2 border-t border-slate-700 bg-slate-800 px-3 py-2 text-[10px] text-slate-400">
          <Info className="mt-0.5 h-3 w-3 flex-shrink-0" />
          <span>
            نماذج Sketchfab تدعم دوران، تكبير، annotation. للحصول على نماذج قابلة للتنزيل (glTF/OBJ)
            لدمج overlays مرضية داخل midcine viewer، ابحث بفلتر{' '}
            <span className="ltr-only rounded bg-slate-950 px-1">features=downloadable</span>.
          </span>
        </div>
      )}
    </div>
  );
}
