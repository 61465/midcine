'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, ChevronsUpDown } from 'lucide-react';
import { parseCommand, listCommands, type ParsedCommand } from '../../../lib/voice-commands';

interface Props {
  onCommand: (cmd: ParsedCommand) => void;
}

/**
 * Hands-free voice command listener (SpeechRecognition — browser-native).
 * Separate from VoiceDictate (which sends audio to whisper for text).
 * This one just listens for wake word + short commands and fires callbacks.
 *
 * Only shown when the browser supports SpeechRecognition (Chrome/Edge, not Firefox/Safari).
 */
export function VoiceCommands({ onCommand }: Props) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [lastHeard, setLastHeard] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const Ctor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (Ctor) setSupported(true);
  }, []);

  function start() {
    const Ctor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = false;
    // Recognize both English and Arabic
    rec.lang = 'en-US';
    rec.onresult = (event: any) => {
      const idx = event.resultIndex ?? 0;
      const text = (event.results[idx]?.[0]?.transcript ?? '').trim();
      if (!text) return;
      setLastHeard(text);
      const cmd = parseCommand(text);
      if (cmd) {
        onCommand(cmd);
        window.dispatchEvent(
          new CustomEvent('midcine:toast', {
            detail: { text: `🎙️ ${cmd.intent}${cmd.params?.to ? ` → ${cmd.params.to}` : ''}` },
          }),
        );
      }
    };
    rec.onerror = (e: any) => {
      console.warn('[VoiceCommands] error:', e?.error);
    };
    rec.onend = () => {
      // Auto-restart while listening
      if (recognitionRef.current === rec) {
        try {
          rec.start();
        } catch {}
      }
    };
    recognitionRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch (e) {
      console.warn('[VoiceCommands] start failed:', e);
    }
  }

  function stop() {
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    try {
      rec?.stop?.();
    } catch {}
    setListening(false);
    setLastHeard(null);
  }

  if (!supported) return null;

  return (
    <>
      {/* Compact toggle at bottom-right of the reading room */}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
        {lastHeard && listening && (
          <div className="rounded-full border border-cyan-500/40 bg-slate-950/90 px-3 py-1 font-mono text-[10px] text-cyan-200 backdrop-blur">
            🎙️ {lastHeard.slice(0, 60)}
          </div>
        )}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowHelp((v) => !v)}
            className="rounded-full border border-slate-700 bg-slate-900 p-2 text-slate-400 hover:text-cyan-300"
            title="Show voice commands"
          >
            <ChevronsUpDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => (listening ? stop() : start())}
            className={
              'flex items-center gap-1.5 rounded-full border-2 px-3 py-2 text-xs font-bold shadow-lg transition ' +
              (listening
                ? 'border-cyan-400 bg-cyan-500/20 text-cyan-300'
                : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-cyan-500 hover:text-cyan-300')
            }
            title={
              listening
                ? 'Voice commands ON — say "midcine next case"'
                : 'Turn ON voice commands'
            }
          >
            {listening ? <Mic className="h-3.5 w-3.5 animate-pulse" /> : <MicOff className="h-3.5 w-3.5" />}
            {listening ? 'Voice ON' : 'Voice'}
          </button>
        </div>
      </div>

      {showHelp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
              <Mic className="h-4 w-4 text-cyan-400" />
              Voice commands
            </h2>
            <p className="mb-4 text-[11px] text-slate-400">
              Turn ON voice mode, then say any of these. Prefix with{' '}
              <span className="rounded bg-slate-800 px-1 font-mono text-cyan-300">midcine</span>{' '}
              for reliability in noisy rooms. Arabic and English both work.
            </p>
            <div className="space-y-1.5">
              {listCommands().map((c) => (
                <div
                  key={c.intent}
                  className="grid grid-cols-3 gap-2 rounded border border-slate-800 bg-slate-900/40 p-2 text-[11px]"
                >
                  <code className="text-cyan-300">"{c.example}"</code>
                  <span className="text-slate-500">{c.description}</span>
                  <span className="text-right font-mono text-[9px] text-slate-600">
                    {c.intent}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                className="rounded bg-cyan-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-cyan-400"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
