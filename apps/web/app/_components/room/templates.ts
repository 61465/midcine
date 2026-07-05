// Radiology report templates — snippet insertion library.
// Typing shortcuts like `.n` in the editor expands to normal template.
// Each template is a discrete building block, not a whole report.
// Radiologists can compose them with voice dictation.

export interface Snippet {
  id: string;
  trigger: string; // typed shortcut e.g. ".n" ".ch"
  label_ar: string;
  label_en: string;
  section: 'findings' | 'impression' | 'recommendations' | 'technique';
  body_ar: string;
  modality?: string[]; // e.g. ['CT', 'MR'] to filter by study
  bodyPart?: string[];
}

export const SNIPPETS: Snippet[] = [
  // ─── Normal templates ────────────────────────────────────────
  {
    id: 'ct-brain-normal',
    trigger: '.brainok',
    label_ar: 'CT دماغ طبيعي',
    label_en: 'CT brain normal',
    section: 'findings',
    modality: ['CT'],
    bodyPart: ['BRAIN'],
    body_ar:
      'الفصوص الدماغية والمخيخ سليمة. لا نزيف أو احتشاء حاد. الأنظمة البطينية طبيعية الحجم والشكل. الوصلات الوسطى غير منزاحة. لا نزيف تحت العنكبوتي أو داخل البطينات. الجيوب حول الأنف نظيفة.',
  },
  {
    id: 'ct-chest-normal',
    trigger: '.chestok',
    label_ar: 'CT صدر طبيعي',
    label_en: 'CT chest normal',
    section: 'findings',
    modality: ['CT'],
    bodyPart: ['CHEST'],
    body_ar:
      'الرئتان متمددتان جيداً بلا ارتشاح أو تكثّف. لا انصباب جنبي. القصبات مركزية. المنصف طبيعي الحجم. القلب طبيعي الشكل والحجم. لا تضخم غدد ليمفاوية مرضية. الجدار الصدري سليم.',
  },
  {
    id: 'mr-brain-normal',
    trigger: '.mrbrainok',
    label_ar: 'MR دماغ طبيعي',
    label_en: 'MR brain normal',
    section: 'findings',
    modality: ['MR'],
    bodyPart: ['BRAIN'],
    body_ar:
      'المادة الرمادية والبيضاء طبيعية الإشارة على تسلسلات T1, T2, FLAIR. لا آفات كثيفة الإشارة أو محدودة الانتشار على DWI. الأنظمة البطينية طبيعية. الوصلات الوسطى مركزية. الجذع الدماغي والمخيخ سليمان.',
  },
  {
    id: 'cxr-normal',
    trigger: '.cxrok',
    label_ar: 'أشعة صدر طبيعية',
    label_en: 'CXR normal',
    section: 'findings',
    modality: ['CR', 'DR'],
    bodyPart: ['CHEST'],
    body_ar:
      'الرئتان صافيتان بلا ارتشاح أو تكثّف. زوايا الحجاب الحاجز حادّة، لا انصباب جنبي. القلب طبيعي الحجم. المنصف طبيعي. الجدار الصدري والعظام الظاهرة سليمة.',
  },

  // ─── Impression templates ─────────────────────────────────────
  {
    id: 'impression-normal',
    trigger: '.impok',
    label_ar: 'انطباع: طبيعي',
    label_en: 'Impression: normal',
    section: 'impression',
    body_ar: 'الفحص ضمن الحدود الطبيعية. لا نتائج مرضية حادّة.',
  },
  {
    id: 'impression-followup',
    trigger: '.impfu',
    label_ar: 'انطباع: يُنصح بالمتابعة',
    label_en: 'Impression: follow-up advised',
    section: 'impression',
    body_ar: 'النتائج مستقرّة مقارنة بالفحص السابق. يُنصح بالمتابعة عند الحاجة الإكلينيكية.',
  },

  // ─── Recommendations ─────────────────────────────────────────
  {
    id: 'rec-mri-followup',
    trigger: '.rmri',
    label_ar: 'توصية: MRI متابعة',
    label_en: 'Rec: MRI follow-up',
    section: 'recommendations',
    body_ar: 'يُنصح بإجراء رنين مغناطيسي مع تباين خلال 3-6 أشهر للمتابعة.',
  },
  {
    id: 'rec-clinical',
    trigger: '.rclin',
    label_ar: 'توصية: مراجعة إكلينيكية',
    label_en: 'Rec: clinical correlation',
    section: 'recommendations',
    body_ar: 'يُنصح بالربط الإكلينيكي والمخبري لتفسير النتائج بالسياق المرضي.',
  },

  // ─── Technique blocks ────────────────────────────────────────
  {
    id: 'tech-ct-nc',
    trigger: '.tct',
    label_ar: 'تقنية: CT بدون تباين',
    label_en: 'Technique: non-contrast CT',
    section: 'technique',
    modality: ['CT'],
    body_ar: 'تصوير مقطعي محوسب بدون تباين، شرائح متجاورة بسماكة 5 ملم مع إعادة تشكيل عالي الدقة.',
  },
  {
    id: 'tech-ct-c',
    trigger: '.tctc',
    label_ar: 'تقنية: CT مع تباين',
    label_en: 'Technique: contrast CT',
    section: 'technique',
    modality: ['CT'],
    body_ar:
      'تصوير مقطعي محوسب مع حقن مادة تباين وريدية (90 مل، iohexol 300)، مراحل شريانية ووريدية.',
  },
];

export function findSnippetByTrigger(text: string): Snippet | null {
  // Find longest matching trigger at end of string
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
