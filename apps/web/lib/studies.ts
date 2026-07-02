// Fetch real studies + patients from mcp-bridge. NEVER fabricates data.
// If the store is empty, every consumer must show an honest empty state.

const PROXY = '/api/mcp';

export type Modality = 'CT' | 'MR' | 'CR' | 'DR' | 'US' | 'NM' | 'PT' | 'MG';
export type Priority = 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
export type StudyStatus = 'pending' | 'in_progress' | 'read' | 'signed';

export interface Study {
  study_uid: string;
  patient_id: string;
  patient_name: string;
  age: number | null;
  sex: string | null;
  modality: string;
  body_part: string;
  priority: string;
  study_date: string;
  description: string;
  referrer: string;
  status: string;
  ai_confidence: number | null;
  suggested_finding: string | null;
  hospital_id: string;
}

export interface Patient {
  patient_id: string;
  patient_name: string;
  age: number | null;
  sex: string | null;
  blood_type: string | null;
  allergies: string[];
  chronic_conditions: string[];
  current_meds: string[];
  referrer: string | null;
  hospital_id: string;
}

export interface AuditEntry {
  ts: string;
  tenant: string;
  actor: { type: string; id?: string };
  action: string;
  target: { type: string; id: string } | null;
  ok: boolean;
  meta: Record<string, unknown> | null;
}

export interface IntegrationStatus {
  connected: boolean;
  mode?: string;
  backend?: string;
  hint: string;
}

export async function fetchStudies(hospitalId = 'default'): Promise<Study[]> {
  const r = await fetch(`${PROXY}/studies?hospital_id=${encodeURIComponent(hospitalId)}`);
  if (!r.ok) return [];
  return r.json();
}

export async function fetchStudy(studyUid: string): Promise<Study | null> {
  const r = await fetch(`${PROXY}/studies/${encodeURIComponent(studyUid)}`);
  if (!r.ok) return null;
  return r.json();
}

export async function fetchPatient(patientId: string): Promise<Patient | null> {
  const r = await fetch(`${PROXY}/patients/${encodeURIComponent(patientId)}`);
  if (!r.ok || r.status === 204) return null;
  const data = await r.json();
  return data && data.patient_id ? data : null;
}

export async function fetchPatientStudies(patientId: string): Promise<Study[]> {
  const r = await fetch(`${PROXY}/patients/${encodeURIComponent(patientId)}/studies`);
  if (!r.ok) return [];
  return r.json();
}

export async function fetchAuditRecent(hospitalId = 'default', limit = 100): Promise<AuditEntry[]> {
  const r = await fetch(
    `${PROXY}/audit/recent?hospital_id=${encodeURIComponent(hospitalId)}&limit=${limit}`,
  );
  if (!r.ok) return [];
  return r.json();
}

export async function fetchIntegrationsHealth(): Promise<Record<string, IntegrationStatus>> {
  const r = await fetch(`${PROXY}/integrations/health`);
  if (!r.ok) return {};
  return r.json();
}
