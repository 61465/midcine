'use client';

import { useEffect, useState } from 'react';
import { Send, Loader2, Plus, Trash2, Star, Check } from 'lucide-react';
import {
  loadReferrers,
  addReferrer,
  removeReferrer,
  updateReferrer,
  getRecentReferrerIds,
  setRecentReferrerIds,
  type Referrer,
} from '../../../lib/referrers';
import { sendReportOnWhatsApp, type FinalReport } from '../../../lib/report';

interface Props {
  report: FinalReport;
  onClose: () => void;
  onSent?: (successCount: number, total: number) => void;
}

interface SendResult {
  referrerId: string;
  ok: boolean;
  error?: string;
}

export function SendDialog({ report, onClose, onSent }: Props) {
  const [referrers, setReferrers] = useState<Referrer[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<SendResult[] | null>(null);

  // Draft for new referrer
  const [draftName, setDraftName] = useState('');
  const [draftPhone, setDraftPhone] = useState('');
  const [draftSpecialty, setDraftSpecialty] = useState('');

  useEffect(() => {
    const list = loadReferrers();
    setReferrers(list);
    // Pre-select recent + favorites
    const recentIds = new Set(getRecentReferrerIds());
    const favIds = list.filter((r) => r.favorite).map((r) => r.id);
    const preselect = new Set(
      [...recentIds, ...favIds].filter((id) => list.some((r) => r.id === id)),
    );
    setSelected(preselect);
    if (list.length === 0) setShowAdd(true);
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function saveDraft() {
    if (!draftName || !draftPhone) return;
    const created = addReferrer({
      name: draftName,
      phone: draftPhone,
      specialty: draftSpecialty || undefined,
    });
    setReferrers(loadReferrers());
    setSelected((prev) => new Set([...prev, created.id]));
    setDraftName('');
    setDraftPhone('');
    setDraftSpecialty('');
    setShowAdd(false);
  }

  async function sendAll() {
    const targets = referrers.filter((r) => selected.has(r.id));
    if (targets.length === 0) return;
    setSending(true);
    setResults(null);

    // Send in parallel; each call is independent
    const settled = await Promise.allSettled(
      targets.map((r) => sendReportOnWhatsApp(report, r.phone, r.name, 'report_to_doctor')),
    );
    const out: SendResult[] = targets.map((r, i) => {
      const s = settled[i];
      if (s?.status === 'fulfilled') return { referrerId: r.id, ok: true };
      return {
        referrerId: r.id,
        ok: false,
        error: String(s?.status === 'rejected' ? s.reason : 'unknown'),
      };
    });
    setResults(out);
    setSending(false);
    setRecentReferrerIds(Array.from(selected));

    const successCount = out.filter((r) => r.ok).length;
    onSent?.(successCount, targets.length);
    // Auto-close after 1.5s if all succeeded
    if (successCount === targets.length) setTimeout(onClose, 1500);
  }

  const selectedCount = selected.size;
  const allResultsOk = results?.every((r) => r.ok);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-slate-200">Send report</h3>
          </div>
          <div className="text-[10px] text-slate-500">
            {selectedCount} selected · {referrers.length} in directory
          </div>
        </div>

        {/* Referrers list */}
        <div className="max-h-72 overflow-y-auto p-2">
          {referrers.length === 0 && !showAdd && (
            <div className="p-6 text-center text-xs text-slate-500">
              No referrers yet. Add one below.
            </div>
          )}
          {referrers.map((r) => (
            <div
              key={r.id}
              className={
                'group flex items-center gap-2 rounded-lg px-2 py-2 transition ' +
                (selected.has(r.id) ? 'bg-cyan-500/5' : 'hover:bg-slate-800/60')
              }
            >
              <button
                type="button"
                onClick={() => toggle(r.id)}
                className={
                  'flex h-5 w-5 items-center justify-center rounded border transition ' +
                  (selected.has(r.id)
                    ? 'border-cyan-500 bg-cyan-500 text-slate-950'
                    : 'border-slate-600 hover:border-cyan-400')
                }
                aria-label={selected.has(r.id) ? 'Deselect' : 'Select'}
              >
                {selected.has(r.id) && <Check className="h-3 w-3" strokeWidth={3} />}
              </button>
              <button
                type="button"
                onClick={() => toggle(r.id)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-xs font-bold text-slate-200">{r.name}</span>
                  {r.favorite && <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />}
                </div>
                <div className="text-[10px] text-slate-500">
                  {r.phone}
                  {r.specialty && ` · ${r.specialty}`}
                </div>
              </button>
              <button
                type="button"
                onClick={() => updateReferrer(r.id, { favorite: !r.favorite })}
                className="hidden rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-amber-400 group-hover:block"
                title="Toggle favorite"
              >
                <Star
                  className={'h-3 w-3 ' + (r.favorite ? 'fill-amber-400 text-amber-400' : '')}
                />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Remove ${r.name}?`)) {
                    removeReferrer(r.id);
                    setReferrers(loadReferrers());
                    setSelected((prev) => {
                      const next = new Set(prev);
                      next.delete(r.id);
                      return next;
                    });
                  }
                }}
                className="hidden rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-rose-400 group-hover:block"
                title="Remove"
              >
                <Trash2 className="h-3 w-3" />
              </button>
              {results && (
                <span
                  className={
                    'text-[10px] font-bold ' +
                    (results.find((x) => x.referrerId === r.id)?.ok
                      ? 'text-emerald-400'
                      : 'text-rose-400')
                  }
                >
                  {results.find((x) => x.referrerId === r.id)?.ok ? 'sent' : 'failed'}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Add-new form */}
        {showAdd ? (
          <div className="space-y-2 border-t border-slate-800 p-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">
              New referrer
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Dr. Full Name"
                className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
              />
              <input
                value={draftPhone}
                onChange={(e) => setDraftPhone(e.target.value)}
                placeholder="+201002233445"
                className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
              />
              <input
                value={draftSpecialty}
                onChange={(e) => setDraftSpecialty(e.target.value)}
                placeholder="Cardiology (optional)"
                className="col-span-2 rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-400 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveDraft}
                disabled={!draftName || !draftPhone}
                className="flex-1 rounded-lg bg-cyan-500/20 py-1 text-xs font-bold text-cyan-300 hover:bg-cyan-500/30 disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="flex w-full items-center justify-center gap-1.5 border-t border-slate-800 px-4 py-2 text-xs text-slate-500 hover:bg-slate-800/40 hover:text-cyan-300"
          >
            <Plus className="h-3 w-3" />
            Add referrer
          </button>
        )}

        {/* Footer actions */}
        <div className="flex items-center gap-2 border-t border-slate-800 bg-slate-950/50 p-3">
          {results && (
            <div
              className={'flex-1 text-xs ' + (allResultsOk ? 'text-emerald-400' : 'text-amber-400')}
            >
              {results.filter((r) => r.ok).length} of {results.length} sent
            </div>
          )}
          {!results && <div className="flex-1" />}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800"
          >
            Close
          </button>
          <button
            type="button"
            onClick={sendAll}
            disabled={sending || selectedCount === 0}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-40"
          >
            {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            {sending ? 'Sending…' : `Send to ${selectedCount}`}
          </button>
        </div>
      </div>
    </div>
  );
}
