'use client';

import { useEffect, useState } from 'react';
import { Card } from '@midcine/ui';
import { Sparkles, FileText, ScanEye } from 'lucide-react';
import { DicomViewer } from '../dicom-viewer-loader';
import { EnsemblePanel } from '../ensemble-panel';
import { ReportEditor } from './report-editor';
import type { PipelineResponse, StudyMetadata } from '../../../lib/mcp';

type Tab = 'ensemble' | 'report';

// Simple hook — runs pipeline once and shares result between ensemble + report.
function usePipelineResult(): {
  data: PipelineResponse | null;
  setData: (d: PipelineResponse) => void;
} {
  const [data, setData] = useState<PipelineResponse | null>(null);
  return { data, setData };
}

export function ReaderClient({ study }: { study: StudyMetadata }) {
  const [tab, setTab] = useState<Tab>('ensemble');
  const { data, setData } = usePipelineResult();

  // Cross-tab sharing via a custom event so EnsemblePanel's fetch result
  // is picked up by ReportEditor's tab without another API roundtrip.
  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<PipelineResponse>).detail;
      if (detail && detail.study_uid === study.study_uid) setData(detail);
    }
    window.addEventListener('midcine:pipeline-done', handler);
    return () => window.removeEventListener('midcine:pipeline-done', handler);
  }, [study.study_uid, setData]);

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      {/* Study header */}
      <div className="card-luxury flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <div className="section-label text-xs">قارئ الدراسة</div>
          <h1 className="text-brand-800 mt-2 text-2xl font-black">
            {study.patient_name}
            <span className="ltr-only text-muted-foreground ml-2 text-sm font-normal">
              · {study.patient_id}
            </span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">{study.clinical_context}</p>
        </div>
        <div className="flex flex-col items-start text-xs md:items-end">
          <span className="ltr-only text-muted-foreground">study_uid</span>
          <span className="ltr-only text-brand-800 font-mono">{study.study_uid}</span>
          <span className="ltr-only text-muted-foreground mt-1">
            {study.modality} · {study.body_part}
          </span>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-3">
        {/* DICOM viewer takes 2/3 */}
        <div className="lg:col-span-2">
          <Card className="h-[640px] overflow-hidden p-0">
            <DicomViewer />
          </Card>
        </div>

        {/* Side panel — tabs: Ensemble ⇄ Report */}
        <div className="flex min-h-0 flex-col gap-2">
          <div className="border-border flex gap-1 rounded-full border bg-white p-1">
            <TabBtn active={tab === 'ensemble'} onClick={() => setTab('ensemble')} icon={Sparkles}>
              الذكاء الاصطناعي
            </TabBtn>
            <TabBtn active={tab === 'report'} onClick={() => setTab('report')} icon={FileText}>
              التقرير
            </TabBtn>
          </div>

          <div className="min-h-0 flex-1">
            {tab === 'ensemble' && (
              <EnsemblePanel
                study={study}
                onDone={(pipeline) => {
                  setData(pipeline);
                  window.dispatchEvent(
                    new CustomEvent('midcine:pipeline-done', { detail: pipeline }),
                  );
                }}
              />
            )}
            {tab === 'report' &&
              (data ? (
                <ReportEditor study={study} pipeline={data} />
              ) : (
                <div className="card-luxury flex h-full items-center justify-center p-6 text-center text-xs text-slate-500">
                  <div>
                    <ScanEye className="mx-auto mb-2 h-6 w-6 text-slate-400" />
                    شغّل الذكاء الاصطناعي أولاً من التبويب المجاور، ثم تنسدل مسودّة التقرير هنا.
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TabBtn({
  active,
  icon: Icon,
  onClick,
  children,
}: {
  active: boolean;
  icon: typeof Sparkles;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ' +
        (active ? 'bg-brand-800 text-white' : 'text-slate-600 hover:bg-slate-100')
      }
    >
      <Icon className="h-3 w-3" />
      {children}
    </button>
  );
}
