export type BrainStateId = 'normal' | 'seizure' | 'stroke_l' | 'stroke_r' | 'coma';

export interface BrainState {
  id: BrainStateId;
  labelAr: string;
  labelEn: string;
  dominantFreq: number; // Hz — dominant EEG rhythm
  spikes: boolean; // sharp/spike-wave discharges
  affectedHemisphere?: 'left' | 'right' | null;
  descriptionAr: string;
}

export const BRAIN_STATES: Record<BrainStateId, BrainState> = {
  normal: {
    id: 'normal',
    labelAr: 'طبيعي (alpha)',
    labelEn: 'Awake, eyes closed',
    dominantFreq: 10,
    spikes: false,
    descriptionAr: 'إيقاع alpha ٨-١٣ هرتز، متناسق في الجانبين',
  },
  seizure: {
    id: 'seizure',
    labelAr: 'نوبة صرع',
    labelEn: 'Generalized Seizure',
    dominantFreq: 3,
    spikes: true,
    descriptionAr: 'spike-wave سريع ومنتشر. طوارئ — ابدأ benzodiazepine',
  },
  stroke_l: {
    id: 'stroke_l',
    labelAr: 'سكتة يسرى',
    labelEn: 'Left MCA Stroke',
    dominantFreq: 6,
    spikes: false,
    affectedHemisphere: 'left',
    descriptionAr: 'تباطؤ delta أحادي الجانب. زمن حرج — CT + tPA',
  },
  stroke_r: {
    id: 'stroke_r',
    labelAr: 'سكتة يمنى',
    labelEn: 'Right MCA Stroke',
    dominantFreq: 6,
    spikes: false,
    affectedHemisphere: 'right',
    descriptionAr: 'تباطؤ delta أحادي الجانب. زمن حرج — CT + tPA',
  },
  coma: {
    id: 'coma',
    labelAr: 'غيبوبة',
    labelEn: 'Coma',
    dominantFreq: 1.5,
    spikes: false,
    descriptionAr: 'delta بطيء منتشر. قيّم GCS + استبعد أسباب معكوسة',
  },
};

export const BRAIN_STATE_LIST = Object.values(BRAIN_STATES);
