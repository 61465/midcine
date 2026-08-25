// Clinical calculators — trigger by slash-command in Findings field.
// Grammar from NEXUS prompt_engineer. All logic is pure JavaScript.
// Format: user types "/flei 8 solid high single" → inserts Fleischner recommendation.

export interface CalcInput {
  name: string;
  type: 'number' | 'enum' | 'boolean';
  values?: string[];
  min?: number;
  max?: number;
  label: string;
  default?: string | number | boolean;
}

export interface Calculator {
  id: string;
  label: string;
  trigger: string;
  inputs: CalcInput[];
  compute: (inputs: Record<string, any>) => string;
  example: string;
}

export const CALCULATORS: Calculator[] = [
  {
    id: 'fleischner',
    label: 'Fleischner 2017 · lung nodule',
    trigger: '/flei',
    inputs: [
      { name: 'size_mm', type: 'number', min: 1, max: 30, label: 'Nodule size (mm)' },
      {
        name: 'type',
        type: 'enum',
        values: ['solid', 'part-solid', 'ground-glass'],
        label: 'Nodule type',
        default: 'solid',
      },
      {
        name: 'risk',
        type: 'enum',
        values: ['low', 'high'],
        label: 'Patient risk',
        default: 'low',
      },
      {
        name: 'count',
        type: 'enum',
        values: ['single', 'multi'],
        label: 'Nodule count',
        default: 'single',
      },
    ],
    example: '/flei 8 solid high single',
    compute: (i) => {
      const size = Number(i.size_mm);
      const { type, risk, count } = i;
      if (type === 'solid') {
        if (size < 6)
          return risk === 'low'
            ? 'No routine follow-up recommended (Fleischner 2017).'
            : 'Follow-up CT at 12 months (Fleischner 2017).';
        if (size < 8)
          return risk === 'low'
            ? 'Follow-up CT at 12 months (Fleischner 2017).'
            : 'Follow-up CT at 6–12 months, then 18–24 months (Fleischner 2017).';
        if (size < 30)
          return 'Follow-up CT at 3 months, then 9 and 24 months. Consider PET/CT or biopsy for suspicious features (Fleischner 2017).';
        return 'Immediate evaluation for resection or biopsy (Fleischner 2017).';
      }
      if (type === 'part-solid') {
        if (size < 6) return 'Follow-up CT at 3–6 months, then 18–24 months (Fleischner 2017).';
        return 'Follow-up CT at 3 months, then 9 and 24 months. Consider PET/CT or biopsy (Fleischner 2017).';
      }
      // ground-glass
      if (size < 6)
        return count === 'single'
          ? 'No routine follow-up recommended (Fleischner 2017).'
          : 'Follow-up CT at 3–6 months, then 18–24 months (Fleischner 2017).';
      return 'Follow-up CT at 6–12 months, then 24 months. Consider PET/CT for persistent >10 mm (Fleischner 2017).';
    },
  },
  {
    id: 'birads',
    label: 'BI-RADS · mammography',
    trigger: '/birads',
    inputs: [
      {
        name: 'category',
        type: 'enum',
        values: ['0', '1', '2', '3', '4A', '4B', '4C', '5', '6'],
        label: 'BI-RADS category',
        default: '2',
      },
    ],
    example: '/birads 4B',
    compute: (i) => {
      const map: Record<string, string> = {
        '0': 'Incomplete — additional imaging and/or prior studies needed.',
        '1': 'Negative — continue routine screening.',
        '2': 'Benign finding(s) — continue routine screening.',
        '3': 'Probably benign — short-interval follow-up (6 months) recommended.',
        '4A': 'Low suspicion for malignancy — biopsy recommended.',
        '4B': 'Moderate suspicion for malignancy — biopsy recommended.',
        '4C': 'High suspicion for malignancy — biopsy recommended.',
        '5': 'Highly suggestive of malignancy — appropriate action should be taken.',
        '6': 'Known biopsy-proven malignancy — surgical management as indicated.',
      };
      return `BI-RADS Category ${i.category}: ${map[i.category] ?? '—'}`;
    },
  },
  {
    id: 'tirads',
    label: 'ACR TI-RADS · thyroid',
    trigger: '/tirads',
    inputs: [
      {
        name: 'composition',
        type: 'enum',
        values: ['cystic', 'spongiform', 'mixed', 'solid'],
        label: 'Composition',
        default: 'solid',
      },
      {
        name: 'echogenicity',
        type: 'enum',
        values: ['anechoic', 'hyperechoic', 'isoechoic', 'hypoechoic', 'very_hypoechoic'],
        label: 'Echogenicity',
        default: 'hypoechoic',
      },
      {
        name: 'shape',
        type: 'enum',
        values: ['wider', 'taller'],
        label: 'Shape (taller-than-wide?)',
        default: 'wider',
      },
      {
        name: 'margin',
        type: 'enum',
        values: ['smooth', 'ill-defined', 'lobulated', 'irregular', 'extra-thyroidal'],
        label: 'Margin',
        default: 'smooth',
      },
      {
        name: 'foci',
        type: 'enum',
        values: ['none', 'comet-tail', 'macro', 'peripheral', 'punctate'],
        label: 'Echogenic foci',
        default: 'none',
      },
    ],
    example: '/tirads solid hypoechoic taller irregular punctate',
    compute: (i) => {
      const p = {
        composition: { cystic: 0, spongiform: 0, mixed: 1, solid: 2 } as Record<string, number>,
        echogenicity: {
          anechoic: 0,
          hyperechoic: 1,
          isoechoic: 1,
          hypoechoic: 2,
          very_hypoechoic: 3,
        } as Record<string, number>,
        shape: { wider: 0, taller: 3 } as Record<string, number>,
        margin: {
          smooth: 0,
          'ill-defined': 0,
          lobulated: 2,
          irregular: 2,
          'extra-thyroidal': 3,
        } as Record<string, number>,
        foci: { none: 0, 'comet-tail': 0, macro: 1, peripheral: 2, punctate: 3 } as Record<
          string,
          number
        >,
      };
      const total =
        (p.composition[i.composition] ?? 0) +
        (p.echogenicity[i.echogenicity] ?? 0) +
        (p.shape[i.shape] ?? 0) +
        (p.margin[i.margin] ?? 0) +
        (p.foci[i.foci] ?? 0);
      let tr = 'TR1';
      let rec = '';
      if (total <= 1) {
        tr = 'TR1';
        rec = 'Benign — no FNA. Routine follow-up per clinical judgment.';
      } else if (total === 2) {
        tr = 'TR2';
        rec = 'Not suspicious — no FNA. Follow-up US in 1–2 years.';
      } else if (total === 3) {
        tr = 'TR3';
        rec = 'Mildly suspicious — FNA if ≥2.5 cm; follow-up if 1.5–2.5 cm.';
      } else if (total <= 6) {
        tr = 'TR4';
        rec = 'Moderately suspicious — FNA if ≥1.5 cm; follow-up if 1.0–1.5 cm.';
      } else {
        tr = 'TR5';
        rec = 'Highly suspicious — FNA if ≥1.0 cm; follow-up if 0.5–1.0 cm.';
      }
      return `ACR ${tr} (${total} points): ${rec}`;
    },
  },
  {
    id: 'lirads',
    label: 'LI-RADS 2018 · liver',
    trigger: '/lirads',
    inputs: [
      { name: 'size_mm', type: 'number', min: 5, max: 200, label: 'Lesion size (mm)' },
      { name: 'ape', type: 'boolean', label: 'APHE (arterial phase hyperenhancement)' },
      { name: 'washout', type: 'boolean', label: 'Non-peripheral washout' },
      { name: 'capsule', type: 'boolean', label: 'Enhancing capsule' },
      { name: 'growth', type: 'boolean', label: 'Threshold growth' },
    ],
    example: '/lirads 25 true true true false',
    compute: (i) => {
      const size = Number(i.size_mm);
      const ape = i.ape === true || i.ape === 'true';
      const wo = i.washout === true || i.washout === 'true';
      const cap = i.capsule === true || i.capsule === 'true';
      const grow = i.growth === true || i.growth === 'true';
      if (size >= 20 && ape && wo && cap) {
        return 'LR-5: definitely HCC. Recommend treatment or transplant evaluation.';
      }
      if (size >= 10 && ape && (wo || cap)) {
        return 'LR-4: probably HCC. Recommend biopsy or multidisciplinary review; repeat contrast-enhanced imaging in 3–6 months.';
      }
      if (grow) {
        return 'LR-3: intermediate probability (threshold growth). Repeat contrast-enhanced imaging in 3–6 months.';
      }
      if (size < 10 && !ape) {
        return 'LR-1: definitely benign. Continue routine surveillance.';
      }
      return 'LR-3: intermediate probability of HCC. Repeat contrast-enhanced imaging in 3–6 months.';
    },
  },
  {
    id: 'pirads',
    label: 'PI-RADS v2.1 · prostate',
    trigger: '/pirads',
    inputs: [
      { name: 'zone', type: 'enum', values: ['PZ', 'TZ'], label: 'Dominant zone', default: 'PZ' },
      { name: 'primary', type: 'number', min: 1, max: 5, label: 'Primary sequence score' },
      { name: 'secondary', type: 'number', min: 1, max: 5, label: 'Secondary sequence score' },
    ],
    example: '/pirads PZ 4 3',
    compute: (i) => {
      const primary = Number(i.primary);
      const secondary = Number(i.secondary);
      let score = primary;
      if (i.zone === 'PZ' && primary === 3 && secondary >= 2) score = 4;
      if (i.zone === 'TZ' && primary === 3 && secondary === 5) score = 4;
      const map: Record<number, string> = {
        1: 'Clinically significant cancer highly unlikely — routine screening.',
        2: 'Clinically significant cancer unlikely — routine screening.',
        3: 'Equivocal — consider targeted biopsy or short-interval MRI.',
        4: 'Clinically significant cancer likely — targeted biopsy recommended.',
        5: 'Clinically significant cancer highly likely — targeted + systematic biopsy.',
      };
      return `PI-RADS v2.1 Overall ${score} (${i.zone}, primary ${primary}, secondary ${secondary}): ${map[score] ?? '—'}`;
    },
  },
];

// Parse "/trigger arg1 arg2 arg3 ..." → { calc, values }
export function parseSlashCommand(text: string): {
  calc: Calculator;
  values: Record<string, any>;
} | null {
  const t = text.trim();
  if (!t.startsWith('/')) return null;
  const parts = t.split(/\s+/);
  const trigger = parts[0]!.toLowerCase();
  const calc = CALCULATORS.find((c) => c.trigger === trigger);
  if (!calc) return null;
  const values: Record<string, any> = {};
  for (let i = 0; i < calc.inputs.length; i++) {
    const input = calc.inputs[i]!;
    const raw = parts[i + 1];
    if (raw === undefined) {
      values[input.name] = input.default ?? '';
    } else if (input.type === 'number') {
      values[input.name] = Number(raw);
    } else if (input.type === 'boolean') {
      values[input.name] = raw === 'true' || raw === '1' || raw === 'yes';
    } else {
      values[input.name] = raw;
    }
  }
  return { calc, values };
}

export function runCalculator(text: string): string | null {
  const parsed = parseSlashCommand(text);
  if (!parsed) return null;
  try {
    return parsed.calc.compute(parsed.values);
  } catch {
    return null;
  }
}
