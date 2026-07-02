export type LungStateId = 'normal' | 'tachypnea' | 'bradypnea' | 'copd' | 'pneumonia' | 'pe';

export interface LungState {
  id: LungStateId;
  labelAr: string;
  labelEn: string;
  rr: number; // respiratory rate — breaths/min
  ieRatio: number; // inspiration:expiration ratio (higher = longer expiration)
  tidalVolume: number; // relative (1.0 = normal)
  sideAsymmetric?: 'left' | 'right' | null; // unilateral involvement (e.g. PE)
  descriptionAr: string;
}

export const LUNG_STATES: Record<LungStateId, LungState> = {
  normal: {
    id: 'normal',
    labelAr: 'طبيعي',
    labelEn: 'Eupnea',
    rr: 14,
    ieRatio: 1.0,
    tidalVolume: 1.0,
    descriptionAr: 'تنفّس هادئ ١٢-٢٠ ن/د، نسبة شهيق:زفير = ١:١',
  },
  tachypnea: {
    id: 'tachypnea',
    labelAr: 'تسرّع تنفّس',
    labelEn: 'Tachypnea',
    rr: 28,
    ieRatio: 1.0,
    tidalVolume: 0.7,
    descriptionAr: 'أكثر من ٢٠ ن/د. سطحي. علامة ضائقة تنفّسية',
  },
  bradypnea: {
    id: 'bradypnea',
    labelAr: 'بطء تنفّس',
    labelEn: 'Bradypnea',
    rr: 8,
    ieRatio: 1.0,
    tidalVolume: 1.2,
    descriptionAr: 'أقل من ١٢ ن/د. قد يشير لهبوط CNS أو تسمّم مواد',
  },
  copd: {
    id: 'copd',
    labelAr: 'انسداد رئوي مزمن',
    labelEn: 'COPD',
    rr: 20,
    ieRatio: 3.0,
    tidalVolume: 0.6,
    descriptionAr: 'زفير مُطوّل (E:I=3:1). حجم مدّي منخفض. صفير مزمن',
  },
  pneumonia: {
    id: 'pneumonia',
    labelAr: 'التهاب رئوي',
    labelEn: 'Pneumonia',
    rr: 24,
    ieRatio: 1.0,
    tidalVolume: 0.7,
    sideAsymmetric: 'right',
    descriptionAr: 'تسرّع سطحي + خرخرات (crackles). فصّ مصاب لا يتمدّد',
  },
  pe: {
    id: 'pe',
    labelAr: 'انسداد رئوي',
    labelEn: 'Pulmonary Embolism',
    rr: 32,
    ieRatio: 1.0,
    tidalVolume: 0.8,
    sideAsymmetric: 'left',
    descriptionAr: 'تسرّع تنفّس مفاجئ + هبوط O₂. طوارئ — CTA رئوي',
  },
};

export const LUNG_STATE_LIST = Object.values(LUNG_STATES);
