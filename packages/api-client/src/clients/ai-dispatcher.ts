import type { KyInstance } from 'ky';

export interface DispatchResult {
  studyUid: string;
  modelsInvoked: string[];
  aggregatedReport: {
    findings: Array<{ text: string; confidence: number; models: string[] }>;
    impressions: Array<{ text: string; confidence: number }>;
    overallConfidence: number;
    requiresHumanReview: boolean;
    disagreements: Array<{ models: string[]; topic: string }>;
  };
  perModelOutputs: Record<string, unknown>;
  latencyMs: number;
}

export class AiDispatcherClient {
  constructor(private http: KyInstance) {}

  async dispatch(studyUid: string, force?: boolean): Promise<DispatchResult> {
    return this.http
      .post('v1/dispatch', { json: { studyUid, force: force ?? false } })
      .json();
  }

  async getResult(studyUid: string): Promise<DispatchResult | null> {
    return this.http.get(`v1/dispatch/${studyUid}`).json();
  }
}
