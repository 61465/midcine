'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';

// Hold-to-talk voice dictation overlay.
// Hold spacebar (when not in input) OR click mic → records audio → sends to
// /api/mcp/voice/transcribe → returns Arabic text → dispatches to caller.
//
// Uses MediaRecorder + browser MediaStream. Falls back gracefully if the
// browser doesn't support it or mic permission denied.

type State = 'idle' | 'requesting' | 'recording' | 'transcribing' | 'error';

export function VoiceDictate({ onText }: { onText: (text: string) => void }) {
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  async function start() {
    setError(null);
    setState('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Level meter for visualisation
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      analyserRef.current = analyser;
      const buf = new Uint8Array(analyser.frequencyBinCount);

      function tick() {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i]!;
        setLevel(Math.min(1, sum / buf.length / 128));
        rafRef.current = requestAnimationFrame(tick);
      }
      tick();

      const rec = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      recorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        void finalize();
      };
      rec.start();
      setState('recording');
    } catch (e) {
      setError(String(e));
      setState('error');
    }
  }

  async function stop() {
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    analyserRef.current = null;
  }

  async function finalize() {
    setState('transcribing');
    try {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      const fd = new FormData();
      fd.append('audio', blob, 'clip.webm');
      const r = await fetch('/api/mcp/voice/transcribe', { method: 'POST', body: fd });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(`transcribe ${r.status}: ${t.slice(0, 200)}`);
      }
      const data = (await r.json()) as { text: string; ok: boolean };
      if (data.text) onText(data.text);
      setState('idle');
    } catch (e) {
      setError(String(e));
      setState('error');
      setTimeout(() => setState('idle'), 2000);
    }
  }

  // Spacebar hold-to-talk when not focused in input
  useEffect(() => {
    function down(e: KeyboardEvent) {
      if (e.code !== 'Space') return;
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
      if (e.repeat) return;
      if (state === 'idle') {
        e.preventDefault();
        void start();
      }
    }
    function up(e: KeyboardEvent) {
      if (e.code !== 'Space') return;
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
      if (state === 'recording') {
        e.preventDefault();
        void stop();
      }
    }
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [state]);

  return (
    <>
      {/* Floating mic button */}
      <button
        type="button"
        onMouseDown={() => state === 'idle' && start()}
        onMouseUp={() => state === 'recording' && stop()}
        onMouseLeave={() => state === 'recording' && stop()}
        className={
          'fixed bottom-6 left-1/2 z-40 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full border-2 shadow-lg transition ' +
          (state === 'recording'
            ? 'animate-pulse border-rose-400 bg-rose-500/20 text-rose-300'
            : state === 'transcribing'
              ? 'border-cyan-500 bg-cyan-500/20 text-cyan-300'
              : state === 'error'
                ? 'border-rose-500 bg-rose-500/10 text-rose-400'
                : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-cyan-500 hover:text-cyan-300')
        }
        title="اضغط أو استمر بضغط Space للإملاء"
      >
        {state === 'transcribing' ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : state === 'recording' ? (
          <MicOff className="h-6 w-6" />
        ) : (
          <Mic className="h-6 w-6" />
        )}
      </button>

      {/* Recording overlay */}
      {state === 'recording' && (
        <div className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-full border border-rose-500/40 bg-rose-500/10 px-4 py-1.5 text-xs text-rose-200 backdrop-blur">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-rose-400" />
            جارٍ التسجيل…
            <div className="ltr-only h-1 w-24 overflow-hidden rounded-full bg-rose-950">
              <div
                className="h-full bg-rose-400 transition-[width]"
                style={{ width: `${Math.round(level * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {state === 'error' && error && (
        <div className="fixed bottom-24 left-1/2 z-40 max-w-md -translate-x-1/2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-xs text-rose-200 backdrop-blur">
          {error.slice(0, 180)}
        </div>
      )}
    </>
  );
}
