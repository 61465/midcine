export interface StudyMetadata {
  study_uid: string;
  modality: string;
  body_part: string;
  patient_id?: string;
  patient_name?: string;
  clinical_context?: string;
  hospital_id?: string;
}

export interface AgentOutput {
  agent: string;
  ok: boolean;
  data?: unknown;
  error?: string | null;
  latency_ms: number;
  confidence?: number | null;
  summary?: string | null;
}

export interface Finding {
  text: string;
  confidence: number;
  agents: string[];
}

export interface Disagreement {
  agents: string[];
  topic: string;
  detail: string;
}

export interface AtlasSuggestion {
  organ: 'heart' | 'lungs' | 'brain' | 'kidney';
  condition_id: string;
  label_ar: string;
  label_en: string;
  confidence: number;
  matched_keywords: string[];
  agents: string[];
}

export interface AggregateResponse {
  study_uid: string;
  findings: Finding[];
  disagreements: Disagreement[];
  overall_confidence: number;
  requires_human_review: boolean;
  agent_versions: Record<string, string>;
  atlas_suggestions: AtlasSuggestion[];
}

export interface PipelineResponse {
  study_uid: string;
  dispatched_agents: string[];
  outputs: AgentOutput[];
  aggregate: AggregateResponse;
  total_latency_ms: number;
}

export async function runPipeline(study: StudyMetadata): Promise<PipelineResponse> {
  const r = await fetch('/api/mcp/pipeline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ study }),
  });
  if (!r.ok) {
    throw new Error(`pipeline failed: ${r.status} ${await r.text()}`);
  }
  return r.json();
}
