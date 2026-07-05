'use client';

import { X } from 'lucide-react';

const SHORTCUTS: { key: string; label: string; group: string }[] = [
  { key: 'j', label: 'Next slice', group: 'Navigation' },
  { key: 'k', label: 'Previous slice', group: 'Navigation' },
  { key: 'shift+j', label: 'Next case', group: 'Navigation' },
  { key: 'shift+k', label: 'Previous case', group: 'Navigation' },
  { key: 'l', label: 'Toggle worklist', group: 'Navigation' },
  { key: 's', label: 'Sign', group: 'Actions' },
  { key: 'w', label: 'Send via WhatsApp', group: 'Actions' },
  { key: 'space', label: 'Hold to dictate', group: 'Actions' },
  { key: '.brainok', label: 'CT brain normal template', group: 'Snippets' },
  { key: '.chestok', label: 'CT chest normal template', group: 'Snippets' },
  { key: '.impok', label: 'Impression: normal', group: 'Snippets' },
  { key: '.rmri', label: 'Rec: MRI follow-up', group: 'Snippets' },
  { key: '?', label: 'This help', group: 'Help' },
];

export function HelpOverlay({ onClose }: { onClose: () => void }) {
  const groups = Array.from(new Set(SHORTCUTS.map((s) => s.group)));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-200">Keyboard shortcuts</h2>
            <p className="text-[11px] text-slate-500">Built for speed — no mouse needed</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-800 p-1.5 text-slate-500 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {groups.map((g) => (
            <div key={g}>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-cyan-400">
                {g}
              </div>
              <div className="space-y-1">
                {SHORTCUTS.filter((s) => s.group === g).map((s) => (
                  <div
                    key={s.key}
                    className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-1.5"
                  >
                    <span className="text-xs text-slate-300">{s.label}</span>
                    <kbd className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300">
                      {s.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
