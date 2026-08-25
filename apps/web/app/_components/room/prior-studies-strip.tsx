'use client';

import { useEffect, useState } from 'react';
import { Clock, Layers, ArrowLeftRight } from 'lucide-react';
import { fetchPatientStudies, type Study } from '../../../lib/studies';

const MODALITY_COLOR: Record<string, string> = {
  CT: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
  MR: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40',
  US: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  CR: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  DR: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  MG: 'bg-pink-500/20 text-pink-300 border-pink-500/40',
  NM: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  PT: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
};

function relDate(iso: string): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / (24 * 3600 * 1000));
  if (d < 1) return 'today';
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  const y = (d / 365).toFixed(1);
  return `${y}y ago`;
}

interface Props {
  patientId: string;
  activeStudyUid: string;
  onSelect: (uid: string) => void;
  onCompare?: (study: Study) => void;
}

export function PriorStudiesStrip({ patientId, activeStudyUid, onSelect, onCompare }: Props) {
  const [studies, setStudies] = useState<Study[] | null>(null);

  useEffect(() => {
    if (!patientId) return;
    void fetchPatientStudies(patientId)
      .then((all) => {
        const priors = all
          .filter((s) => s.study_uid !== activeStudyUid)
          .sort((a, b) => (b.study_date || '').localeCompare(a.study_date || ''));
        setStudies(priors);
      })
      .catch(() => setStudies([]));
  }, [patientId, activeStudyUid]);

  if (studies === null) {
    return (
      <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-950 px-3 py-1.5 text-[10px] text-slate-600">
        <Layers className="h-3 w-3" />
        Loading priors…
      </div>
    );
  }

  if (studies.length === 0) {
    return (
      <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-950 px-3 py-1.5 text-[10px] text-slate-500">
        <Layers className="h-3 w-3" />
        No prior studies for this patient
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-950 px-3 py-1.5">
      <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
        <Layers className="h-3 w-3" />
        Priors ({studies.length})
      </span>
      <div className="flex flex-1 gap-1.5 overflow-x-auto">
        {studies.slice(0, 6).map((s) => (
          <div
            key={s.study_uid}
            className="group relative flex min-w-[120px] flex-col gap-0.5 rounded border border-slate-800 bg-slate-900/60 p-1.5 text-left transition hover:border-cyan-500/40 hover:bg-slate-900"
          >
            {onCompare && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCompare(s);
                }}
                className="absolute right-1 top-1 z-10 hidden rounded bg-fuchsia-500/20 p-1 text-fuchsia-300 hover:bg-fuchsia-500/40 hover:text-white group-hover:block"
                title="Open side-by-side compare"
              >
                <ArrowLeftRight className="h-2.5 w-2.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onSelect(s.study_uid)}
              className="flex flex-col gap-0.5 text-left"
            >
            <div className="flex items-center justify-between">
              <span
                className={
                  'rounded border px-1.5 py-0.5 text-[9px] font-bold ' +
                  (MODALITY_COLOR[s.modality] ?? 'border-slate-700 bg-slate-800 text-slate-400')
                }
              >
                {s.modality}
              </span>
              <span className="flex items-center gap-0.5 text-[9px] text-slate-500">
                <Clock className="h-2.5 w-2.5" />
                {relDate(s.study_date)}
              </span>
            </div>
            <span className="truncate text-[10px] font-bold text-slate-200">{s.body_part}</span>
            {s.description && (
              <span className="truncate text-[9px] text-slate-500">{s.description}</span>
            )}
            {s.ai_confidence !== null && s.ai_confidence !== undefined && (
              <span className="flex items-center gap-1 text-[9px] text-slate-500">
                <span
                  className={
                    'h-1.5 w-1.5 rounded-full ' +
                    (s.ai_confidence > 0.75
                      ? 'bg-emerald-400'
                      : s.ai_confidence > 0.5
                        ? 'bg-amber-400'
                        : 'bg-rose-400')
                  }
                />
                AI {Math.round(s.ai_confidence * 100)}%
              </span>
            )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
