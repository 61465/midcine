import type { KyInstance } from 'ky';

export interface ConsentRequest {
  patientId: string;
  requestingHospitalId: string;
  targetHospitalId: string;
  reason: string;
  channels: Array<'whatsapp' | 'sms' | 'inapp'>;
}

export interface ConsentStatus {
  consentId: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  approvedAt?: string;
  expiresAt: string;
}

export class ConsentClient {
  constructor(private http: KyInstance) {}

  async request(req: ConsentRequest): Promise<{ consentId: string }> {
    return this.http.post('v1/consent/request', { json: req }).json();
  }

  async status(consentId: string): Promise<ConsentStatus> {
    return this.http.get(`v1/consent/${consentId}`).json();
  }
}
