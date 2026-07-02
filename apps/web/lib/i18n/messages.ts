import type { Locale } from './index';

// Every UI string flows through this table. Adding a new string = add both AR + EN.
// TypeScript ensures completeness via MessageKey.

const AR = {
  'app.name': 'midcine',
  'app.tagline': 'منصّة أشعة عربية أصلية · edge-first · ensemble AI',

  'nav.home': 'الرئيسية',
  'nav.worklist': 'قائمة العمل',
  'nav.reader': 'القارئ',
  'nav.patient': 'المريض',
  'nav.anatomy': 'أطلس الأمراض',
  'nav.insights': 'الرؤى',
  'nav.connect': 'الاتصال',
  'nav.console': 'الإعدادات',
  'nav.mobile': 'الموبايل',

  'action.sign': 'توقيع',
  'action.save': 'حفظ',
  'action.send': 'إرسال',
  'action.send_to_doctor': 'إرسال للطبيب المُحيل',
  'action.send_to_patient': 'إرسال للمريض',
  'action.print': 'طباعة',
  'action.print_for_patient': 'مطبوعة للمريض',
  'action.cancel': 'إلغاء',
  'action.confirm': 'تأكيد',
  'action.open': 'فتح',
  'action.upload': 'رفع',
  'action.retry': 'إعادة المحاولة',
  'action.regenerate': 'إعادة التوليد',
  'action.filter': 'تصفية',
  'action.search': 'بحث',
  'action.details': 'تفاصيل',

  'status.pending': 'قيد الانتظار',
  'status.in_progress': 'قيد القراءة',
  'status.read': 'مقروء',
  'status.signed': 'موقّع',
  'status.delivered': 'تم التسليم',
  'status.queued': 'في القائمة',

  'priority.p1': 'P1 · طوارئ',
  'priority.p2': 'P2 · عاجل',
  'priority.p3': 'P3 · روتيني',
  'priority.p4': 'P4 · متأخر',
  'priority.p5': 'P5 · متابعة',

  'severity.normal': 'طبيعي',
  'severity.moderate': 'متوسط',
  'severity.severe': 'شديد',
  'severity.emergency': 'طوارئ',

  'report.section.patient': 'بيانات المريض',
  'report.section.technique': 'تقنية الفحص',
  'report.section.findings': 'الموجودات',
  'report.section.impression': 'الانطباع',
  'report.section.recommendations': 'التوصيات',
  'report.official_stamp': 'تقرير أشعة رسمي',
  'report.footer_ai': 'أُنشئ هذا التقرير بمساعدة NEXUS AI Ensemble وراجعه طبيب مختصّ ووقّعه.',

  'reader.dicom_viewer': 'عارض DICOM',
  'reader.ai_ensemble': 'الذكاء الاصطناعي',
  'reader.report_draft': 'التقرير',
  'reader.consensus': 'إجماع',
  'reader.latency': 'زمن الاستجابة',
  'reader.needs_review': 'مراجعة بشرية',
  'reader.auto_ready': 'جاهز تلقائياً',
  'reader.atlas_matches': 'حالات مطابقة من الأطلس',

  'empty.no_studies.title': 'لا توجد دراسات بعد',
  'empty.no_studies.desc':
    'الدراسات ستظهر هنا بمجرد اتصال Orthanc/PACS المشفى، أو رفع ملف DICOM يدوياً.',
  'empty.no_studies.hint':
    'خطوة أولى: من الإعدادات → التكاملات، وصّل عنوان Orthanc عبر DICOM C-STORE :11113 AET=MIDCINE',
  'empty.no_patient.title': 'المريض غير موجود في السجلات',
  'empty.no_patient.desc': 'لا يوجد سجلّ لهذا الرقم في قاعدة البيانات المحلية.',
  'empty.no_messages.title': 'لا رسائل بعد',
  'empty.no_messages.desc':
    'الرسائل تظهر هنا بمجرد أن يوقّع الطبيب تقريراً ويرسله عبر WhatsApp من صفحة القارئ.',
  'empty.no_audit.title': 'لا نشاط بعد',
  'empty.no_audit.desc': 'كل عملية على النظام (توليد/توقيع/إرسال) تُسجَّل هنا تلقائياً.',
  'empty.no_users.title': 'لم يُضَف أي مستخدم',
  'empty.no_users.desc':
    'أضف حسابات المستخدمين (أطباء الأشعة، الفنيّون، الإدارة) من "إضافة مستخدم".',
  'empty.no_alerts.title': 'لا تنبيهات حرجة',
  'empty.no_alerts.desc': 'الحالات ذات الأولوية P1/P2 ستظهر هنا فور وصولها.',

  'kpi.today_studies': 'دراسات اليوم',
  'kpi.signed_today': 'تقارير موقّعة',
  'kpi.avg_consensus': 'متوسط الإجماع',
  'kpi.avg_latency': 'متوسط زمن AI',
  'kpi.critical_caught': 'حالات طوارئ رُصدت',
  'kpi.patients': 'مرضى',
  'kpi.whatsapp_sent': 'رسائل مُرسلة',
  'kpi.pending': 'في الانتظار',

  'hero.title.pre': 'منصّة الإشعاع',
  'hero.title.highlight': 'الفاخرة',
  'hero.title.post': 'للطبيب العربي',
  'hero.subtitle':
    'تطبيق واحد بـ ٧ مسارات، عقل ensemble من ٤ نماذج NEXUS-AI، وأمن edge-first لا يغادر مشفاك.',
  'hero.cta_primary': 'ابدأ قائمة العمل',
  'hero.cta_secondary': 'أطلس الأمراض',

  'trust.ensemble': 'ذكاء ensemble',
  'trust.ensemble.desc': '٤ وكلاء AI بالتوازي مع تحقّق متبادل',
  'trust.edge': 'أمن edge-first',
  'trust.edge.desc': 'DICOM لا يغادر المشفى إطلاقاً',
  'trust.fhir': 'FHIR R4 جاهز',
  'trust.fhir.desc': 'تكامل EMR/HIS خلال أسبوع',
  'trust.rtl': 'RTL أصلي',
  'trust.rtl.desc': 'صُمّم للطبيب العربي، لا ترجمة',

  'philosophy.title': 'نتفوّق بالاختلاف، لا بالتقليد.',
  'philosophy.desc':
    '٦ مبادئ تحكم كل قرار: NEXUS = العقل، أمن لا يقيّد الإبداع، لا تقليد، ensemble في كل طبقة، استغلال ما تتجنّبه الأنظمة الكبيرة، وويب أولاً.',

  'connect.mode.mock': 'محاكاة محلية',
  'connect.mode.production': 'إنتاج',
  'connect.integration.orthanc': 'خادم Orthanc PACS',
  'connect.integration.hl7': 'HL7 v2 RIS',
  'connect.integration.fhir': 'FHIR R4 Gateway',
  'connect.integration.whatsapp': 'WhatsApp Bridge',
  'connect.integration.ai': 'NEXUS AI backend',
  'connect.integration.backup': 'النسخ الاحتياطي',

  'compare.title': 'مقارنة سريعة',
  'compare.midcine': 'midcine',
  'compare.aidoc': 'Aidoc/Rad AI',
  'compare.feature.arabic': 'تقارير عربية أصلية',
  'compare.feature.edge': 'DICOM على السحاب',
  'compare.feature.whatsapp': 'إرسال WhatsApp',
  'compare.feature.atlas': 'أطلس مرضي بصري',
  'compare.feature.ensemble': 'ensemble ٤ نماذج',
  'compare.feature.price': 'التسعير',
  'compare.yes': 'نعم',
  'compare.no': 'لا',
  'compare.cloud_only': 'سحاب فقط',
} as const;

type Keys = keyof typeof AR;

const EN: Record<Keys, string> = {
  'app.name': 'midcine',
  'app.tagline': 'Arabic-native radiology platform · edge-first · ensemble AI',

  'nav.home': 'Home',
  'nav.worklist': 'Worklist',
  'nav.reader': 'Reader',
  'nav.patient': 'Patient',
  'nav.anatomy': 'Pathology atlas',
  'nav.insights': 'Insights',
  'nav.connect': 'Connect',
  'nav.console': 'Settings',
  'nav.mobile': 'Mobile',

  'action.sign': 'Sign',
  'action.save': 'Save',
  'action.send': 'Send',
  'action.send_to_doctor': 'Send to referrer',
  'action.send_to_patient': 'Send to patient',
  'action.print': 'Print',
  'action.print_for_patient': 'Patient printout',
  'action.cancel': 'Cancel',
  'action.confirm': 'Confirm',
  'action.open': 'Open',
  'action.upload': 'Upload',
  'action.retry': 'Retry',
  'action.regenerate': 'Regenerate',
  'action.filter': 'Filter',
  'action.search': 'Search',
  'action.details': 'Details',

  'status.pending': 'Pending',
  'status.in_progress': 'In progress',
  'status.read': 'Read',
  'status.signed': 'Signed',
  'status.delivered': 'Delivered',
  'status.queued': 'Queued',

  'priority.p1': 'P1 · Critical',
  'priority.p2': 'P2 · Urgent',
  'priority.p3': 'P3 · Routine',
  'priority.p4': 'P4 · Delayed',
  'priority.p5': 'P5 · Follow-up',

  'severity.normal': 'Normal',
  'severity.moderate': 'Moderate',
  'severity.severe': 'Severe',
  'severity.emergency': 'Emergency',

  'report.section.patient': 'Patient information',
  'report.section.technique': 'Technique',
  'report.section.findings': 'Findings',
  'report.section.impression': 'Impression',
  'report.section.recommendations': 'Recommendations',
  'report.official_stamp': 'Official radiology report',
  'report.footer_ai':
    'This report was drafted with NEXUS AI Ensemble and reviewed & signed by a licensed radiologist.',

  'reader.dicom_viewer': 'DICOM viewer',
  'reader.ai_ensemble': 'AI ensemble',
  'reader.report_draft': 'Report',
  'reader.consensus': 'Consensus',
  'reader.latency': 'Latency',
  'reader.needs_review': 'Human review',
  'reader.auto_ready': 'Auto-approved',
  'reader.atlas_matches': 'Matching atlas cases',

  'empty.no_studies.title': 'No studies yet',
  'empty.no_studies.desc':
    'Studies will appear here once your hospital Orthanc/PACS is connected, or a DICOM file is uploaded manually.',
  'empty.no_studies.hint':
    'First step: Settings → Integrations, wire your Orthanc endpoint via DICOM C-STORE :11113 AET=MIDCINE',
  'empty.no_patient.title': 'Patient not in registry',
  'empty.no_patient.desc': 'No record exists for this ID in the local database.',
  'empty.no_messages.title': 'No messages yet',
  'empty.no_messages.desc':
    'Messages appear once a radiologist signs a report and sends it via WhatsApp from the reader page.',
  'empty.no_audit.title': 'No activity yet',
  'empty.no_audit.desc': 'Every system action (generate/sign/send) is auto-logged here.',
  'empty.no_users.title': 'No users added',
  'empty.no_users.desc':
    'Add user accounts (radiologists, technicians, administration) via "Add user".',
  'empty.no_alerts.title': 'No critical alerts',
  'empty.no_alerts.desc': 'P1/P2 priority cases will surface here immediately when they arrive.',

  'kpi.today_studies': 'Studies today',
  'kpi.signed_today': 'Reports signed',
  'kpi.avg_consensus': 'Avg consensus',
  'kpi.avg_latency': 'Avg AI latency',
  'kpi.critical_caught': 'Critical caught',
  'kpi.patients': 'Patients',
  'kpi.whatsapp_sent': 'WhatsApp sent',
  'kpi.pending': 'Pending',

  'hero.title.pre': 'Luxury radiology',
  'hero.title.highlight': 'built for',
  'hero.title.post': 'the Arabic-speaking clinician',
  'hero.subtitle':
    'One app · 7 routes · a 4-agent NEXUS ensemble brain · edge-first security. Your DICOM never leaves the hospital.',
  'hero.cta_primary': 'Open worklist',
  'hero.cta_secondary': 'Pathology atlas',

  'trust.ensemble': 'Ensemble intelligence',
  'trust.ensemble.desc': '4 AI agents in parallel with cross-verification',
  'trust.edge': 'Edge-first security',
  'trust.edge.desc': 'DICOM never leaves your hospital',
  'trust.fhir': 'FHIR R4 ready',
  'trust.fhir.desc': 'EMR/HIS integration within a week',
  'trust.rtl': 'Native Arabic',
  'trust.rtl.desc': 'RTL from the ground up, not a translation',

  'philosophy.title': 'We win by being different, not by copying.',
  'philosophy.desc':
    '6 principles govern every decision: NEXUS is the brain, security-as-enabler, no imitation, ensemble everywhere, inherit what legacy avoids, web-first.',

  'connect.mode.mock': 'Local mock',
  'connect.mode.production': 'Production',
  'connect.integration.orthanc': 'Orthanc PACS server',
  'connect.integration.hl7': 'HL7 v2 RIS',
  'connect.integration.fhir': 'FHIR R4 gateway',
  'connect.integration.whatsapp': 'WhatsApp bridge',
  'connect.integration.ai': 'NEXUS AI backend',
  'connect.integration.backup': 'Backup service',

  'compare.title': 'Quick comparison',
  'compare.midcine': 'midcine',
  'compare.aidoc': 'Aidoc / Rad AI',
  'compare.feature.arabic': 'Native Arabic reports',
  'compare.feature.edge': 'DICOM in the cloud',
  'compare.feature.whatsapp': 'WhatsApp delivery',
  'compare.feature.atlas': 'Visual pathology atlas',
  'compare.feature.ensemble': '4-model ensemble',
  'compare.feature.price': 'Pricing',
  'compare.yes': 'Yes',
  'compare.no': 'No',
  'compare.cloud_only': 'Cloud only',
};

export type MessageKey = Keys;
export const MESSAGES: Record<Locale, Record<Keys, string>> = { ar: AR, en: EN };
