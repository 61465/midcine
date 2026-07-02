'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PriorityBadge, ModalityIcon, type Modality } from '@midcine/ui';
import { Search, Filter, Clock, ChevronLeft, Inbox, PlugZap } from 'lucide-react';
import { fetchStudies, type Study } from '../../../lib/studies';
import { EmptyState } from '../../_components/empty-state';
import { useLocale } from '../../../lib/i18n';

const MODALITIES: string[] = ['ALL', 'CT', 'MR', 'CR', 'DR', 'US'];
const PRIORITIES: string[] = ['ALL', 'P1', 'P2', 'P3', 'P4', 'P5'];
const STATUSES: string[] = ['ALL', 'pending', 'in_progress', 'read', 'signed'];

function relTime(iso: string, locale: string): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  const diffM = Math.floor((Date.now() - t) / 60000);
  if (diffM < 0) return locale === 'ar' ? 'مجدول' : 'scheduled';
  if (diffM < 60) return locale === 'ar' ? `منذ ${diffM} د` : `${diffM}m ago`;
  const h = Math.floor(diffM / 60);
  if (h < 24) return locale === 'ar' ? `منذ ${h} س` : `${h}h ago`;
  return new Date(iso).toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-GB');
}

export default function WorklistPage() {
  const { t, locale } = useLocale();
  const [studies, setStudies] = useState<Study[] | null>(null);
  const [q, setQ] = useState('');
  const [modality, setModality] = useState('ALL');
  const [priority, setPriority] = useState('ALL');
  const [status, setStatus] = useState('ALL');

  useEffect(() => {
    fetchStudies()
      .then(setStudies)
      .catch(() => setStudies([]));
  }, []);

  const rows = useMemo(() => {
    if (!studies) return [];
    const term = q.trim().toLowerCase();
    return studies
      .filter(
        (s) =>
          (modality === 'ALL' || s.modality === modality) &&
          (priority === 'ALL' || s.priority === priority) &&
          (status === 'ALL' || s.status === status) &&
          (!term ||
            s.patient_name.toLowerCase().includes(term) ||
            s.patient_id.toLowerCase().includes(term) ||
            s.description.toLowerCase().includes(term) ||
            s.referrer.toLowerCase().includes(term)),
      )
      .sort((a, b) => {
        const p = a.priority.localeCompare(b.priority);
        if (p !== 0) return p;
        return new Date(b.study_date).getTime() - new Date(a.study_date).getTime();
      });
  }, [studies, q, modality, priority, status]);

  const stats = useMemo(() => {
    if (!studies) return { total: 0, urgent: 0, pending: 0, signed: 0 };
    return {
      total: studies.length,
      urgent: studies.filter((s) => s.priority === 'P1' || s.priority === 'P2').length,
      pending: studies.filter((s) => s.status === 'pending').length,
      signed: studies.filter((s) => s.status === 'signed').length,
    };
  }, [studies]);

  if (studies === null) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <div className="animate-pulse rounded-2xl border border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">
          Loading…
        </div>
      </div>
    );
  }

  if (studies.length === 0) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 p-4">
        <div>
          <div className="section-label mb-1">{t('nav.worklist')}</div>
          <h1 className="text-brand-800 text-3xl font-black">{t('nav.worklist')}</h1>
        </div>
        <EmptyState
          icon={PlugZap}
          title={t('empty.no_studies.title')}
          description={t('empty.no_studies.desc')}
          hint={t('empty.no_studies.hint')}
          action={
            <Link
              href="/console"
              className="inline-flex items-center gap-1.5 rounded-full bg-cyan-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-cyan-500"
            >
              {t('nav.console')} <ChevronLeft className="h-3 w-3" />
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <div className="section-label mb-1">{t('nav.worklist')}</div>
          <h1 className="text-brand-800 text-3xl font-black">{t('nav.worklist')}</h1>
          <p className="text-muted-foreground text-sm">
            {rows.length} / {stats.total} · {stats.urgent} {t('priority.p1')}
          </p>
        </div>
      </div>

      <div className="card-luxury flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('action.search')}
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-9 text-sm focus:border-cyan-500 focus:outline-none"
          />
        </div>
        <FilterChips value={modality} onChange={setModality} items={MODALITIES} />
        <FilterChips value={priority} onChange={setPriority} items={PRIORITIES} />
        <FilterChips
          value={status}
          onChange={setStatus}
          items={STATUSES}
          render={(v) => (v === 'ALL' ? '·' : t(`status.${v}` as never))}
        />
      </div>

      <div className="card-luxury overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('priority.p1').split(' ')[0]}</th>
                <th className="px-4 py-3">{t('nav.patient')}</th>
                <th className="px-4 py-3">{t('reader.dicom_viewer')}</th>
                <th className="px-4 py-3">{t('reader.latency')}</th>
                <th className="px-4 py-3">AI</th>
                <th className="px-4 py-3">{t('status.pending').split(' ')[0]}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.study_uid} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <PriorityBadge priority={s.priority as never} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-brand-800 font-bold">{s.patient_name || '—'}</div>
                    <div className="ltr-only text-[11px] text-slate-500">{s.patient_id}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <ModalityIcon modality={s.modality as Modality} />
                      <span className="text-xs text-slate-700">{s.body_part}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {relTime(s.study_date, locale)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {s.ai_confidence != null ? (
                      <div className="ltr-only text-xs font-bold text-cyan-700">
                        {Math.round(s.ai_confidence * 100)}%
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                      {t(`status.${s.status}` as never)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-left">
                    <Link
                      href={`/reader/${s.study_uid}`}
                      className="ltr-only bg-brand-800 hover:bg-brand-700 inline-flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-bold text-white"
                    >
                      {t('action.open')} <ChevronLeft className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center">
                    <Inbox className="mx-auto mb-2 h-6 w-6 text-slate-300" />
                    <div className="text-sm text-slate-500">—</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FilterChips({
  value,
  onChange,
  items,
  render,
}: {
  value: string;
  onChange: (v: string) => void;
  items: readonly string[];
  render?: (v: string) => string;
}) {
  return (
    <div className="flex items-center gap-1">
      <Filter className="h-3 w-3 text-slate-400" />
      {items.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={
            'rounded-full px-2 py-0.5 text-[10px] font-medium transition ' +
            (v === value
              ? 'bg-slate-800 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
          }
        >
          {render ? render(v) : v}
        </button>
      ))}
    </div>
  );
}
