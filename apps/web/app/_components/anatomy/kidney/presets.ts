export type KidneyStateId = 'normal' | 'aki' | 'ckd3' | 'ckd5' | 'stones';

export interface KidneyState {
  id: KidneyStateId;
  labelAr: string;
  labelEn: string;
  gfr: number; // eGFR ml/min/1.73m²
  affected?: 'left' | 'right' | 'bilateral' | null;
  stones?: boolean;
  descriptionAr: string;
}

export const KIDNEY_STATES: Record<KidneyStateId, KidneyState> = {
  normal: {
    id: 'normal',
    labelAr: 'طبيعي',
    labelEn: 'Normal',
    gfr: 105,
    descriptionAr: 'GFR ≥ ٩٠. وظيفة كلوية سليمة',
  },
  aki: {
    id: 'aki',
    labelAr: 'إصابة كلوية حادة',
    labelEn: 'Acute Kidney Injury',
    gfr: 25,
    affected: 'bilateral',
    descriptionAr: 'انخفاض حاد في GFR. حدد السبب: pre-renal / renal / post-renal',
  },
  ckd3: {
    id: 'ckd3',
    labelAr: 'قصور كلوي مزمن (٣)',
    labelEn: 'CKD Stage 3',
    gfr: 45,
    affected: 'bilateral',
    descriptionAr: 'GFR ٣٠-٥٩. تعديل جرعات + متابعة nephrology',
  },
  ckd5: {
    id: 'ckd5',
    labelAr: 'قصور كلوي (٥)',
    labelEn: 'CKD Stage 5',
    gfr: 12,
    affected: 'bilateral',
    descriptionAr: 'GFR < ١٥. مرحلة نهائية — يحتاج غسيل أو زراعة',
  },
  stones: {
    id: 'stones',
    labelAr: 'حصوات كلوية',
    labelEn: 'Renal Stones',
    gfr: 88,
    affected: 'right',
    stones: true,
    descriptionAr: 'ألم مغصي. GFR غالباً طبيعي. حجم الحصاة يحدد التدخل',
  },
};

export const KIDNEY_STATE_LIST = Object.values(KIDNEY_STATES);
