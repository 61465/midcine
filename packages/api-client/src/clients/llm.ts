import type { KyInstance } from 'ky';

export interface LlmDraftRequest {
  studyUid: string;
  modality: string;
  bodyPart: string;
  measurements?: Record<string, unknown>;
}

export interface LlmDraftResponse {
  text: string;
  citations: Array<{ source: string; chunkId: string }>;
  modelVersion: string;
  generatedAt: string;
}

export class LlmClient {
  constructor(private http: KyInstance) {}

  async draft(req: LlmDraftRequest): Promise<LlmDraftResponse> {
    return this.http.post('v1/llm/draft', { json: req }).json();
  }

  async *stream(req: LlmDraftRequest): AsyncGenerator<string> {
    const response = await this.http.post('v1/llm/stream', { json: req });
    const reader = response.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield decoder.decode(value);
    }
  }
}
