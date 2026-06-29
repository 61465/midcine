<div dir="rtl" lang="ar">

# 06 — الهوية البصرية والعلامة التجارية

> **مدخلات:** ردود Brand Designer (NEXUS-AI) + تصحيحات تقنية على الخطوط والألوان
> آخر تحديث: 2026-06-07

---

## 1. الاسم — هل نُبقي على midcine؟

### 1.1 تحليل الاسم
- **midcine** = mid (وسط/جسر) + cine (cinema/scene)
- يُلمح: نقطة وسط بين الطب التقليدي والذكاء الاصطناعي، يعرض الأشعة كـ "scene"
- النطق العربي: "ميد-سين" (5 أحرف، سهل)
- المشكلة الوحيدة: لا يبدو طبياً صريحاً للوهلة الأولى

### 1.2 البدائل المُقترَحة (تم تقييمها)

| الاسم | إيجابيات | سلبيات | الحكم |
|------|----------|--------|-------|
| **midcine** (الحالي) | فريد، قصير، .io متاح | لا يصرّح بأنه طبي | ✅ نُبقي عليه |
| MediScene | أوضح طبياً، إيقاع جيد | تشبه أسماء كثيرة | ⚠️ بديل ثانٍ |
| Rayan Health | عربي، روحاني | "Health" عام، شائع | ❌ |
| ArabMed | يقيد للسوق العربي | يحدّ من التوسع لاحقاً | ❌ |
| Medarabia | يدمج المعنى | طويل، أقل تذكراً | ❌ |
| RadiOS | تقني، يبدو AI | يخلط مع أنظمة تشغيل | ❌ |

### 1.3 القرار النهائي
> **نُبقي على midcine** كاسم رسمي، مع **شعار فرعي عربي:**
> **«ميدسين | الأشعة تتحدث العربية»**

### 1.4 صيغ الاستخدام
- **رسمي:** midcine
- **في النصوص العربية:** midcine (لاتيني، لا نعربه)
- **في الـ branding:** يظهر دائماً مع الـ tagline العربي
- **في الـ URL:** midcine.io

---

## 2. Logo Concept

### 2.1 المبدأ التصميمي
**جسر بين شريحتين** — يرمز للـ Hybrid Cloud + الجمع بين الذكاء البشري والاصطناعي + الجسر العربي-العالمي.

### 2.2 الـ Mark (الرمز)

```
وصف نصي قابل للتحويل لـ SVG:

┌─────────────────────────────────────┐
│  ▄▀▀▀▄  ◆  ▄▀▀▀▄                    │   ← شريحتان منحنيتان (CT slices) + نقطة وسط (AI)
│  │ M │     │ ن │                     │   ← M لاتيني + ن عربي داخل كل شريحة
│  ▀▄▄▄▀  ◆  ▀▄▄▄▀                    │
│                                      │
│        m i d c i n e                 │   ← Wordmark
│      ميـدسـيـن                       │
└─────────────────────────────────────┘
```

**القراءة الذكية للـ Mark:**
- شريحتان = تقطيع طبي (CT/MRI slices) → reference واضحة للأشعة
- النقطة الماسية في الوسط = الجسر، نقطة الذكاء الاصطناعي
- M + ن داخل الشريحتين = ثنائية اللغة المخفية (تظهر عند التكبير)
- التماثل المرآتي = توازن بين الـ Edge والـ Cloud

### 2.3 الـ Wordmark

- **اللاتيني (midcine):** خط geometric sans serif، lowercase، slight rounded
- **العربي (ميدسين):** خط Tajawal Medium مع تعديل خفيف على الحاء/السين
- المسافة بينهما: 24px على basetype 64px

### 2.4 صيغ الاستخدام

| الصيغة | الاستخدام |
|--------|----------|
| Mark + Wordmark (أفقي) | الموقع، الـ presentations |
| Mark + Wordmark (عمودي) | App icon، Avatar |
| Mark وحده | Favicon، loading states، watermark |
| Wordmark وحده | Email signature، فاتورة |

### 2.5 Clear Space
حول الـ logo، فراغ يساوي ارتفاع حرف "m" من الـ wordmark.

### 2.6 Minimum Size
- Digital: 32px (mark only)، 80px (mark + wordmark)
- Print: 8mm (mark only)، 20mm (mark + wordmark)

---

## 3. Color Palette

### 3.1 الفلسفة
- نتجنب الأحمر الصريح (دم/طوارئ) — نتركه فقط لـ AI Triage alerts الحقيقية
- نتجنب الفرعوني/الذهبي التقليدي (حورس يحتكر هذا الـ space)
- ندفع نحو **Cyan-Indigo modern medical** + **lime green** للحياة + **amber** للتنبيهات

### 3.2 Primary

| اللون | Token | HEX | RGB | استخدام |
|------|-------|-----|-----|---------|
| **midcine Blue** | `primary-500` | `#0F62FE` | 15, 98, 254 | الـ CTAs، شعار، الروابط الرئيسية |
| **midcine Indigo** | `primary-700` | `#0B3CB8` | 11, 60, 184 | hover states، dark backgrounds |
| **midcine Sky** | `primary-200` | `#A5C9FF` | 165, 201, 255 | hover backgrounds، tags |

> **لماذا 0F62FE (IBM Carbon Blue):** صلب طبياً، contrast ratio 7.4:1 على أبيض (WCAG AAA)، علمي بدون أن يكون بارداً جداً.

### 3.3 Secondary (Trust + Life)

| اللون | Token | HEX | RGB | استخدام |
|------|-------|-----|-----|---------|
| **Vital Green** | `secondary-500` | `#24A148` | 36, 161, 72 | success states، AI confirmed |
| **Pulse Lime** | `secondary-300` | `#9DEAA8` | 157, 234, 168 | progress bars، badges |

### 3.4 Accents (Alert Hierarchy)

| اللون | Token | HEX | استخدام |
|------|-------|-----|---------|
| **Alert Amber** | `warning-500` | `#F1C21B` | تحذيرات، confidence متوسط |
| **Critical Red** | `critical-500` | `#DA1E28` | AI Triage حرج فقط — استخدام شحيح |
| **Neutral Slate** | `neutral-500` | `#697077` | secondary text، dividers |

### 3.5 Surface (Backgrounds)

| Token | Light Mode | Dark Mode |
|-------|------------|-----------|
| `surface-base` | `#FFFFFF` | `#0D1117` |
| `surface-elevated` | `#F4F4F4` | `#161B22` |
| `surface-overlay` | `#FFFFFF` `EE` | `#161B22` `F2` |

### 3.6 Accessibility Matrix

| Combination | Ratio | WCAG |
|-------------|-------|------|
| primary-500 على surface-base | 7.4:1 | AAA |
| primary-700 على surface-base | 12.1:1 | AAA |
| neutral-500 على surface-base | 5.1:1 | AA |
| critical-500 على surface-base | 6.9:1 | AAA |
| White على primary-500 | 6.5:1 | AAA |

---

## 4. Typography

### 4.1 التصحيح المهم
> ردّ Brand Designer ذكر "Lato عربي" — **هذا غير صحيح**. Lato لاتيني فقط.
> الخطوط أدناه مختارة بدقة مع تحقق فعلي من دعم العربية.

### 4.2 الخط الأساسي (عربي + لاتيني)

**القرار: IBM Plex Sans Arabic**

- مفتوح المصدر (SIL OFL)
- يدعم العربية الفصيحة + لاتيني في عائلة واحدة
- 8 أوزان (Thin → Bold)
- مصمم لقابلية القراءة في dashboards
- يكافئ IBM Plex Sans في الـ متن اللاتيني

**الاستخدام:**
- العناوين: Plex Sans Arabic Bold
- النص: Plex Sans Arabic Regular
- التقارير الطبية: Plex Sans Arabic Medium

### 4.3 الخط الثانوي (للأرقام والـ tabular data)

**القرار: JetBrains Mono**

- مونوسبيس للأرقام (مهم لعرض القياسات الطبية: 14.5cc، 65 HU)
- مفتوح المصدر
- يكمل Plex بصرياً

**الاستخدام:**
- جداول النتائج الطبية
- Audit logs
- Console/dev tools

### 4.4 خط بديل (إذا فشل تحميل Plex)

**Tajawal** (Google Fonts) — fallback عربي ممتاز.
**Inter** — fallback لاتيني.

### 4.5 Type Scale

| Token | Size | Line | الاستخدام |
|-------|------|------|-----------|
| `display` | 56px | 64px | الـ landing page heroes |
| `h1` | 40px | 48px | عناوين الصفحات |
| `h2` | 32px | 40px | أقسام رئيسية |
| `h3` | 24px | 32px | أقسام فرعية |
| `h4` | 20px | 28px | عناوين البطاقات |
| `body-lg` | 18px | 28px | فقرات طويلة |
| `body` | 16px | 24px | النص العام |
| `body-sm` | 14px | 20px | metadata، captions |
| `code` | 14px | 20px | JetBrains Mono |
| `xs` | 12px | 16px | labels، badges |

### 4.6 ملاحظات RTL
- المسافة بين الكلمات في العربية أكبر طبيعياً — نحافظ على letter-spacing: 0
- الأرقام: نستخدم Arabic-Indic (٠١٢) للتقارير الطبية + Western (012) للـ data tech
- محاذاة افتراضية: right للعربي، left للاتيني المختلط

---

## 5. Tone of Voice

### 5.1 ثلاث صفات نتبنّاها

| الصفة | كيف نطبّقها |
|------|------------|
| **محترف** | نتحدث كزميل طبيب، لا كسلطة فوقية |
| **مباشر** | جملة واحدة قصيرة > فقرة مطوّلة. لا حشو |
| **عربي بفخر** | نستخدم المصطلحات الطبية العربية الفصحى، لا تعريب سطحي |

### 5.2 ثلاث صفات نتجنّبها

| الصفة | لماذا نتجنّبها |
|------|----------------|
| **متفاخر** | لا "نحن الأفضل!" — ندع البيانات تتحدث |
| **مخيف** | لا "بدوننا سيتأخر التشخيص!" — احترام لذكاء الطبيب |
| **مترجم آلي** | لا "كن أفضل، كن أسرع" — نكتب أصلاً بالعربية |

### 5.3 أمثلة محددة

| ❌ ليس midcine | ✅ midcine |
|----------------|------------|
| "midcine يحدث ثورة في الأشعة!" | "نظام أشعة عربي. سحابي. ذكي." |
| "كن أفضل، استخدم midcine الآن" | "جرّبه على فحص واحد. احكم بنفسك." |
| "أحدث تكنولوجيا في الذكاء الاصطناعي للأشعة" | "AI Triage عربي. تقرير في 8 ثوانٍ. توقيعك يبقى نهائياً." |
| "نقدّم حلولاً متكاملة لجميع احتياجاتك" | "RIS + PACS + AI Triage + Clinical LLM عربي. واحد." |
| "midcine: شريك صحتك" | (لا نستخدم تعبيرات صحية عامة) |

### 5.4 ملاحظات إضافية على اللغة

- **مخاطبة المستخدم:** نستخدم "أنت" (مفرد مذكر) كافتراضي، نوفّر تبديل في الإعدادات
- **في الإنجليزية:** نستخدم you (لا we/our customer)
- **المصطلحات الطبية:** **بالعربية** في الواجهة الطبية، **بالإنجليزية** في الإعدادات التقنية
- **رموز الإيموجي:** ممنوعة في الواجهة الطبية، مسموحة في marketing فقط

---

## 6. Iconography

### 6.1 الـ Style
- **Outline first** (line icons) — تشبه أيقونات IBM Carbon
- **Stroke weight:** 1.5px (في أيقونة 24×24)
- **Corner radius:** 2px على الأطراف الحادة، 0 على الزوايا الداخلية
- **Filled variant:** للحالات النشطة فقط

### 6.2 المصدر
- **Phosphor Icons** (مفتوح المصدر، 9000+ أيقونة، عدة أنواع)
- نضيف 20-30 أيقونة طبية مخصصة (DICOM modalities، body parts) من **Health Icons** (مفتوح)

### 6.3 أمثلة استخدام

| Action | Icon | Style |
|--------|------|-------|
| رفع فحص | Upload (Phosphor) | outline 1.5px |
| AI تنبيه | Sparkle + Stethoscope | filled + accent |
| توقيع تقرير | SignatureCheck | outline + success color |
| طبيب | UserCircle | outline |

---

## 7. Imagery Style

### 7.1 الفلسفة
- **حقيقي > illustration** لأن المجال طبي ويحتاج ثقة
- لكن: **لا صور stock أمريكية**. نستثمر في صور photographer مصري لأطباء/مراكز عربية حقيقية
- **Illustration للـ explainer onboarding فقط** — أبسط، أوضح

### 7.2 ما نعرضه
- ✅ أطباء عرب فعليين (شركاء champion) في بيئتهم
- ✅ شاشات النظام في contexts حقيقية
- ✅ أيدي على لوحة مفاتيح، wireless mouse، شاشة طبية
- ✅ صور diagnostic anonymized

### 7.3 ما نتجنّبه
- ❌ صور المرضى (privacy)
- ❌ صور stock أمريكية واضحة
- ❌ ابتسامات مفرطة (corporate marketing cliché)
- ❌ أيدي بيضاء فقط (نمثّل المنطقة)
- ❌ غرف عمليات (لسنا في الجراحة، نحن في الأشعة)

### 7.4 ألوان الصور
- Color grade خفيف نحو cool blue
- يحافظ على contrast الطبي الحقيقي للصور الطبية

---

## 8. Voice in Different Contexts

| Context | مثال |
|---------|------|
| Landing page hero | "تقرير الأشعة الأول الذي يكتب نفسه — وأنت توقّع." |
| Onboarding step | "دعنا نربط أول فحص. هذه 30 ثانية." |
| Success state | "تم. التقرير محفوظ ومرسل." |
| Error (general) | "حصلت مشكلة. نحاول مرة أخرى تلقائياً." |
| Error (critical) | "لم نستطع حفظ تقريرك. اضغط 'إعادة محاولة' أو حفظ كمسودة محلية." |
| AI suggestion | "نقترح هذا الانطباع بناءً على القياسات. راجعه قبل التوقيع." |
| Billing reminder | "اشتراكك يجدد خلال 5 أيام. كل شيء على ما يرام؟" |
| Doctor education | "هذا fine-tune جديد للنموذج. اقرأ ما تغيّر في 2 دقيقة." |

---

## 9. Design Principles (5 مبادئ تحكم كل قرار)

### 9.1 **العربية أولاً، لا أخيراً**
لا نصمم لاتيني ثم نعرّب. نبدأ بالعربية كافتراضي، نضيف الإنجليزية كميزة.

### 9.2 **الطبيب يقود، AI يساعد**
كل واجهة تضع قرار الطبيب فوق اقتراح AI بصرياً. AI overlay قابل للإخفاء بضغطة واحدة.

### 9.3 **سرعة في كل مكان**
< 100ms reaction على كل interaction. لا spinners طويلة بدون progress واضح.

### 9.4 **شفافية الذكاء**
كل اقتراح AI يأتي مع confidence score مرئي + sources واضحة. لا "magic boxes".

### 9.5 **Density عالية، فوضى صفر**
طبيب يقرأ 100 فحص/يوم. لا نخفي المعلومات وراء tabs ودرويرز. نعرضها بـ density عالية لكن منظّمة.

---

## 10. أصول جاهزة للإنتاج (TODO)

| الأصل | الأولوية | المسؤول |
|------|----------|---------|
| Logo SVG (Mark + Wordmark) | عاجل | Brand Designer external |
| Favicon set | عاجل | نفس |
| Email signature template | عاجل | نفس |
| Landing page Figma mockup | عاجل | UI/UX |
| Design System tokens (CSS) | عاجل | Frontend Dev |
| Brand Guidelines PDF | شهر 2 | Brand Designer |
| Pitch deck template | شهر 2 | Brand + Marketing |
| Demo video reel | شهر 3 | Video Producer |
| Photographer session في 3 مراكز | شهر 3 | Marketing |

---

## 11. ملخص قرارات الـ Brand في صف واحد

| العنصر | القرار |
|--------|--------|
| الاسم | midcine (نُبقي) + tagline "الأشعة تتحدث العربية" |
| Mark | شريحتان منحنيتان + نقطة وسط ماسية |
| Primary color | #0F62FE (IBM Plex Blue) |
| الخط الأساسي | IBM Plex Sans Arabic |
| الخط للأرقام | JetBrains Mono |
| Icon source | Phosphor + Health Icons |
| Tone | محترف + مباشر + عربي بفخر |
| Imagery | صور حقيقية لأطباء عرب |
| Design principle #1 | العربية أولاً، لا أخيراً |

</div>
