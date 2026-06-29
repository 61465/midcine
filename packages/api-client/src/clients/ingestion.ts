import type { KyInstance } from 'ky';
import type { StudySummary, ReportDraft } from '@midcine/shared-types';

export class IngestionClient {
  constructor(private http: KyInstance) {}

  async listStudies(params?: {
    status?: string;
    priority?: string;
    limit?: number;
  }): Promise<StudySummary[]> {
    return this.http.get('v1/studies', { searchParams: params }).json();
  }

  async getStudy(studyUid: string): Promise<StudySummary> {
    return this.http.get(`v1/studies/${studyUid}`).json();
  }

  async getReport(studyUid: string): Promise<ReportDraft | null> {
    return this.http.get(`v1/studies/${studyUid}/report`).json();
  }

  async saveReport(studyUid: string, body: Partial<ReportDraft>): Promise<ReportDraft> {
    return this.http.put(`v1/studies/${studyUid}/report`, { json: body }).json();
  }

  async signReport(studyUid: string): Promise<{ pdfUrl: string; signedAt: string }> {
    return this.http.post(`v1/studies/${studyUid}/report/sign`).json();
  }
}
