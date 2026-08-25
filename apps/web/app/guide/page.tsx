'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ArrowLeft, AlertTriangle, Rocket, Shield, Lock, Upload,
  FileCheck, FileX, Play, Palette, RotateCw, ShieldCheck, Box, Volume2,
  ChevronRight, Info, HardDrive, Zap, MessageSquare, FileText, RefreshCw,
  Wifi, WifiOff, Eye, Globe,
} from 'lucide-react';

type Lang = 'en' | 'ar';

// ─── Translation dictionary ─────────────────────────────────────────────

const T = {
  // Header
  home: { en: 'Home', ar: 'الرئيسية' },
  version: { en: 'midcine v1.1 — User Guide', ar: 'midcine الإصدار 1.1 — دليل المستخدم' },
  openRoom: { en: 'Reading Room', ar: 'غرفة القراءة' },
  langToggle: { en: 'العربية', ar: 'English' },
  toc: { en: 'Table of contents', ar: 'قائمة المحتويات' },

  // Hero
  heroTitle: { en: 'midcine — User Guide', ar: 'midcine — دليل المستخدم' },
  heroSub: {
    en: 'Everything you need to use the platform correctly. Start with "What files to upload" — most problems come from uploading wrong data.',
    ar: 'كل ما تحتاج لاستخدام المنصة بشكل صحيح. ابدأ بقسم "الملفات المسموح رفعها" — معظم المشاكل تحدث من رفع بيانات خاطئة.',
  },

  // Sections index
  sections: [
    { id: 'quickstart', en: '⚡ Quick start (60 seconds)',           ar: '⚡ البداية السريعة (60 ثانية)' },
    { id: 'upload',     en: '📤 What files to upload (READ FIRST)',  ar: '📤 الملفات المسموح رفعها (اقرأ أولاً)' },
    { id: 'room',       en: '🏥 Reading Room — your workspace',      ar: '🏥 غرفة القراءة — مساحة عملك' },
    { id: 'viewer',     en: '🔍 Pro DICOM Viewer (MPR + 3D)',        ar: '🔍 عارض DICOM الاحترافي (MPR + 3D)' },
    { id: 'case-story', en: '🎬 Case Story — 3D educational player', ar: '🎬 قصة الحالة — مشغل تعليمي ثلاثي الأبعاد' },
    { id: 'ai-analyze', en: '🧠 AI Analysis — how it works',         ar: '🧠 تحليل الذكاء الاصطناعي — كيف يعمل' },
    { id: 'second-op',  en: '🛡️ NEXUS Second Opinion (3-agent review)', ar: '🛡️ الرأي الثاني NEXUS (مراجعة من 3 وكلاء)' },
    { id: 'report',     en: '📝 Writing & signing reports',          ar: '📝 كتابة وتوقيع التقارير' },
    { id: 'cache',      en: '💾 Cache & offline (weak internet)',    ar: '💾 التخزين والعمل بلا اتصال (إنترنت ضعيف)' },
    { id: 'safety',     en: '🔒 Data isolation & privacy',           ar: '🔒 عزل البيانات والخصوصية' },
    { id: 'limits',     en: '⚠️ Known limits — what NOT to expect',   ar: '⚠️ الحدود المعروفة — ما يجب ألا تتوقعه' },
    { id: 'faq',        en: '❓ FAQ + troubleshooting',              ar: '❓ الأسئلة الشائعة + حل المشاكل' },
  ] as const,

  // Quick Start
  qsIntro: { en: '', ar: '' },
  qsSteps: [
    { en: 'Open Reading Room', ar: 'افتح غرفة القراءة' },
    { en: 'Pick a patient from the left worklist (5 real cases loaded: Hanan, Aliaa, Ahmed, Test3, joun)', ar: 'اختر مريضاً من القائمة اليسرى (5 حالات حقيقية: حنان، عليا، أحمد، Test3، joun)' },
    { en: 'AI runs automatically → Findings and Impression appear in English', ar: 'الذكاء الاصطناعي يعمل تلقائياً → تظهر النتائج والانطباع بالإنجليزية' },
    { en: 'Click Pro Viewer (MPR) to see the images in 3-plane view', ar: 'اضغط "Pro Viewer (MPR)" لرؤية الصور بعرض ثلاثي المستويات' },
    { en: 'Click Case Story (3D) to see the case as an educational 3D video', ar: 'اضغط "Case Story (3D)" لرؤية الحالة كفيديو تعليمي ثلاثي الأبعاد' },
    { en: 'Click NEXUS Second Opinion before signing to cross-verify', ar: 'اضغط "NEXUS Second Opinion" قبل التوقيع للتحقق المتقاطع' },
    { en: 'Ship report → sign → WhatsApp send. Done.', ar: 'أرسل التقرير → وقّع → أرسل عبر واتساب. انتهى.' },
  ],

  // Upload
  uploadWarn: {
    en: 'Most failures come from wrong-file uploads. Follow these rules exactly.',
    ar: 'معظم حالات الفشل ناتجة عن رفع ملفات خاطئة. اتبع هذه القواعد بدقة.',
  },
  accepted: { en: '✅ ACCEPTED', ar: '✅ مسموح' },
  rejected: { en: '❌ DO NOT UPLOAD', ar: '❌ لا ترفع' },
  acceptedList: [
    { en: 'DICOM files — .dcm / .ima / .IMA (real medical images from a scanner)', ar: 'ملفات DICOM — .dcm / .ima / .IMA (صور طبية حقيقية من جهاز الأشعة)' },
    { en: 'DICOM ZIP — a .zip containing all slices of a study, exported from PACS', ar: 'ملف ZIP لـ DICOM — يحوي كل شرائح الدراسة، مُصدَّر من PACS' },
    { en: 'Whole study folder — drag & drop the folder that has all DICOM files for ONE patient scan', ar: 'مجلد الدراسة كاملاً — اسحب المجلد الذي يحوي كل ملفات DICOM لفحص مريض واحد' },
    { en: 'Multi-series studies — one study can contain multiple series (Hanan has 5: T1/T2 axial + T1/T2 sagittal + localizer)', ar: 'دراسات متعددة السلاسل — كل دراسة قد تحوي عدة سلاسل (حنان لديها 5: T1/T2 axial + T1/T2 sagittal + localizer)' },
    { en: 'Prior reports (PDF) — patient\'s previous imaging reports → upload via "Patient Reports" tab', ar: 'التقارير السابقة (PDF) — تقارير الأشعة السابقة للمريض → ارفعها من تبويب "Patient Reports"' },
  ],
  rejectedList: [
    { en: 'JPEG / PNG screenshots of DICOM images — no pixel intensity data, AI cannot analyze correctly', ar: 'صور JPEG/PNG من شاشة DICOM — لا تحوي بيانات pixel intensity، لن يستطيع AI تحليلها بدقة' },
    { en: 'Photos of the monitor — same reason, plus glare + rotation', ar: 'صور بالكاميرا للشاشة — نفس السبب، إضافة إلى الانعكاس والدوران' },
    { en: 'DICOMDIR files alone — that\'s an index, the actual images must accompany it', ar: 'ملف DICOMDIR وحده — هذا فهرس فقط، يجب أن ترفق الصور الفعلية معه' },
    { en: 'Single X-ray (CR/DX/DR) — the 3D viewer needs ≥ 2 slices with orientation metadata', ar: 'أشعة سينية مفردة (CR/DX/DR) — العارض ثلاثي الأبعاد يحتاج شريحتين على الأقل مع بيانات التوجيه' },
    { en: 'Videos (MP4/MOV) — cine loops must be converted to DICOM first', ar: 'ملفات فيديو (MP4/MOV) — يجب تحويل حلقات cine إلى DICOM أولاً' },
    { en: 'Files from a different patient — one upload = one patient. Mixing patients causes contamination', ar: 'ملفات لمريض آخر — رفعة واحدة = مريض واحد. الخلط يسبب تلوث البيانات' },
  ],
  bestPractice: { en: 'Best practice', ar: 'أفضل الممارسات' },
  bestList: [
    { en: 'Export the full study from your PACS as a DICOM ZIP — that\'s the safest option', ar: 'صدّر الدراسة كاملة من PACS كـ DICOM ZIP — الخيار الأكثر أماناً' },
    { en: 'Study size: up to 250 slices runs fastest. Larger (300+) still work but AI takes 3–5 minutes', ar: 'حجم الدراسة: حتى 250 شريحة أسرع. الأكبر (300+) يعمل لكن AI يأخذ 3-5 دقائق' },
    { en: 'CT ~0.5 MB/slice · MRI ~0.5–1 MB/slice. 156-slice CT ≈ 78 MB — 30–60s upload on 5G', ar: 'CT ~0.5 ميغا/شريحة · MRI ~0.5-1 ميغا/شريحة. حالة CT بـ 156 شريحة ≈ 78 ميغا — 30-60 ثانية على 5G' },
    { en: 'After upload, wait for the "Study ready" toast before opening the viewer', ar: 'بعد الرفع، انتظر إشعار "Study ready" قبل فتح العارض' },
  ],

  // Room
  roomLeft: { en: 'LEFT — Worklist', ar: 'اليسار — قائمة العمل' },
  roomLeftDesc: {
    en: 'List of all patients. Click any one to load. Priority (P1–P5) shown as color chips. STAT cases float to the top with red badges.',
    ar: 'قائمة كل المرضى. اضغط أياً منها للتحميل. الأولوية (P1-P5) تظهر كشارات ملوّنة. الحالات STAT تصعد للأعلى بشارات حمراء.',
  },
  roomCenter: { en: 'CENTER — Viewer strip', ar: 'الوسط — شريط العارض' },
  roomCenterDesc: {
    en: 'Preview thumbnails. Click any thumbnail to see it enlarged. Use Pro Viewer (MPR) or Case Story (3D) buttons for the full experience.',
    ar: 'صور مصغّرة للمعاينة. اضغط أي واحدة لتكبيرها. استخدم "Pro Viewer" أو "Case Story" للتجربة الكاملة.',
  },
  roomRight: { en: 'RIGHT — Composer', ar: 'اليمين — محرّر التقرير' },
  roomRightDesc: {
    en: 'Editable report sections: Findings · Impression · Recommendations. AI drafts, you edit, verify, sign, ship.',
    ar: 'أقسام التقرير القابلة للتعديل: النتائج · الانطباع · التوصيات. AI يكتب المسودة، أنت تعدّل وتتحقق وتوقّع وترسل.',
  },
  roomAuto: {
    en: 'Auto-analysis on open: the moment you click a study, midcine runs full-volume vision AI in the background. For 156 slices it takes 60–90s (cached after first run).',
    ar: 'التحليل التلقائي عند الفتح: بمجرد فتح الحالة، midcine يشغّل تحليل AI للحجم الكامل في الخلفية. حالة بـ 156 شريحة تأخذ 60-90 ثانية (تُخزَّن بعد المرة الأولى).',
  },

  // Viewer
  viewerIntro: {
    en: 'Powered by NiiVue + WebGL2. Opens directly in Multi mode = Axial + Sagittal + Coronal + 3D render, all synchronized.',
    ar: 'يعمل بـ NiiVue + WebGL2. يفتح مباشرة في وضع Multi = Axial + Sagittal + Coronal + 3D، كلها متزامنة.',
  },
  viewerHead: { en: 'Gesture / Button', ar: 'الإشارة / الزر' },
  viewerAct: { en: 'What it does', ar: 'ماذا يفعل' },
  viewerRows: [
    { a: 'Mouse scroll wheel', dEn: "Scroll slices in whatever pane you're hovering over", dAr: 'تصفّح الشرائح في اللوحة التي تحوم فوقها' },
    { a: 'Left click', dEn: 'Move the crosshair (all 3 planes sync)', dAr: 'حرّك المؤشر (تتزامن الـ 3 لوحات)' },
    { a: 'Right-click drag', dEn: 'Adjust window/level (brightness + contrast)', dAr: 'تعديل السطوع والتباين' },
    { a: 'Shift + drag', dEn: 'Zoom in/out', dAr: 'تكبير/تصغير' },
    { a: '‹ › arrows (bottom bar)', dEn: 'Step slice by slice (axial)', dAr: 'شريحة بشريحة (axial)' },
    { a: 'Slider', dEn: 'Jump to any slice number. Amber marks = AI findings', dAr: 'اقفز لأي رقم شريحة. العلامات الكهرمانية = مواضع AI' },
    { a: 'Multi / Axial / Sagittal / Coronal / 3D', dEn: 'Switch which planes are visible', dAr: 'بدّل بين المستويات المعروضة' },
    { a: 'Colormap (8 options)', dEn: 'Recolor for different tissue emphasis', dAr: 'إعادة تلوين لإبراز أنسجة مختلفة' },
    { a: 'Reset', dEn: 'Return to default view + zoom', dAr: 'الرجوع للعرض الافتراضي' },
    { a: '🔍 Run AI Analysis', dEn: 'Read every slice for abnormalities (30–90s)', dAr: 'قراءة كل شريحة لكشف الشذوذ (30-90 ثانية)' },
    { a: 'Next finding ›', dEn: 'Jump camera to the next AI finding position', dAr: 'اقفز للـ finding التالي' },
  ],
  viewerBanner: {
    en: 'Slice-level AI warnings: when the current slice falls inside an AI finding, a yellow banner auto-appears with finding text + ACR priority (STAT / URGENT / routine).',
    ar: 'تحذيرات AI على مستوى الشريحة: عندما تكون شريحتك ضمن نطاق finding، تظهر لافتة صفراء تلقائياً مع النص + الأولوية (STAT / URGENT / routine).',
  },

  // Case Story
  csIntro: {
    en: 'A cinema-mode view of the case: full 3D reconstruction on the left, chapter panel on the right, and a ▶ Play button that walks through every finding — like an educational video.',
    ar: 'عرض سينمائي للحالة: إعادة بناء 3D كامل يساراً، لوحة الفصول يميناً، وزر ▶ Play يمرّ على كل finding — كأنه فيديو تعليمي.',
  },
  csGet: { en: 'What you get', ar: 'ماذا تحصل عليه' },
  csGetList: [
    { en: 'Auto-generated patient-friendly summary', ar: 'ملخص مبسّط للمريض يُولَّد تلقائياً' },
    { en: 'One chapter per AI finding', ar: 'فصل واحد لكل finding' },
    { en: 'Each chapter: title + layperson name + "What it is" + "Why it matters" + "Next step"', ar: 'كل فصل: العنوان + الاسم المبسّط + "ما هذا" + "لماذا يهم" + "الخطوة التالية"' },
    { en: 'Automatic camera rotation to focus each finding', ar: 'دوران كاميرا تلقائي للتركيز على كل finding' },
    { en: 'Optional voice narration (browser TTS)', ar: 'سرد صوتي اختياري (TTS من المتصفح)' },
  ],
  csCtrl: { en: 'Controls', ar: 'أدوات التحكم' },
  csCtrlList: [
    { en: '▶ Play — auto-narrate through all chapters', ar: '▶ Play — سرد تلقائي لكل الفصول' },
    { en: '‹ › — previous / next chapter', ar: '‹ › — الفصل السابق/التالي' },
    { en: 'Rotate — turntable mode', ar: 'Rotate — وضع الدوران' },
    { en: 'Voice — read aloud on/off', ar: 'Voice — القراءة الصوتية تشغيل/إيقاف' },
    { en: 'Color — 8 medical colormaps', ar: 'Color — 8 خرائط ألوان طبية' },
    { en: 'Regenerate — force new story', ar: 'Regenerate — إعادة توليد جديدة' },
  ],
  csGrounded: {
    en: 'Grounded on truth: chapters are built from the AI vision JSON only — no invented findings.',
    ar: 'مبني على الحقيقة: الفصول من AI vision JSON فقط — لا اختراع.',
  },

  // AI Analysis
  aiIntro: {
    en: 'The AI reads every slice. It batches slices into mosaic images and sends each mosaic to a vision LLM.',
    ar: 'الذكاء الاصطناعي يقرأ كل شريحة. يجمّعها في صور mosaic ويرسل كل mosaic لـ vision LLM.',
  },
  aiHead: [
    { en: 'Study size', ar: 'حجم الدراسة' },
    { en: 'Batching', ar: 'التقسيم' },
    { en: 'Typical latency', ar: 'زمن التشغيل المعتاد' },
  ],
  aiRows: [
    { a: { en: '≤ 24 slices', ar: '≤ 24 شريحة' }, b: { en: '8 × 384px · 4 parallel', ar: '8 × 384 بكسل · 4 متوازي' }, c: { en: '~20–30s', ar: '20-30 ثانية' } },
    { a: { en: '25–60 slices', ar: '25-60 شريحة' }, b: { en: '12 × 320px · 4 parallel', ar: '12 × 320 · 4 متوازي' }, c: { en: '~30–45s', ar: '30-45 ثانية' } },
    { a: { en: '61–120 slices', ar: '61-120 شريحة' }, b: { en: '16 × 288px · 4 parallel', ar: '16 × 288 · 4 متوازي' }, c: { en: '~45–75s', ar: '45-75 ثانية' } },
    { a: { en: '121–250 slices (e.g. Aliaa)', ar: '121-250 شريحة (مثل عليا)' }, b: { en: '20 × 256px · 3 parallel', ar: '20 × 256 · 3 متوازي' }, c: { en: '~60–120s', ar: '60-120 ثانية' } },
    { a: { en: '> 250 slices', ar: '> 250 شريحة' }, b: { en: '32 × 224px · 3 parallel', ar: '32 × 224 · 3 متوازي' }, c: { en: '~90–180s', ar: '90-180 ثانية' } },
  ],
  aiRetry: {
    en: 'Retry on failure: each batch retries up to 3× with backoff (2.5s → 5s → 10s). Rate-limited providers get a session-scoped blacklist.',
    ar: 'إعادة المحاولة عند الفشل: كل batch يعيد 3 مرات مع تأخير (2.5s → 5s → 10s). المزوّدات المحدودة تُستبعد لبقية الجلسة.',
  },
  aiCoverage: {
    en: 'Coverage honesty: if batches fail, report shows "Note: AI coverage was 80% of the volume; slices N–M could not be analyzed". No invention.',
    ar: 'الأمانة في التغطية: عند فشل batches، التقرير يقول "Note: AI coverage was 80% of the volume; slices N–M could not be analyzed". لا اختراع.',
  },

  // Second Opinion
  soIntro: {
    en: 'Before signing, click "NEXUS Second Opinion (3 agents)". The draft is sent to three specialist agents in parallel:',
    ar: 'قبل التوقيع، اضغط "NEXUS Second Opinion". يُرسَل المسودة إلى 3 وكلاء متخصصين بالتوازي:',
  },
  soGuardian: { en: 'Guardian', ar: 'Guardian (الحارس)' },
  soGuardianDesc: {
    en: "Hallucination detector — flags findings that don't appear in the vision JSON",
    ar: 'كاشف الهلوسة — يرصد الـ findings غير الموجودة في vision JSON',
  },
  soDebugger: { en: 'Debugger', ar: 'Debugger (المُشخّص)' },
  soDebuggerDesc: {
    en: 'Logical consistency — spots contradictions inside the report',
    ar: 'الاتساق المنطقي — يرصد التناقضات داخل التقرير',
  },
  soReviewer: { en: 'Code Reviewer', ar: 'Code Reviewer (المُراجع)' },
  soReviewerDesc: {
    en: 'Structural completeness — flags missing sections or unusual wording',
    ar: 'اكتمال البنية — يرصد الأقسام الناقصة أو الصياغة الغريبة',
  },
  soPanel: { en: 'The panel shows:', ar: 'اللوحة تُظهر:' },
  soList: [
    { en: 'Agreement % — mean across the 3 agents', ar: 'نسبة الاتفاق — المتوسط بين الوكلاء' },
    { en: '🚨 CRITICAL flags — any severity=critical disagreement', ar: '🚨 CRITICAL — أي خلاف بأهمية critical' },
    { en: 'Missing findings — items in vision JSON but not in your report', ar: 'Findings مفقودة — موجودة في vision JSON لكن ليست في تقريرك' },
    { en: 'Possibly invented — report claims not backed by vision or docs', ar: 'اختراع محتمل — ادعاءات في التقرير بلا مستند' },
  ],
  soLatency: { en: 'Runs in 30–90 seconds.', ar: 'يعمل في 30-90 ثانية.' },

  // Report
  repSteps: [
    { en: 'Dictate or type Findings in the composer (right panel)', ar: 'أملِ أو اكتب النتائج في المحرّر (اللوحة اليمنى)' },
    { en: 'Click Impress to draft an Impression from your Findings', ar: 'اضغط Impress لكتابة انطباع من نتائجك' },
    { en: 'Optionally click NEXUS Second Opinion for cross-check', ar: 'اختيارياً: اضغط NEXUS Second Opinion للتحقق المتقاطع' },
    { en: 'Click Sign — first time only, tick the legal acknowledgment', ar: 'اضغط Sign — في أول مرة فقط، وقّع على الإقرار القانوني' },
    { en: 'Click Ship — sends via WhatsApp to the referring physician', ar: 'اضغط Ship — يُرسل عبر واتساب للطبيب المُحيل' },
  ],
  repLock: {
    en: 'Signed reports are locked. Once signed, sections are read-only. To fix, generate an addendum (audit requirement).',
    ar: 'التقارير الموقّعة مقفولة. بعد التوقيع، الأقسام للقراءة فقط. للتصحيح، أنشئ إضافة (متطلّب مراجعة).',
  },

  // Cache
  cacheIntro: {
    en: 'Every AI result is saved to disk. Opening the same case again is instant — no re-analysis.',
    ar: 'كل نتيجة AI تُحفَظ على القرص. فتح نفس الحالة مرة أخرى فوري — بلا إعادة تحليل.',
  },
  cacheFirst: { en: 'First open', ar: 'الفتح الأول' },
  cacheFirstDesc: {
    en: 'Full AI analysis + story generation. 30 seconds to 3 minutes depending on study size.',
    ar: 'تحليل AI كامل + توليد القصة. 30 ثانية إلى 3 دقائق حسب حجم الدراسة.',
  },
  cacheAfter: { en: 'Every open after', ar: 'كل فتح بعد ذلك' },
  cacheAfterDesc: {
    en: 'Instant. Reads from disk. Works even on 2G. Look for the "Regenerate" button.',
    ar: 'فوري. يقرأ من القرص. يعمل حتى على 2G. ابحث عن زر "Regenerate".',
  },
  cacheForce: {
    en: 'Force refresh: click Regenerate if study data changed and you want fresh AI reading.',
    ar: 'إعادة توليد إجباري: اضغط Regenerate إذا تغيّرت بيانات الدراسة وأردت قراءة جديدة.',
  },

  // Safety
  safetyIntro: {
    en: 'Every case is stored in its own folder, keyed by the DICOM study UID. No shared state — no cross-patient contamination.',
    ar: 'كل حالة في مجلد خاص بها، مفتاحها DICOM study UID. لا حالة مشتركة — لا تلوث بين المرضى.',
  },
  safetyPath: {
    en: 'Verify isolation via GET /api/mcp/studies/{uid}/manifest — returns every file that belongs to that study.',
    ar: 'تحقق من العزل عبر GET /api/mcp/studies/{uid}/manifest — يُرجع كل ملف يخص تلك الدراسة.',
  },

  // Limits
  limitsList: [
    { en: '2D X-rays (CR/DX/DR/MG) — viewer needs volumetric data (≥ 2 slices with orientation). Not yet supported', ar: 'الأشعة السينية 2D (CR/DX/DR/MG) — العارض يحتاج بيانات حجمية. غير مدعوم بعد' },
    { en: 'Free-tier AI limits — Groq daily quota can exhaust after ~10 large cases. Fallback to Naraya kicks in', ar: 'حدود AI المجاني — Groq daily quota قد تنفد بعد ~10 حالات كبيرة. Naraya يعمل fallback تلقائياً' },
    { en: 'Public URL has no login — do NOT share publicly. For hospital use, add authentication first', ar: 'الرابط العام بلا تسجيل — لا تشاركه علناً. للاستخدام في المستشفى، أضف تسجيل دخول أولاً' },
    { en: 'Not HIPAA-certified — deployment is pilot-grade. For real patients, on-premise + HIPAA BAA required', ar: 'ليس HIPAA — النشر تجريبي. لمرضى حقيقيين يجب on-premise + HIPAA BAA' },
    { en: 'Requires the server machine ON — runs off the E: portable drive. If unplugged, site is down', ar: 'يتطلب تشغيل جهاز السيرفر — يعمل من فلاشة E:. إذا فُصلت، الموقع يتوقف' },
  ],

  // FAQ
  faqList: [
    {
      qEn: "The viewer says 'Image type not supported'",
      qAr: 'العارض يقول "Image type not supported"',
      aEn: 'This was a bug in an earlier version — fixed 2026-07-15. Hard refresh (Ctrl+F5) to pick up the latest build.',
      aAr: 'كانت مشكلة في إصدار أقدم — أُصلحت 2026-07-15. اضغط Ctrl+F5 لتحميل أحدث نسخة.',
    },
    {
      qEn: 'The AI report generation failed with a 429 error',
      qAr: 'فشل توليد التقرير بخطأ 429',
      aEn: 'You hit the daily free-tier quota. Wait ~24h for reset, or add a paid API key. Cached results still work.',
      aAr: 'وصلت للحد اليومي المجاني. انتظر 24 ساعة أو أضف مفتاح API مدفوع. النتائج المخزّنة تعمل.',
    },
    {
      qEn: "Case Story is stuck on 'Generating…'",
      qAr: 'Case Story عالق على "Generating…"',
      aEn: 'Large studies (150+ slices) can take 2–3 minutes. If > 5 min, refresh the page.',
      aAr: 'الدراسات الكبيرة (150+ شريحة) قد تأخذ 2-3 دقائق. لو تجاوزت 5 دقائق، أعِد تحميل الصفحة.',
    },
    {
      qEn: "I uploaded but the study doesn't show",
      qAr: 'رفعت لكن الحالة لا تظهر',
      aEn: '(1) Check upload finished. (2) Refresh room page. (3) If still missing, re-export from PACS as fresh ZIP.',
      aAr: '(1) تأكد من اكتمال الرفع. (2) أعد تحميل صفحة room. (3) لو مازالت مفقودة، صدّر مرة أخرى من PACS كـ ZIP.',
    },
    {
      qEn: 'Can I add my own colormap?',
      qAr: 'هل يمكنني إضافة colormap خاصة؟',
      aEn: 'Not yet. The 8 colormaps come from NiiVue built-in library. Enough for 95% of workflows.',
      aAr: 'ليس بعد. الـ 8 colormaps من مكتبة NiiVue المدمجة. تكفي لـ 95% من الحالات.',
    },
    {
      qEn: "How do I know the AI didn't hallucinate?",
      qAr: 'كيف أعرف أن AI لم يهلوس؟',
      aEn: '(1) The composer strictly forbids invention. (2) Run NEXUS Second Opinion. (3) Verify slice references in the viewer.',
      aAr: '(1) المحرّر يمنع الاختراع بقوة. (2) شغّل NEXUS Second Opinion. (3) تحقق من أرقام الشرائح في العارض.',
    },
  ],

  // CTA
  ctaTitle: { en: 'Ready to read your first case?', ar: 'مستعد لقراءة أول حالة؟' },
  ctaDesc: {
    en: 'Start with Hanan (5-series MR spine) or Aliaa (156-slice CT brain) — both are cached and open instantly.',
    ar: 'ابدأ بحنان (5 سلاسل MR للعمود) أو عليا (156 شريحة CT للمخ) — كلاهما مخزّن ويفتح فوراً.',
  },
  ctaBtn: { en: 'Open Reading Room', ar: 'افتح غرفة القراءة' },
};

export default function GuidePage() {
  const [lang, setLang] = useState<Lang>('en');

  // Load preference from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('midcine.guide.lang');
      if (saved === 'ar' || saved === 'en') setLang(saved);
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem('midcine.guide.lang', lang); } catch {}
  }, [lang]);

  const isAr = lang === 'ar';
  const dir = isAr ? 'rtl' : 'ltr';
  // Choose an English-friendly font for AR too — Cairo, Tajawal are ideal but
  // we use system-ui + Arabic-friendly font stack fallback
  const fontFamily = isAr
    ? '"Segoe UI", "Tahoma", "Cairo", "Tajawal", sans-serif'
    : undefined;

  const pick = <T,>(o: { en: T; ar: T }): T => (isAr ? o.ar : o.en);

  return (
    <div
      className="min-h-screen bg-[#0A0E14] text-slate-200"
      dir={dir}
      style={{ fontFamily }}
    >
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-3">
          <Link href="/" className="flex items-center gap-1 text-xs text-slate-400 hover:text-cyan-300">
            <ArrowLeft className={'h-3.5 w-3.5 ' + (isAr ? 'rotate-180' : '')} />
            {pick(T.home)}
          </Link>
          <div className="h-4 w-px bg-slate-800" />
          <span className="text-sm font-bold">{pick(T.version)}</span>

          <div className="ms-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLang(isAr ? 'en' : 'ar')}
              className="flex items-center gap-1 rounded-full border border-cyan-500/50 bg-cyan-500/10 px-3 py-1 text-xs font-bold text-cyan-300 hover:bg-cyan-500/25"
              title="Change language / تغيير اللغة"
            >
              <Globe className="h-3.5 w-3.5" />
              {pick(T.langToggle)}
            </button>
            <Link
              href="/room"
              className="flex items-center gap-1 rounded-full bg-cyan-500 px-3 py-1 text-xs font-bold text-slate-950 hover:bg-cyan-400"
            >
              {pick(T.openRoom)} <ChevronRight className={'h-3 w-3 ' + (isAr ? 'rotate-180' : '')} />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-10 px-6 py-10">
        <section>
          <h1 className="mb-3 text-4xl font-bold text-slate-100">{pick(T.heroTitle)}</h1>
          <p className="max-w-3xl text-lg leading-relaxed text-slate-400">
            {pick(T.heroSub)}
          </p>
        </section>

        <nav className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">
            {pick(T.toc)}
          </div>
          <ol className="grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2">
            {T.sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-cyan-300 hover:text-cyan-200">
                  {i + 1}. {pick(s)}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <Section id="quickstart" icon={<Rocket className="h-4 w-4 text-fuchsia-400" />} title={pick(T.sections[0])}>
          <ol className={'space-y-2 ' + (isAr ? 'mr-4 list-decimal' : 'ml-4 list-decimal')}>
            {T.qsSteps.map((s, i) => (
              <li key={i}>{pick(s)}</li>
            ))}
          </ol>
        </Section>

        <Section id="upload" icon={<Upload className="h-4 w-4 text-amber-400" />} title={pick(T.sections[1])}>
          <div className="mb-4 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
            <div className="mb-2 flex items-center gap-2 font-bold text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              {pick(T.uploadWarn)}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-4">
              <div className="mb-2 flex items-center gap-2 font-bold text-emerald-300">
                <FileCheck className="h-4 w-4" /> {pick(T.accepted)}
              </div>
              <ul className="space-y-2 text-[13px] text-slate-200">
                {T.acceptedList.map((it, i) => <li key={i}>{pick(it)}</li>)}
              </ul>
            </div>
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/5 p-4">
              <div className="mb-2 flex items-center gap-2 font-bold text-rose-300">
                <FileX className="h-4 w-4" /> {pick(T.rejected)}
              </div>
              <ul className="space-y-2 text-[13px] text-slate-200">
                {T.rejectedList.map((it, i) => <li key={i}>{pick(it)}</li>)}
              </ul>
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-cyan-500/40 bg-cyan-500/5 p-4">
            <div className="mb-2 flex items-center gap-2 font-bold text-cyan-200">
              <Info className="h-4 w-4" /> {pick(T.bestPractice)}
            </div>
            <ul className="space-y-1.5 text-[13px] text-slate-300">
              {T.bestList.map((it, i) => <li key={i}>• {pick(it)}</li>)}
            </ul>
          </div>
        </Section>

        <Section id="room" icon={<Eye className="h-4 w-4 text-emerald-400" />} title={pick(T.sections[2])}>
          <div className="grid gap-3 md:grid-cols-3">
            <Panel title={pick(T.roomLeft)} color="cyan">{pick(T.roomLeftDesc)}</Panel>
            <Panel title={pick(T.roomCenter)} color="emerald">{pick(T.roomCenterDesc)}</Panel>
            <Panel title={pick(T.roomRight)} color="fuchsia">{pick(T.roomRightDesc)}</Panel>
          </div>
          <div className="mt-3 text-[13px] text-slate-400">{pick(T.roomAuto)}</div>
        </Section>

        <Section id="viewer" icon={<Box className="h-4 w-4 text-cyan-400" />} title={pick(T.sections[3])}>
          <div className="mb-3 text-[13px]">{pick(T.viewerIntro)}</div>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-slate-700 text-start text-[10px] uppercase tracking-widest text-slate-500">
                <th className="py-1.5 pe-3">{pick(T.viewerHead)}</th>
                <th className="py-1.5">{pick(T.viewerAct)}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {T.viewerRows.map((r, i) => (
                <tr key={i}>
                  <td className="py-1.5 pe-3 font-mono text-[12px] text-cyan-300">{r.a}</td>
                  <td className="py-1.5 text-slate-300">{isAr ? r.dAr : r.dEn}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-[13px] text-amber-100">
            {pick(T.viewerBanner)}
          </div>
        </Section>

        <Section id="case-story" icon={<Play className="h-4 w-4 text-purple-400" />} title={pick(T.sections[4])}>
          <p className="mb-3 text-[13px] leading-relaxed">{pick(T.csIntro)}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <Panel title={pick(T.csGet)} color="purple">
              <ul className={'mt-1 list-disc space-y-1 text-[13px] ' + (isAr ? 'pr-4' : 'pl-4')}>
                {T.csGetList.map((it, i) => <li key={i}>{pick(it)}</li>)}
              </ul>
            </Panel>
            <Panel title={pick(T.csCtrl)} color="cyan">
              <ul className={'mt-1 list-disc space-y-1 text-[13px] ' + (isAr ? 'pr-4' : 'pl-4')}>
                {T.csCtrlList.map((it, i) => (
                  <li key={i}>
                    {i === 2 && <RotateCw className="me-1 inline h-3 w-3" />}
                    {i === 3 && <Volume2 className="me-1 inline h-3 w-3" />}
                    {i === 4 && <Palette className="me-1 inline h-3 w-3" />}
                    {i === 5 && <RefreshCw className="me-1 inline h-3 w-3" />}
                    {pick(it)}
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
          <div className="mt-3 text-[13px] text-slate-400">{pick(T.csGrounded)}</div>
        </Section>

        <Section id="ai-analyze" icon={<Zap className="h-4 w-4 text-cyan-400" />} title={pick(T.sections[5])}>
          <div className="mb-3 text-[13px]">{pick(T.aiIntro)}</div>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-slate-700 text-start text-[10px] uppercase tracking-widest text-slate-500">
                {T.aiHead.map((h, i) => (
                  <th key={i} className={i < 2 ? 'py-1.5 pe-3' : 'py-1.5'}>{pick(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {T.aiRows.map((r, i) => (
                <tr key={i}>
                  <td className="py-1.5 pe-3 text-cyan-300">{pick(r.a)}</td>
                  <td className="py-1.5 pe-3 text-slate-400">{pick(r.b)}</td>
                  <td className="py-1.5 text-emerald-300">{pick(r.c)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 space-y-2 text-[13px]">
            <div>{pick(T.aiRetry)}</div>
            <div>{pick(T.aiCoverage)}</div>
          </div>
        </Section>

        <Section id="second-op" icon={<ShieldCheck className="h-4 w-4 text-purple-400" />} title={pick(T.sections[6])}>
          <p className="mb-3 text-[13px] leading-relaxed">{pick(T.soIntro)}</p>
          <div className="grid gap-2 md:grid-cols-3">
            <MiniCard color="rose" title={pick(T.soGuardian)} desc={pick(T.soGuardianDesc)} />
            <MiniCard color="cyan" title={pick(T.soDebugger)} desc={pick(T.soDebuggerDesc)} />
            <MiniCard color="emerald" title={pick(T.soReviewer)} desc={pick(T.soReviewerDesc)} />
          </div>
          <div className="mt-3 rounded-lg border border-purple-500/40 bg-purple-500/5 p-3 text-[13px]">
            <div>{pick(T.soPanel)}</div>
            <ul className={'mt-1 list-disc space-y-0.5 ' + (isAr ? 'pr-4' : 'pl-4')}>
              {T.soList.map((it, i) => <li key={i}>{pick(it)}</li>)}
            </ul>
          </div>
          <div className="mt-2 text-[12px] italic text-slate-400">{pick(T.soLatency)}</div>
        </Section>

        <Section id="report" icon={<FileText className="h-4 w-4 text-emerald-400" />} title={pick(T.sections[7])}>
          <ol className={'space-y-1.5 text-[13px] ' + (isAr ? 'mr-4 list-decimal' : 'ml-4 list-decimal')}>
            {T.repSteps.map((s, i) => <li key={i}>{pick(s)}</li>)}
          </ol>
          <div className="mt-3 rounded-lg border border-cyan-500/40 bg-cyan-500/5 p-3 text-[13px]">
            {pick(T.repLock)}
          </div>
        </Section>

        <Section id="cache" icon={<HardDrive className="h-4 w-4 text-cyan-400" />} title={pick(T.sections[8])}>
          <p className="mb-3 text-[13px]">{pick(T.cacheIntro)}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <Panel title={<><Wifi className="me-1.5 inline h-3.5 w-3.5" />{pick(T.cacheFirst)}</>} color="cyan">
              {pick(T.cacheFirstDesc)}
            </Panel>
            <Panel title={<><WifiOff className="me-1.5 inline h-3.5 w-3.5" />{pick(T.cacheAfter)}</>} color="emerald">
              {pick(T.cacheAfterDesc)}
            </Panel>
          </div>
          <div className="mt-3 text-[13px] text-slate-400">{pick(T.cacheForce)}</div>
        </Section>

        <Section id="safety" icon={<Shield className="h-4 w-4 text-emerald-400" />} title={pick(T.sections[9])}>
          <div className="mb-3 text-[13px]">{pick(T.safetyIntro)}</div>
          <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3 font-mono text-[11px] leading-relaxed text-slate-300" dir="ltr">
            <div>studies/&lt;uid&gt;.json          &larr; patient record</div>
            <div>dicoms/&lt;uid&gt;.series/       &larr; DICOM slices (isolated)</div>
            <div>docs/&lt;uid&gt;/                &larr; uploaded prior reports</div>
            <div>reports_store/ai_cache/&lt;uid&gt;/ &larr; AI results (per-case)</div>
          </div>
          <div className="mt-3 text-[13px]">{pick(T.safetyPath)}</div>
        </Section>

        <Section id="limits" icon={<AlertTriangle className="h-4 w-4 text-amber-400" />} title={pick(T.sections[10])}>
          <ul className={'space-y-2 text-[13px] ' + (isAr ? 'mr-4 list-disc' : 'ml-4 list-disc')}>
            {T.limitsList.map((it, i) => <li key={i}>{pick(it)}</li>)}
          </ul>
        </Section>

        <Section id="faq" icon={<MessageSquare className="h-4 w-4 text-cyan-400" />} title={pick(T.sections[11])}>
          <div className="space-y-3 text-[13px]">
            {T.faqList.map((it, i) => (
              <details key={i} className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 open:bg-slate-900/90">
                <summary className="cursor-pointer text-[13px] font-bold text-cyan-200 hover:text-cyan-100">
                  {isAr ? it.qAr : it.qEn}
                </summary>
                <div className="mt-2 text-[13px] leading-relaxed text-slate-300">
                  {isAr ? it.aAr : it.aEn}
                </div>
              </details>
            ))}
          </div>
        </Section>

        <div className="rounded-xl border border-cyan-500/40 bg-gradient-to-br from-cyan-500/10 to-fuchsia-500/10 p-6 text-center">
          <Lock className="mx-auto mb-2 h-6 w-6 text-cyan-400" />
          <div className="mb-1 text-sm font-bold text-slate-100">{pick(T.ctaTitle)}</div>
          <div className="mb-4 text-[12px] text-slate-400">{pick(T.ctaDesc)}</div>
          <Link
            href="/room"
            className="inline-flex items-center gap-1 rounded-full bg-cyan-500 px-5 py-2 text-sm font-bold text-slate-950 hover:bg-cyan-400"
          >
            {pick(T.ctaBtn)} <ChevronRight className={'h-4 w-4 ' + (isAr ? 'rotate-180' : '')} />
          </Link>
        </div>
      </main>
    </div>
  );
}

function Section({ id, icon, title, children }: {
  id: string; icon: React.ReactNode; title: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="text-xl font-bold text-slate-100">{title}</h2>
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 text-sm text-slate-300">
        {children}
      </div>
    </section>
  );
}

function Panel({ title, children, color }: {
  title: React.ReactNode; children: React.ReactNode;
  color: 'cyan' | 'emerald' | 'fuchsia' | 'purple' | 'rose' | 'amber';
}) {
  const colorClasses: Record<string, string> = {
    cyan:    'border-cyan-500/40 bg-cyan-500/5',
    emerald: 'border-emerald-500/40 bg-emerald-500/5',
    fuchsia: 'border-fuchsia-500/40 bg-fuchsia-500/5',
    purple:  'border-purple-500/40 bg-purple-500/5',
    rose:    'border-rose-500/40 bg-rose-500/5',
    amber:   'border-amber-500/40 bg-amber-500/5',
  };
  const titleClasses: Record<string, string> = {
    cyan:    'text-cyan-300',
    emerald: 'text-emerald-300',
    fuchsia: 'text-fuchsia-300',
    purple:  'text-purple-300',
    rose:    'text-rose-300',
    amber:   'text-amber-300',
  };
  return (
    <div className={'rounded-lg border p-3 ' + colorClasses[color]}>
      <div className={'mb-1 text-[11px] font-bold uppercase tracking-widest ' + titleClasses[color]}>
        {title}
      </div>
      <div className="text-[13px] text-slate-200">{children}</div>
    </div>
  );
}

function MiniCard({ title, desc, color }: { title: string; desc: string; color: 'rose' | 'cyan' | 'emerald' }) {
  const colorClasses: Record<string, string> = {
    rose:    'border-rose-500/40 bg-rose-500/5 text-rose-300',
    cyan:    'border-cyan-500/40 bg-cyan-500/5 text-cyan-300',
    emerald: 'border-emerald-500/40 bg-emerald-500/5 text-emerald-300',
  };
  return (
    <div className={'rounded-lg border p-3 ' + colorClasses[color]}>
      <div className="mb-1 text-sm font-bold">{title}</div>
      <div className="text-[12px] text-slate-300">{desc}</div>
    </div>
  );
}
