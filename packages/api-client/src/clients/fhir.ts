import type { KyInstance } from 'ky';

export class FhirClient {
  constructor(private http: KyInstance) {}

  async getImagingStudy(id: string): Promise<unknown> {
    return this.http.get(`fhir/R4B/ImagingStudy/${id}`).json();
  }

  async getDiagnosticReport(id: string): Promise<unknown> {
    return this.http.get(`fhir/R4B/DiagnosticReport/${id}`).json();
  }

  async searchPatient(params: Record<string, string>): Promise<unknown> {
    return this.http.get('fhir/R4B/Patient', { searchParams: params }).json();
  }
}
