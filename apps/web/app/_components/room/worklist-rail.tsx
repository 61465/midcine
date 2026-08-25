'use client';

import { useCallback, useEffect, useState } from 'react';
import { deleteStudy, fetchStudies, type Study } from '../../../lib/studies';
import {
  AlertTriangle,
  Clock,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { AddCaseDialog } from './add-case-dialog';

const PRIORITY_COLOR: Record<string, string> = {
  P1: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
  P2: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  P3: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
  P4: 'text-slate-400 bg-slate-800 border-slate-700',
  P5: 'text-slate-500 bg-slate-800 border-slate-700',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'Reading',
  read: 'Read',
  signed: 'Signed',
};

function timeAgo(iso: string): string {
  if (!iso) return '—';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 0) return 'sched';
  if (diff < 60) return `${diff}m`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

interface Props {
  activeStudyUid: string | null;
  onSelect: (uid: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onCountChange?: (count: number) => void;
}

export function WorklistRail({
  activeStudyUid,
  onSelect,
  collapsed,
  onToggleCollapsed,
  onCountChange,
}: Props) {
  const [studies, setStudies] = useState<Study[] | null>(null);
  const [filter, setFilter] = useState<'all' | 'urgent' | 'pending'>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const all = await fetchStudies();
      setStudies(all);
      onCountChange?.(all.length);
    } catch {
      setStudies([]);
      onCountChange?.(0);
    } finally {
      setRefreshing(false);
    }
  }, [onCountChange]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const remove = useCallback(
    async (uid: string) => {
      if (!confirm('Delete this study? DICOM and JSON will be removed.')) return;
      const ok = await deleteStudy(uid);
      if (ok) await refresh();
    },
    [refresh],
  );

  // Bulk selection state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const toggleSelect = (uid: string) => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());
  const bulkDelete = useCallback(async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} studies? This cannot be undone.`)) return;
    for (const uid of selected) await deleteStudy(uid);
    clearSelection();
    await refresh();
  }, [selected, refresh]);

  const rows = (studies ?? []).filter((s) => {
    if (filter === 'urgent') return s.priority === 'P1' || s.priority === 'P2';
    if (filter === 'pending') return s.status === 'pending' || s.status === 'in_progress';
    return true;
  });

  const urgentCount = (studies ?? []).filter(
    (s) => s.priority === 'P1' || s.priority === 'P2',
  ).length;

  if (collapsed) {
    return (
      <div className="flex h-full w-12 flex-col items-center border-l border-slate-800 bg-slate-950 py-3">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="mb-4 rounded p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
          title="Show worklist"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {urgentCount > 0 && (
          <div className="flex flex-col items-center gap-1 rounded bg-rose-500/10 px-1 py-2 text-rose-400">
            <AlertTriangle className="h-3 w-3 animate-pulse" />
            <span className="ltr-only text-[10px] font-bold">{urgentCount}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <aside className="flex h-full w-72 flex-col border-l border-slate-800 bg-slate-950">
      {showAdd && (
        <AddCaseDialog
          onClose={() => setShowAdd(false)}
          onCreated={(uid) => {
            setShowAdd(false);
            void refresh().then(() => onSelect(uid));
          }}
        />
      )}
      {/* Rail header */}
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-slate-500">Worklist</div>
          <div className="text-sm font-bold text-slate-200">
            {rows.length}
            <span className="ml-1 font-normal text-slate-500">of {studies?.length ?? 0}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setBulkOpen((v) => !v)}
            className={
              'rounded px-2 py-1 text-[10px] ' +
              (bulkOpen
                ? 'bg-fuchsia-500 text-slate-950'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700')
            }
            title="Bulk operations"
          >
            {bulkOpen ? 'Bulk' : '☑'}
          </button>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1 rounded bg-cyan-500 px-2 py-1 text-[10px] font-bold text-slate-950 hover:bg-cyan-400"
            title="Add case"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            className={
              'rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200 ' +
              (refreshing ? 'animate-spin text-cyan-400' : '')
            }
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
            title="Collapse"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-slate-800 p-2">
        {(
          [
            { id: 'all', label: 'All' },
            { id: 'urgent', label: `Urgent${urgentCount ? ` (${urgentCount})` : ''}` },
            { id: 'pending', label: 'Pending' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setFilter(t.id as any)}
            className={
              'flex-1 rounded px-2 py-1 text-xs transition ' +
              (filter === t.id
                ? 'bg-cyan-500/10 text-cyan-300'
                : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300')
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto">
        {studies === null && (
          <div className="p-4 text-center text-xs text-slate-500">Loading…</div>
        )}
        {studies !== null && (studies.length ?? 0) === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <div className="text-3xl">📥</div>
            <div className="text-xs text-slate-400">No cases yet</div>
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="mt-2 flex items-center gap-1 rounded bg-cyan-500 px-3 py-1.5 text-[11px] font-bold text-slate-950 hover:bg-cyan-400"
            >
              <Plus className="h-3 w-3" />
              Add first case
            </button>
          </div>
        )}
        {studies !== null && studies.length > 0 && rows.length === 0 && (
          <div className="p-6 text-center text-xs text-slate-500">No matches for this filter</div>
        )}
        {bulkOpen && selected.size > 0 && (
          <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-fuchsia-500/40 bg-fuchsia-500/10 px-3 py-1.5 text-[10px] text-fuchsia-200">
            <span className="font-bold">{selected.size} selected</span>
            <button
              type="button"
              onClick={() => void bulkDelete()}
              className="rounded bg-rose-500/40 px-2 py-0.5 text-rose-100 hover:bg-rose-500/60"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="ml-auto rounded bg-slate-800 px-2 py-0.5 hover:bg-slate-700"
            >
              Clear
            </button>
          </div>
        )}
        {rows.map((s) => (
          <div
            key={s.study_uid}
            className={
              'group relative block w-full border-b border-slate-900 transition ' +
              (activeStudyUid === s.study_uid
                ? 'border-l-2 border-l-cyan-400 bg-cyan-500/5'
                : 'hover:bg-slate-900')
            }
          >
            {bulkOpen && (
              <input
                type="checkbox"
                checked={selected.has(s.study_uid)}
                onChange={() => toggleSelect(s.study_uid)}
                onClick={(e) => e.stopPropagation()}
                className="absolute left-2 top-3 z-10 h-3 w-3 accent-fuchsia-500"
              />
            )}
            <button
              type="button"
              onClick={() => onSelect(s.study_uid)}
              className={'block w-full px-3 py-2.5 text-left ' + (bulkOpen ? 'pl-7' : '')}
            >
              <div className="mb-1 flex items-center gap-2">
                <span
                  className={`rounded border px-1.5 py-0.5 text-[9px] font-bold ${
                    PRIORITY_COLOR[s.priority] ?? 'text-slate-500'
                  }`}
                >
                  {s.priority}
                </span>
                <span className="truncate text-xs font-bold text-slate-200">
                  {s.patient_name || '—'}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-500">
                <span>
                  {s.modality} · {s.body_part}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" />
                  {timeAgo(s.study_date)}
                </span>
              </div>
              {s.status !== 'pending' && (
                <div className="mt-1 text-[10px] text-slate-600">
                  {STATUS_LABEL[s.status] ?? s.status}
                </div>
              )}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void remove(s.study_uid);
              }}
              className="absolute right-2 top-2 hidden rounded p-1 text-slate-600 hover:bg-rose-500/20 hover:text-rose-400 group-hover:block"
              title="Delete"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
