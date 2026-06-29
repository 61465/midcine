import type { KyInstance } from 'ky';

export interface PmiLookupResult {
  found: boolean;
  hospitals: Array<{
    hospitalId: string;
    hospitalName: string;
    studyCount: number;
    lastStudyDate: string;
  }>;
  requiresConsent: boolean;
}

export class CloudIndexClient {
  constructor(private http: KyInstance) {}

  async lookupPmi(nationalIdHash: string): Promise<PmiLookupResult> {
    return this.http.post('v1/pmi/lookup', { json: { nationalIdHash } }).json();
  }
}
