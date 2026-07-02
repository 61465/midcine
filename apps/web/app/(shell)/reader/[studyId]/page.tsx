import { ReaderClient } from '../../../_components/reader/reader-client';

async function loadStudy(studyId: string) {
  try {
    const s = await fetch(
      `${process.env.MCP_BRIDGE_URL ?? 'http://localhost:8210'}/studies/${encodeURIComponent(studyId)}`,
      { cache: 'no-store' },
    );
    if (s.ok) {
      const data = await s.json();
      return {
        study_uid: data.study_uid || studyId,
        modality: data.modality || 'CT',
        body_part: data.body_part || 'BRAIN',
        patient_id: data.patient_id ?? undefined,
        patient_name: data.patient_name ?? undefined,
        clinical_context: data.description ?? undefined,
        hospital_id: data.hospital_id ?? 'default',
      };
    }
  } catch {}
  return {
    study_uid: studyId,
    modality: 'CT',
    body_part: 'BRAIN',
    hospital_id: 'default',
  };
}

export default async function ReaderPage({ params }: { params: Promise<{ studyId: string }> }) {
  const { studyId } = await params;
  const study = await loadStudy(studyId);
  return <ReaderClient study={study} />;
}
