// Radiology report templates — snippet insertion library (English-only).
// Typing shortcuts like `.n` in the editor expand to a template.
// Each template is a discrete building block, not a whole report.

export interface Snippet {
  id: string;
  trigger: string; // typed shortcut e.g. ".n" ".ch"
  label_ar: string; // kept for backwards compatibility — mirrors label_en
  label_en: string;
  section: 'findings' | 'impression' | 'recommendations' | 'technique';
  body_ar: string; // kept for backwards compatibility — English content
  modality?: string[];
  bodyPart?: string[];
}

export const SNIPPETS: Snippet[] = [
  // ─── Normal templates ────────────────────────────────────────
  {
    id: 'ct-brain-normal',
    trigger: '.brainok',
    label_ar: 'CT brain normal',
    label_en: 'CT brain normal',
    section: 'findings',
    modality: ['CT'],
    bodyPart: ['BRAIN'],
    body_ar:
      'The cerebral hemispheres and cerebellum are intact. No acute hemorrhage or infarction. Ventricular system normal in size and configuration. No midline shift. No subarachnoid or intraventricular hemorrhage. Paranasal sinuses are clear.',
  },
  {
    id: 'ct-chest-normal',
    trigger: '.chestok',
    label_ar: 'CT chest normal',
    label_en: 'CT chest normal',
    section: 'findings',
    modality: ['CT'],
    bodyPart: ['CHEST'],
    body_ar:
      'Lungs are well expanded with no infiltrate or consolidation. No pleural effusion. Central airways patent. Mediastinum is normal in size. Heart is normal in size and configuration. No pathological lymphadenopathy. Chest wall is intact.',
  },
  {
    id: 'mr-brain-normal',
    trigger: '.mrbrainok',
    label_ar: 'MR brain normal',
    label_en: 'MR brain normal',
    section: 'findings',
    modality: ['MR'],
    bodyPart: ['BRAIN'],
    body_ar:
      'Gray and white matter show normal signal on T1, T2, and FLAIR sequences. No focal signal abnormality or restricted diffusion on DWI. Ventricular system is normal. Midline structures are central. Brainstem and cerebellum are unremarkable.',
  },
  {
    id: 'cxr-normal',
    trigger: '.cxrok',
    label_ar: 'CXR normal',
    label_en: 'CXR normal',
    section: 'findings',
    modality: ['CR', 'DR'],
    bodyPart: ['CHEST'],
    body_ar:
      'Lungs are clear with no infiltrate or consolidation. Costophrenic angles are sharp; no pleural effusion. Heart is normal in size. Mediastinum is normal. Chest wall and visible osseous structures are intact.',
  },

  // ─── Impression templates ─────────────────────────────────────
  {
    id: 'impression-normal',
    trigger: '.impok',
    label_ar: 'Impression: normal',
    label_en: 'Impression: normal',
    section: 'impression',
    body_ar: 'Examination is within normal limits. No acute pathological findings.',
  },
  {
    id: 'impression-followup',
    trigger: '.impfu',
    label_ar: 'Impression: follow-up advised',
    label_en: 'Impression: follow-up advised',
    section: 'impression',
    body_ar:
      'Findings are stable compared to prior study. Follow-up advised as clinically indicated.',
  },

  // ─── Recommendations ─────────────────────────────────────────
  {
    id: 'rec-mri-followup',
    trigger: '.rmri',
    label_ar: 'Rec: MRI follow-up',
    label_en: 'Rec: MRI follow-up',
    section: 'recommendations',
    body_ar: 'Contrast-enhanced MRI in 3–6 months recommended for follow-up.',
  },
  {
    id: 'rec-clinical',
    trigger: '.rclin',
    label_ar: 'Rec: clinical correlation',
    label_en: 'Rec: clinical correlation',
    section: 'recommendations',
    body_ar:
      'Clinical and laboratory correlation is recommended to interpret findings in the appropriate clinical context.',
  },

  // ─── Technique blocks ────────────────────────────────────────
  {
    id: 'tech-ct-nc',
    trigger: '.tct',
    label_ar: 'Technique: non-contrast CT',
    label_en: 'Technique: non-contrast CT',
    section: 'technique',
    modality: ['CT'],
    body_ar:
      'Non-contrast CT with 5 mm contiguous slices and high-resolution reconstructions.',
  },
  {
    id: 'tech-ct-c',
    trigger: '.tctc',
    label_ar: 'Technique: contrast CT',
    label_en: 'Technique: contrast CT',
    section: 'technique',
    modality: ['CT'],
    body_ar:
      'Contrast-enhanced CT with intravenous iohexol 300 (90 mL) in arterial and venous phases.',
  },
];

export function findSnippetByTrigger(text: string): Snippet | null {
  const candidates = SNIPPETS.filter((s) => text.endsWith(s.trigger));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.trigger.length - a.trigger.length);
  return candidates[0]!;
}

export function snippetsForContext(
  section: Snippet['section'],
  modality?: string,
  bodyPart?: string,
): Snippet[] {
  return SNIPPETS.filter((s) => {
    if (s.section !== section) return false;
    if (modality && s.modality && !s.modality.includes(modality)) return false;
    if (bodyPart && s.bodyPart && !s.bodyPart.includes(bodyPart)) return false;
    return true;
  });
}
