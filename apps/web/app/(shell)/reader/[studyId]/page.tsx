import { Card } from '@midcine/ui';
import { DicomViewer } from '../../../_components/dicom-viewer-loader';
import { EnsemblePanel } from '../../../_components/ensemble-panel';

interface Params {
  studyId: string;
}

// Demo study metadata — Sprint 2 will load these from ingestion-api
function demoStudy(studyId: string) {
  return {
    study_uid: studyId === 'demo' ? '1.2.3.STUDY.DEMO.CT' : studyId,
    modality: 'CT',
    body_part: 'BRAIN',
    patient_id: 'PAT-1234',
    patient_name: 'محمد أحمد',
    clinical_context: 'رجل ٥٥ عام، صداع مفاجئ + ضعف نصفي أيمن',
    hospital_id: 'demo-hospital',
  };
}

export default async function ReaderPage({ params }: { params: Promise<Params> }) {
  const { studyId } = await params;
  const study = demoStudy(studyId);

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      {/* Study header */}
      <div className="card-luxury flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <div className="section-label text-xs">study reader</div>
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

        {/* Live ensemble panel */}
        <div className="flex min-h-0 flex-col">
          <EnsemblePanel study={study} />
        </div>
      </div>
    </div>
  );
}
