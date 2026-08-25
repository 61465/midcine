# دليل الطبيب لاستخدام midcine

**الرابط:** https://ame.tail19ddab.ts.net/
**النسخة:** v1.0 · 2026-07-06

---

## ما هو midcine؟

**نظام كامل لقراءة أشعة DICOM وكتابة تقارير طبية بمساعدة الذكاء الاصطناعي**، يعمل داخل المتصفح مباشرة — بدون تثبيت، بدون تعقيدات.

يوفّر عليك 60 دقيقة من كل شفت من خلال:
- توليد Impression تلقائي بأسلوب ACR
- كشف تلقائي للنتائج الحرجة (Critical Alert)
- إرسال بضغطة واحدة إلى الطبيب المُحيل عبر واتساب

---

## 1) أول 30 ثانية

1. افتح الرابط: **https://ame.tail19ddab.ts.net/**
2. اضغط **"Open reading room"** في الأعلى
3. ستجد حالة جاهزة للتجربة:
   - **Ahmed Al-Khalidi** — 28 سنة ذكر
   - **CT · BRAIN · P1 STAT** (أولوية قصوى)
   - 24 شريحة CT جاهزة
   - أعراض: نوبات صرع جديدة + ضعف الجانب الأيمن + صداع صباحي

---

## 2) شاشة القراءة (Reading Room)

### التخطيط
الشاشة مقسومة 3 أقسام:
- **اليسار**: قائمة الحالات (Worklist)
- **الوسط**: عارض DICOM
- **اليمين**: محرر التقرير + الذكاء الاصطناعي

### شريط الحالات السابقة (فوق العارض)
كل حالات نفس المريض السابقة تظهر كـ tiles ملونة حسب النوع (CT سيان · MR فوشيا · US أخضر). اضغط أي واحدة للمقارنة.

---

## 3) عارض DICOM — 5 أوضاع

اختر من الأعلى:

| الوضع | ماذا يعرض |
|---|---|
| **2D** | عرض شريحة واحدة (الافتراضي) + عجلة الماوس للتنقل |
| **All Slices** | كل الـ 24 شريحة كصور مصغرة (grid) |
| **MPR** | 3 مستويات معاً: محوري + سهمي + إكليلي |
| **3D Volume** | تجسيم ثلاثي الأبعاد للجمجمة (Rotate بالماوس) |
| **MIP** | Maximum Intensity Projection — يبرز الأوعية والعقد |

### أدوات القياس (الشريط العلوي)
- **W/L** — تعديل التباين (سحب بالماوس)
- **Zoom / Pan** — تكبير وتحريك
- **Length** — قياس مسافة بالـ mm
- **Angle** — قياس زاوية
- **ROI** — منطقة اهتمام بيضاوية (يعطيك mean/stddev/min/max)
- **Freehand** — رسم منطقة يدوياً
- **Probe** — يعرض قيمة HU تحت المؤشر مباشرة

### أزرار إضافية
- **Rotate 90°** · **Flip H** · **Flip V** — تدوير وقلب
- **Fit** — ملء الشاشة
- **Invert** — قلب الأبيض والأسود
- **Reset** — إعادة كل شي للأصل
- **Tags** — عرض كل DICOM tags للشريحة
- **Filters** — 11 فلتر معالجة صورة (احترافي)
- **Segment** — تلوين تلقائي للأنسجة (هواء/دهون/رخوة/عظم)

### الفلاتر الـ 11 (زر Filters)
Sharpen · Edge (Sobel) · Emboss · Gamma · Histogram Equalize · Smooth · Pseudo-color (jet/hot/plasma/viridis) · Vignette · Clarity · Bone marker · Invert

كلها تعمل **مباشرة على المتصفح** بدون رفع الصورة لأي سيرفر.

### علامات الاتجاه
حروف **R L A P** تظهر على أطراف الصورة (يمين/يسار/أمامي/خلفي) — تنعكس تلقائياً مع كل تدوير أو قلب.

---

## 4) الذكاء الاصطناعي — قلب midcine

في الجانب الأيمن، **5 أزرار AI**:

### ✨ Impress (AI Impression)
اكتب Findings → اضغط الزر → تحصل على Impression جاهز بأسلوب ACR في 4-8 ثوانٍ.

مثال حقيقي على حالة الورم:
> *"Left frontoparietal 4.2 cm enhancing mass with 6 mm midline shift — suspicious for high-grade glioma or metastasis. Urgent MRI brain with and without contrast (per ACR Appropriateness Criteria) and neurosurgical evaluation recommended."*

يستخدم **دمج 5 نماذج** (Mistral Large + Mistral Medium + GPT-OSS 120B + Llama 3.3 70B + Llama 4 Scout) بالتوازي عبر Judge للحصول على جودة تعادل Claude Opus.

### 👁 Vision (AI Vision Analysis)
يحلّل الصورة نفسها (وليس النص فقط):
- Abnormality score (نسبة الاشتباه)
- Missed findings (ما قد نسيت ذكره)
- Differential diagnosis
- Regions of Interest بأولوية

### ⇄ Compare (مقارنة مع دراسة سابقة)
لو المريض عنده دراسة سابقة، يقارن ويكتب:
> *"Right frontoparietal mass progressed (3.6cm → 4.2cm, 17% growth) with new vasogenic edema and 6mm midline shift. No resolved findings."*

### 📖 Cite (PubMed Citations)
يبحث في PubMed عن أفضل 3 مقالات ذات صلة بالحالة + يرتّبها بذكاء الاصطناعي.

### ✍ Sign
توقيع التقرير — اسمك ورقم الرخصة يُحفظان مرة واحدة، ثم توقيع بضغطة.

---

## 5) 🚨 Critical Alert التلقائي

**بدون ما تضغط شيء** — كلما تكتب في Findings، النظام يفحص تلقائياً بحثاً عن:
- Midline shift
- Pulmonary embolism
- Intracranial hemorrhage
- Aortic dissection
- Tension pneumothorax
- Bowel perforation
- Acute stroke

لو اكتشف شيء حرج:
- **Banner أحمر نابض** يظهر
- يرفع الأولوية تلقائياً إلى **P1 STAT**
- ينبّهك: "Immediate callback to referrer recommended"

هذي **الميزة اللي تنقذ حياة**.

---

## 6) 🚀 Ship Report — التقرير بضغطة واحدة

الزر الكبير الملوّن (فوشيا→سيان). ضغطة واحدة تعمل:

1. **1/3** — توليد Impression بالذكاء الاصطناعي
2. **2/3** — توقيع تلقائي (باستخدام معلوماتك المحفوظة)
3. **3/3** — فتح نافذة اختيار الأطباء لإرسال:
   - PDF كامل
   - DICOM SR
   - رسالة واتساب مع الملخص

**اختر عدة أطباء دفعة واحدة** — يُرسَل للجميع بالتوازي.

---

## 7) 🎙️ الأوامر الصوتية

زر Voice (أسفل يمين) — 17 أمر بالعربي والإنجليزي:

| الأمر | ما يعمل |
|---|---|
| "midcine next case" أو "التالي" | الحالة التالية |
| "open 3d" أو "ثلاثي الأبعاد" | تفعيل 3D |
| "open mpr" أو "المستوى المتعدد" | تفعيل MPR |
| "ai impression" أو "اكتب الانطباع" | توليد Impression |
| "ship report" أو "اشحن" | Ship كامل |
| "sign" أو "توقيع" | فتح التوقيع |
| "open history" أو "تاريخ المريض" | فتح ملف المريض |

---

## 8) 🎤 الإملاء الصوتي (Voice Dictation)

**زر الميكروفون الكبير** أسفل الشاشة:
1. اضغط داخل خانة Findings
2. **استمر بضغط الميكروفون** (أو مسطرة SPACE)
3. تكلّم بالعربي أو الإنجليزي
4. اترك الزر → يُدرج النص فوراً حيث المؤشر

يستخدم **faster-whisper محلياً** — صوتك ما يخرج من جهازك.

---

## 9) 📝 القوالب السريرية (Slash Commands)

اكتب في Findings مباشرة:

| الأمر | يُدرج |
|---|---|
| `/flei 8 solid high single` | Fleischner 2017 recommendation |
| `/birads 4B` | BI-RADS 4B assessment |
| `/tirads solid hypoechoic taller irregular punctate` | ACR TI-RADS calculation |
| `/lirads 25 true true true false` | LI-RADS 2018 category |
| `/pirads PZ 4 3` | PI-RADS v2.1 score |

**اضغط Enter** → تُستبدل بالتوصية الكاملة من الـ guideline.

---

## 10) 📁 صفحة تاريخ المريض

اضغط **"History"** في الشريط العلوي → تفتح صفحة كاملة:

### قسم Identity
اسم · MRN · عمر · جنس · فصيلة دم · مهنة · هاتف · جهة اتصال طارئ

### قسم Medical
- **Allergies** (شارات وردية)
- **Chronic conditions** (شارات كهرمانية)
- **Current medications** (شارات سيان)
- **Past surgeries**
- **Family history** (شارات فوشيا)

### قسم Lifestyle
تدخين (مع تفاصيل pack-years) · كحول · ملاحظات حرة

### قسم Prior Imaging
كل الأشعة السابقة مع روابط سريعة

**كل ما تحفظه هنا يُغذّي الـ AI في التقارير المستقبلية.**

---

## 11) 👥 بوابة الطبيب المُحيل

الرابط: `https://ame.tail19ddab.ts.net/referrer`

الطبيب المُحيل (اللي أرسل المريض) يفتح البوابة → يدخل اسمه → يرى:
- **كل التقارير المُوجَّهة إليه**
- Filter بـ modality/تاريخ/بحث
- Download PDF + DICOM SR
- عرض التقرير كامل
- Auto-refresh كل 30 ثانية

---

## 12) 📊 الإحصائيات

الرابط: `/analytics`

- **Total studies** — مجموع الحالات
- **Avg turnaround** — متوسط وقت الحالة (من التقاط → توقيع)
- **AI impressions generated** — كم مرة استخدمت الذكاء
- **Minutes saved** — دقائق موفّرة (بمعادلة Rad AI)
- **Volume last 7 days** — رسم بياني للحمل اليومي
- **By modality** — توزيع حسب النوع
- **By priority** — توزيع حسب الأولوية

---

## 13) 🛡️ سجل التدقيق (Audit Log)

الرابط: `/audit`

كل عملية موثّقة: إنشاء دراسة · رفع DICOM · توليد AI · توقيع · إرسال · حذف · Critical alerts.

مطلوب للـ **PDPL السعودية** و **HIPAA** — كل شي في مكان واحد.

---

## 14) ⏱ Session Auto-Lock

بعد **15 دقيقة idle** بدون حركة → قفل تلقائي (يطلب إعادة تسجيل الدخول). حماية للـ workstations المشتركة.

**تحذير قبل القفل بدقيقة**: banner أصفر أسفل يمين.

---

## 15) 📱 تثبيت كتطبيق (PWA)

**iOS**: افتح الرابط في Safari → مشاركة → "Add to Home Screen"
**Android**: افتح في Chrome → القائمة → "Install app"

سيظهر كتطبيق مستقل بأيقونة midcine.

---

## 16) 🔒 الأمان

- **HTTPS كامل** عبر Tailscale + Let's Encrypt
- **PDPL compliant**: البيانات في السيرفر السعودي، ما تخرج للخارج
- **PHI redaction**: قبل ما يذهب أي نص للذكاء الاصطناعي، البيانات الشخصية تُخفى
- **Encrypted secrets**: كل مفاتيح API مشفّرة على القرص
- **Session lock**: 15 دقيقة idle timeout
- **Full audit log**: كل عملية موثّقة

---

## 17) 💰 كم يوفّر لك midcine؟

بحساب Rad AI الرسمي:
- **60 دقيقة/شفت** موفّرة من كتابة Impression
- بأجر رادلوجيست سعودي متوسط (~150 SAR/ساعة)
- = **150 SAR/شفت** → 3,000 SAR/شهر
- الاشتراك المقترح: $79-250/شهر

**العائد**: 10× أكثر من التكلفة، مع تحسين جودة التقارير.

---

## 📞 للاستفسار أو الملاحظات

- Live URL: **https://ame.tail19ddab.ts.net/**
- المطوّر: عبد الرحمن محمد
- الحالة التجريبية موجودة الآن جاهزة للتجربة الكاملة

---

**جرّبه الآن 🩻**
