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

export interface StreamCallbacks {
  onDispatched?: (agents: string[]) => void;
  onAgentDone?: (output: AgentOutput) => void;
  onAggregate?: (agg: AggregateResponse) => void;
  onDone?: (totalMs: number) => void;
  onError?: (err: string) => void;
}

/** Stream pipeline events via SSE. Returns an abort() to cancel. */
export function streamPipeline(study: StudyMetadata, cbs: StreamCallbacks): () => void {
  const controller = new AbortController();

  (async () => {
    try {
      const r = await fetch('/api/mcp/pipeline/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ study }),
        signal: controller.signal,
      });
      if (!r.ok || !r.body) {
        cbs.onError?.(`stream failed: ${r.status}`);
        return;
      }

      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse SSE frames: event: TYPE\ndata: JSON\n\n
        while (true) {
          const idx = buffer.indexOf('\n\n');
          if (idx < 0) break;
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);

          let eventType = '';
          let data = '';
          for (const line of frame.split('\n')) {
            if (line.startsWith('event: ')) eventType = line.slice(7).trim();
            else if (line.startsWith('data: ')) data = line.slice(6);
          }
          if (!eventType) continue;
          let parsed: unknown = null;
          try {
            parsed = JSON.parse(data);
          } catch {
            continue;
          }

          if (eventType === 'dispatched') {
            const p = parsed as { agents: string[] };
            cbs.onDispatched?.(p.agents);
          } else if (eventType === 'agent_done') {
            cbs.onAgentDone?.(parsed as AgentOutput);
          } else if (eventType === 'aggregate') {
            cbs.onAggregate?.(parsed as AggregateResponse);
          } else if (eventType === 'done') {
            const p = parsed as { total_latency_ms: number };
            cbs.onDone?.(p.total_latency_ms);
          }
        }
      }
    } catch (e) {
      if ((e as { name?: string })?.name !== 'AbortError') {
        cbs.onError?.(String(e));
      }
    }
  })();

  return () => controller.abort();
}
