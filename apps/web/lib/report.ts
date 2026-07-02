// Client-side types + API calls for report + WhatsApp flows.
// Backend: services/mcp-bridge/app/{report.py,whatsapp_mock.py}

import type { AgentOutput, AggregateResponse, StudyMetadata } from './mcp';

export interface ReportSection {
  key: 'patient' | 'technique' | 'findings' | 'impression' | 'recommendations';
  title_ar: string;
  content_ar: string;
  editable: boolean;
}

export interface FinalReport {
  study_uid: string;
  patient_id?: string | null;
  patient_name?: string | null;
  hospital_id: string;
  modality: string;
  body_part: string;
  sections: ReportSection[];
  impression_ar: string;
  recommendations_ar: string[];
  atlas_condition_ids: string[];
  signed_by?: string | null;
  signed_at?: string | null;
  license_no?: string | null;
  generated_at: string;
}

const BRIDGE_PROXY = '/api/mcp';

export async function generateReport(
  study: StudyMetadata,
  aggregate: AggregateResponse,
  outputs: AgentOutput[],
): Promise<FinalReport> {
  const r = await fetch(`${BRIDGE_PROXY}/report/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ study, aggregate, outputs }),
  });
  if (!r.ok) throw new Error(`generate failed ${r.status}`);
  return r.json();
}

export async function signReport(
  report: FinalReport,
  signed_by: string,
  license_no: string,
): Promise<FinalReport> {
  const r = await fetch(`${BRIDGE_PROXY}/report/sign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ report, signed_by, license_no }),
  });
  if (!r.ok) throw new Error(`sign failed ${r.status}`);
  return r.json();
}

export interface WhatsAppMessage {
  message_id: string;
  hospital_id: string;
  study_uid: string;
  to_phone: string;
  to_name: string;
  kind: string;
  ts: string;
  status: string;
  impression_ar?: string | null;
  patient_name?: string | null;
}

export async function sendReportOnWhatsApp(
  report: FinalReport,
  to_phone: string,
  to_name: string,
  kind: 'report_to_doctor' | 'report_to_patient' = 'report_to_doctor',
): Promise<WhatsAppMessage> {
  const r = await fetch(`${BRIDGE_PROXY}/whatsapp/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ report, to_phone, to_name, kind }),
  });
  if (!r.ok) throw new Error(`whatsapp send failed ${r.status}`);
  return r.json();
}

export async function listWhatsAppMessages(
  hospitalId: string,
  limit = 50,
): Promise<WhatsAppMessage[]> {
  const r = await fetch(
    `${BRIDGE_PROXY}/whatsapp/messages?hospital_id=${encodeURIComponent(hospitalId)}&limit=${limit}`,
  );
  if (!r.ok) throw new Error(`whatsapp list failed ${r.status}`);
  return r.json();
}
