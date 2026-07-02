'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@midcine/ui';
import {
  User,
  Heart,
  Pill,
  AlertCircle,
  ChevronLeft,
  Calendar,
  UserX,
  FileText,
} from 'lucide-react';
import {
  fetchPatient,
  fetchPatientStudies,
  type Patient,
  type Study,
} from '../../../../lib/studies';
import { EmptyState } from '../../../_components/empty-state';
import { useLocale } from '../../../../lib/i18n';

export function PatientPageClient({ patientId }: { patientId: string }) {
  const { t } = useLocale();
  const [state, setState] = useState<{ patient: Patient | null; studies: Study[] } | null>(null);

  useEffect(() => {
    Promise.all([fetchPatient(patientId), fetchPatientStudies(patientId)])
      .then(([p, s]) => setState({ patient: p, studies: s }))
      .catch(() => setState({ patient: null, studies: [] }));
  }, [patientId]);

  if (state === null) {
    return <div className="p-8 text-center text-sm text-slate-500">Loading…</div>;
  }

  if (!state.patient) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Link href="/worklist" className="hover:text-brand-800">
            {t('nav.worklist')}
          </Link>
          <ChevronLeft className="h-3 w-3" />
          <span>{t('nav.patient')}</span>
        </div>
        <EmptyState
          icon={UserX}
          title={t('empty.no_patient.title')}
          description={t('empty.no_patient.desc')}
          hint={`ID: ${patientId}`}
          action={
            <Link
              href="/worklist"
              className="inline-flex items-center gap-1 rounded-full bg-cyan-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-cyan-500"
            >
              {t('nav.worklist')} <ChevronLeft className="h-3 w-3" />
            </Link>
          }
        />
      </div>
    );
  }

  const p = state.patient;
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Link href="/worklist" className="hover:text-brand-800">
          {t('nav.worklist')}
        </Link>
        <ChevronLeft className="h-3 w-3" />
        <span>{t('nav.patient')}</span>
      </div>

      <div className="card-luxury p-6">
        <div className="flex items-start gap-4">
          <div className="to-brand-800 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 text-white">
            <User className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-brand-800 text-2xl font-black">{p.patient_name}</h1>
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-600">
              <span className="ltr-only">{p.patient_id}</span>
              {p.age != null && (
                <>
                  <span>·</span>
                  <span>{p.age}</span>
                </>
              )}
              {p.sex && (
                <>
                  <span>·</span>
                  <span>{p.sex}</span>
                </>
              )}
              {p.blood_type && (
                <>
                  <span>·</span>
                  <span className="ltr-only rounded bg-red-100 px-1.5 font-bold text-red-700">
                    {p.blood_type}
                  </span>
                </>
              )}
            </div>
            {p.referrer && <div className="mt-1 text-xs text-slate-500">{p.referrer}</div>}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <InfoBlock icon={AlertCircle} color="rose" title={t('nav.patient')}>
            {p.allergies.length > 0 ? p.allergies.join('، ') : '—'}
          </InfoBlock>
          <InfoBlock icon={Heart} color="fuchsia" title="Conditions">
            {p.chronic_conditions.length > 0 ? p.chronic_conditions.join('، ') : '—'}
          </InfoBlock>
          <InfoBlock icon={Pill} color="cyan" title="Meds">
            {p.current_meds.length > 0 ? p.current_meds.join('، ') : '—'}
          </InfoBlock>
        </div>
      </div>

      <Card>
        <div className="border-b border-slate-100 p-4">
          <h2 className="text-brand-800 text-lg font-bold">Studies ({state.studies.length})</h2>
        </div>
        {state.studies.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            <FileText className="mx-auto mb-2 h-6 w-6 text-slate-300" />—
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {state.studies.map((s) => (
              <Link
                key={s.study_uid}
                href={`/reader/${s.study_uid}`}
                className="block p-4 hover:bg-slate-50"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-slate-400" />
                    <div>
                      <div className="text-brand-800 text-sm font-bold">
                        {s.modality} · {s.body_part}
                      </div>
                      <div className="text-xs text-slate-500">
                        {s.study_date ? new Date(s.study_date).toLocaleString() : '—'}
                      </div>
                    </div>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                    {t(`status.${s.status}` as never)}
                  </span>
                </div>
                {s.description && <p className="mt-2 text-xs text-slate-600">{s.description}</p>}
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function InfoBlock({
  icon: Icon,
  color,
  title,
  children,
}: {
  icon: typeof Heart;
  color: 'rose' | 'cyan' | 'fuchsia';
  title: string;
  children: React.ReactNode;
}) {
  const colorMap = {
    rose: 'border-rose-200 bg-rose-50 text-rose-900',
    cyan: 'border-cyan-200 bg-cyan-50 text-cyan-900',
    fuchsia: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-900',
  } as const;
  return (
    <div className={`flex items-start gap-2 rounded-lg border ${colorMap[color]} p-2.5`}>
      <Icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wider opacity-70">
          {title}
        </div>
        <div className="text-xs leading-relaxed">{children}</div>
      </div>
    </div>
  );
}
