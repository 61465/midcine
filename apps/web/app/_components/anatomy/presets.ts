// Shared heart rhythm presets — used by the 3D model, ECG waveform, SVG chambers,
// and any downstream simulation (BioDigital hint, VTK placeholder).

export type RhythmId = 'normal' | 'bradycardia' | 'tachycardia' | 'afib' | 'stemi';

export interface Rhythm {
  id: RhythmId;
  labelAr: string;
  labelEn: string;
  bpm: number; // baseline BPM (may be overridden by slider)
  irregular: boolean; // true = jittered RR intervals
  stElevation: number; // mm — ST segment elevation in ECG (0 = normal)
  paralyzedRegion?: 'anterior' | 'inferior' | null; // for STEMI 3D dimming
  descriptionAr: string;
}

export const RHYTHMS: Record<RhythmId, Rhythm> = {
  normal: {
    id: 'normal',
    labelAr: 'طبيعي',
    labelEn: 'Sinus Rhythm',
    bpm: 72,
    irregular: false,
    stElevation: 0,
    descriptionAr: 'نبض جيوبي منتظم، معدل ٦٠-١٠٠ ن/د، موجات P-QRS-T كاملة',
  },
  bradycardia: {
    id: 'bradycardia',
    labelAr: 'بطء نبض',
    labelEn: 'Bradycardia',
    bpm: 45,
    irregular: false,
    stElevation: 0,
    descriptionAr: 'أقل من ٦٠ ن/د. قد يحتاج pacemaker إن مصحوباً بأعراض',
  },
  tachycardia: {
    id: 'tachycardia',
    labelAr: 'تسرّع نبض',
    labelEn: 'Tachycardia',
    bpm: 130,
    irregular: false,
    stElevation: 0,
    descriptionAr: 'أكثر من ١٠٠ ن/د. قد يكون sinus tachycardia أو SVT',
  },
  afib: {
    id: 'afib',
    labelAr: 'رجفان أذيني',
    labelEn: 'Atrial Fibrillation',
    bpm: 95,
    irregular: true,
    stElevation: 0,
    descriptionAr: 'RR غير منتظم، اختفاء موجات P. خطر جلطة — يحتاج تخثير',
  },
  stemi: {
    id: 'stemi',
    labelAr: 'احتشاء ST مرتفع',
    labelEn: 'STEMI',
    bpm: 88,
    irregular: false,
    stElevation: 3,
    paralyzedRegion: 'anterior',
    descriptionAr: 'ارتفاع ST — انسداد شريان تاجي. طوارئ! PCI خلال ٩٠ دقيقة',
  },
};

export const RHYTHM_LIST: Rhythm[] = Object.values(RHYTHMS);
