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
  symptoms: string;
  clinical_history: string;
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
  surgeries: string[];
  family_history: string[];
  smoking: string;
  alcohol: string;
  occupation: string;
  phone: string;
  emergency_contact: string;
  notes: string;
  referrer: string | null;
  hospital_id: string;
}

export async function savePatient(p: Patient): Promise<Patient | null> {
  const r = await fetch(`${PROXY}/patients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(p),
  });
  if (!r.ok) return null;
  return r.json();
}

export interface CriticalAlertResult {
  ok: boolean;
  critical?: boolean;
  severity?: 'STAT' | 'URGENT' | 'ROUTINE';
  findings?: { term: string; reason: string; action: string }[];
  callback_recommended?: boolean;
  escalate_priority_to?: string;
  latency_ms?: number;
  error?: string;
}

export async function scanCritical(
  findings: string,
  modality: string,
  bodyPart: string,
): Promise<CriticalAlertResult> {
  const r = await fetch(`${PROXY}/ai/critical`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ findings, modality, body_part: bodyPart }),
  });
  if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
  return r.json();
}

export interface VisionAnalyzeResult {
  ok: boolean;
  features?: {
    hu?: Record<string, number>;
    tissue_pct?: Record<string, number>;
    edges?: Record<string, number>;
    blobs?: any[];
    abnormality_score?: number;
  };
  additional_findings?: string[];
  confirmed_findings?: string[];
  differential?: string[];
  confidence?: number;
  regions_of_interest?: { desc: string; priority: 'high' | 'medium' | 'low' }[];
  latency_ms?: number;
  error?: string;
}

export async function visionAnalyze(
  studyUid: string,
  sliceIndex: number,
  existingFindings: string,
  modality: string,
  bodyPart: string,
): Promise<VisionAnalyzeResult> {
  const r = await fetch(`${PROXY}/ai/vision-analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      study_uid: studyUid,
      slice_index: sliceIndex,
      existing_findings: existingFindings,
      modality,
      body_part: bodyPart,
    }),
  });
  if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
  return r.json();
}

export interface PubMedCitation {
  pmid: string;
  title: string;
  journal: string;
  year: string;
  authors: string[];
  relevance_score: number;
  why?: string;
}

export async function pubmedCite(
  finding: string,
  modality: string,
  bodyPart: string,
  limit = 3,
): Promise<{ ok: boolean; citations?: PubMedCitation[]; latency_ms?: number; error?: string }> {
  const r = await fetch(`${PROXY}/ai/pubmed-cite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ finding, modality, body_part: bodyPart, limit }),
  });
  if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
  return r.json();
}

export async function recordStyleEdit(
  userId: string,
  original: string,
  edited: string,
  modality: string,
  bodyPart: string,
): Promise<void> {
  try {
    await fetch(`${PROXY}/ai/style/record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ user_id: userId, original, edited, modality, body_part: bodyPart }),
    });
  } catch {
    // Non-blocking — style learning is opportunistic
  }
}

export interface Gap {
  item: string;
  severity: 'blocking' | 'important' | 'nice-to-have';
  category: string;
  why: string;
  how_to_get: string;
}

export interface GapsReport {
  ok: boolean;
  gaps?: Gap[];
  completeness_score?: number;
  ready_for_definitive_read?: boolean;
  latency_ms?: number;
  error?: string;
}

export async function fetchGaps(input: {
  modality: string;
  body_part: string;
  patient_age?: number | null;
  patient_sex?: string | null;
  symptoms?: string;
  clinical_history?: string;
  findings?: string;
  referrer?: string;
  has_prior_imaging?: boolean;
}): Promise<GapsReport> {
  const r = await fetch(`${PROXY}/ai/gaps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(input),
  });
  if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
  return r.json();
}

export async function compareStudies(
  priorImpression: string,
  currentFindings: string,
  modality: string,
  bodyPart: string,
): Promise<{ ok: boolean; comparison?: string; latency_ms?: number; error?: string }> {
  const r = await fetch(`${PROXY}/ai/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      prior_impression: priorImpression,
      current_findings: currentFindings,
      modality,
      body_part: bodyPart,
    }),
  });
  if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
  return r.json();
}

// ---- Auto-classify + analyze study (one-shot AI pipeline) ----

export interface AutoClassifyResult {
  ok: boolean;
  modality?: string;
  body_part?: string;
  region_detail?: string;
  likely_indication?: string;
  confidence?: number;
  source?: 'dicom_tags' | 'llm_inference' | string;
  error?: string;
}

export async function autoClassifyStudy(
  studyUid: string,
): Promise<AutoClassifyResult> {
  const r = await fetch(
    `/api/mcp/studies/${encodeURIComponent(studyUid)}/auto-classify`,
    { method: 'POST' },
  );
  if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
  return r.json();
}

export interface AnalyzeDifferential {
  dx?: string;
  probability?: number;
  supporting?: string[];
  against?: string[];
}

export interface VisionAbnormalFinding {
  finding?: string;
  location?: string;
  confidence?: number;
  acr_priority?: string;
}

export interface VisionResult {
  ok?: boolean;
  provider?: string;
  model?: string;
  anatomy_seen?: string;
  abnormal_findings?: VisionAbnormalFinding[];
  normal_findings?: string[];
  overall_impression?: string;
  confidence?: number;
  differential?: AnalyzeDifferential[];
  recommend_next_view?: string;
  error?: string | null;
}

export interface AnalyzeStudyResult {
  ok: boolean;
  latency_ms?: number;
  classification?: {
    modality?: string;
    body_part?: string;
    region_detail?: string;
    likely_indication?: string;
    confidence?: number;
    source?: string;
  };
  vision?: VisionResult;
  suggested_findings?: string;
  suggested_impression?: string;
  differential_summary?: string[];
  diagnose?: {
    diagnostic_report?: {
      one_liner?: string;
      problem_representation?: string;
      differential_diagnosis?: AnalyzeDifferential[];
      leading_diagnosis?: string;
      confidence?: number;
      recommended_next_steps?: string[];
      red_flags?: string[];
    };
  };
  error?: string;
}

export async function analyzeStudy(
  studyUid: string,
  opts: {
    symptoms?: string;
    clinical_history?: string;
    findings?: string;
  } = {},
): Promise<AnalyzeStudyResult> {
  const r = await fetch('/api/mcp/ai/analyze-study', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      study_uid: studyUid,
      symptoms: opts.symptoms ?? '',
      clinical_history: opts.clinical_history ?? '',
      findings: opts.findings ?? '',
    }),
  });
  if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
  return r.json();
}

// ---- Final Report (deep analysis → unified editable report) ----

export interface FinalReportResult {
  ok: boolean;
  report_text?: string;
  report_html?: string;
  meta?: {
    patient_name?: string;
    patient_id?: string;
    patient_age?: number | null;
    patient_sex?: string;
    modality?: string;
    body_part?: string;
    study_description?: string;
    referrer?: string;
    study_uid?: string;
  };
  vision?: {
    total_slices?: number;
    batch_count?: number;
    successful_batches?: number;
    abnormal_findings?: Array<{
      finding?: string;
      location?: string;
      slice_range?: string;
      confidence?: number;
      acr_priority?: string;
    }>;
    critical?: boolean;
    urgent?: boolean;
  };
  latency_ms?: number;
  error?: string;
}

// ---- Region-of-interest vision (triplanar click-to-analyze) ----

export interface VisionSeeRegionResult {
  ok: boolean;
  plane?: string;
  slice_index?: number;
  total_slices?: number;
  parsed?: {
    verdict?: 'normal' | 'abnormal' | 'indeterminate' | string;
    anatomy_at_point?: string;
    description?: string;
    differential?: string[];
    acr_priority?: string;
    confidence?: number;
    recommended_next_view?: string;
  };
  raw_text?: string;
  provider?: string;
  model?: string;
  latency_ms?: number;
  error?: string;
}

export async function visionSeeRegion(
  studyUid: string,
  opts: {
    plane?: 'axial' | 'sagittal' | 'coronal';
    slice_index?: number;
    roi_x?: number;
    roi_y?: number;
  } = {},
): Promise<VisionSeeRegionResult> {
  const r = await fetch('/api/mcp/ai/vision-see-region', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      study_uid: studyUid,
      plane: opts.plane ?? 'axial',
      slice_index: opts.slice_index ?? 0,
      roi_x: opts.roi_x,
      roi_y: opts.roi_y,
    }),
  });
  if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
  return r.json();
}

export async function generateFinalReport(
  studyUid: string,
  opts: {
    symptoms?: string;
    clinical_history?: string;
    additional_notes?: string;
  } = {},
): Promise<FinalReportResult> {
  const r = await fetch('/api/mcp/ai/generate-final-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      study_uid: studyUid,
      symptoms: opts.symptoms ?? '',
      clinical_history: opts.clinical_history ?? '',
      additional_notes: opts.additional_notes ?? '',
    }),
  });
  if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
  return r.json();
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

export interface NewStudyInput {
  patient_id: string;
  patient_name: string;
  age?: number | null;
  sex?: string | null;
  modality: string;
  body_part: string;
  priority?: string;
  description?: string;
  symptoms?: string;
  clinical_history?: string;
  referrer?: string;
  hospital_id?: string;
}

function randomUid(): string {
  const rnd = Math.floor(Math.random() * 1e10).toString();
  const ts = Date.now().toString();
  return `1.2.826.0.1.3680043.10.midcine.${ts}.${rnd}`;
}

export async function createStudy(input: NewStudyInput): Promise<Study | null> {
  const rec: Study = {
    study_uid: randomUid(),
    patient_id: input.patient_id.trim(),
    patient_name: input.patient_name.trim(),
    age: input.age ?? null,
    sex: input.sex ?? null,
    modality: input.modality,
    body_part: input.body_part,
    priority: input.priority ?? 'P3',
    study_date: new Date().toISOString(),
    description: input.description ?? '',
    symptoms: input.symptoms ?? '',
    clinical_history: input.clinical_history ?? '',
    referrer: input.referrer ?? '',
    status: 'pending',
    ai_confidence: null,
    suggested_finding: null,
    hospital_id: input.hospital_id ?? 'default',
  };
  const r = await fetch(`${PROXY}/studies/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(rec),
  });
  if (!r.ok) return null;
  return r.json();
}

export async function uploadDicomFor(studyUid: string, file: File | Blob): Promise<boolean> {
  const buf = await file.arrayBuffer();
  const r = await fetch(`${PROXY}/studies/${encodeURIComponent(studyUid)}/dicom`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/dicom' },
    body: buf,
  });
  if (!r.ok) return false;
  const j = await r.json();
  return !!j.ok;
}

export async function uploadSeriesSlice(
  studyUid: string,
  filename: string,
  file: File | Blob,
): Promise<boolean> {
  const buf = await file.arrayBuffer();
  const r = await fetch(
    `${PROXY}/studies/${encodeURIComponent(studyUid)}/series/${encodeURIComponent(filename)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: buf,
    },
  );
  if (!r.ok) return false;
  const j = await r.json();
  return !!j.ok;
}

export interface SeriesInfo {
  study_uid: string;
  slice_count: number;
  slices: string[];
}

export async function fetchSeries(studyUid: string): Promise<SeriesInfo> {
  const r = await fetch(`${PROXY}/studies/${encodeURIComponent(studyUid)}/series`);
  if (!r.ok) return { study_uid: studyUid, slice_count: 0, slices: [] };
  return r.json();
}

export async function deleteStudy(studyUid: string): Promise<boolean> {
  const r = await fetch(`${PROXY}/studies/${encodeURIComponent(studyUid)}/delete`, {
    method: 'DELETE',
  });
  if (!r.ok) return false;
  const j = await r.json();
  return !!j.ok;
}
