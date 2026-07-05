'use client';

import { useEffect, useState } from 'react';
import { fetchStudies, type Study } from '../../../lib/studies';
import { AlertTriangle, Clock, ChevronLeft, ChevronRight } from 'lucide-react';

const PRIORITY_COLOR: Record<string, string> = {
  P1: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
  P2: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  P3: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
  P4: 'text-slate-400 bg-slate-800 border-slate-700',
  P5: 'text-slate-500 bg-slate-800 border-slate-700',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'قيد الانتظار',
  in_progress: 'قيد القراءة',
  read: 'مقروء',
  signed: 'موقّع',
};

function timeAgo(iso: string): string {
  if (!iso) return '—';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 0) return 'مجدول';
  if (diff < 60) return `${diff}د`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h}س`;
  const d = Math.floor(h / 24);
  return `${d}ي`;
}

interface Props {
  activeStudyUid: string | null;
  onSelect: (uid: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function WorklistRail({ activeStudyUid, onSelect, collapsed, onToggleCollapsed }: Props) {
  const [studies, setStudies] = useState<Study[] | null>(null);
  const [filter, setFilter] = useState<'all' | 'urgent' | 'pending'>('all');

  useEffect(() => {
    void fetchStudies()
      .then(setStudies)
      .catch(() => setStudies([]));
  }, []);

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
          title="عرض القائمة"
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
      {/* Rail header */}
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-slate-500">قائمة العمل</div>
          <div className="text-sm font-bold text-slate-200">
            {rows.length}{' '}
            <span className="font-normal text-slate-500">من {studies?.length ?? 0}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-slate-800 p-2">
        {(
          [
            { id: 'all', label: 'الكل' },
            { id: 'urgent', label: `عاجل ${urgentCount ? `(${urgentCount})` : ''}` },
            { id: 'pending', label: 'انتظار' },
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
        {studies === null && <div className="p-4 text-center text-xs text-slate-500">تحميل…</div>}
        {studies !== null && rows.length === 0 && (
          <div className="p-6 text-center text-xs text-slate-500">لا حالات هنا</div>
        )}
        {rows.map((s) => (
          <button
            key={s.study_uid}
            type="button"
            onClick={() => onSelect(s.study_uid)}
            className={
              'group block w-full border-b border-slate-900 px-3 py-2.5 text-right transition ' +
              (activeStudyUid === s.study_uid
                ? 'border-r-2 border-r-cyan-400 bg-cyan-500/5'
                : 'hover:bg-slate-900')
            }
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
              <span className="ltr-only">
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
        ))}
      </div>
    </aside>
  );
}
