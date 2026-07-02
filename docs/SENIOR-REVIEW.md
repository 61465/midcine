# midcine — مراجعة Senior + مقارنة بأنظمة الإنتاج

**التاريخ:** 2026-07-02
**المُراجع:** بعد بحث فعلي على معايير الصناعة (IHE / DICOM / HL7 / FHIR / DICOM SR) ومسح كامل للـ codebase.

**الخلاصة في جملة:** midcine حالياً **prototype تعليمي جميل بواجهة عربية RTL مميزة**، لكنه **ليس نظام RIS/PACS إنتاجي**. الفجوة عن أي نظام يعمل في مشفى حقيقي (Sectra / Fujifilm Synapse / Merge / GE Centricity / Aidoc) تُقدَّر بـ **9-15 شهر عمل جاد بفريق ٣-٥ أشخاص** حتى يصل لمستوى pilot صالح للاستخدام السريري.

---

## 1. ما تفعله أنظمة الإنتاج الحقيقية (المعيار)

اعتماداً على بحث محدَّث 2026 على [IHE Radiology Technical Framework](https://www.ihe.net/uploadedFiles/Documents/Radiology/IHE_RAD_TF_Vol2x.pdf)، [GE HealthCare IHE integration statements](https://www.gehealthcare.com/middle-east/products/radiology-pacs-workstations-mammo-ris-ihe-integration-statements)، و [MedDream / Encord DICOM viewer requirements](https://encord.com/blog/best-dicom-viewers/):

### 1.1 معايير التكامل الإلزامية
| المعيار | الوظيفة | midcine |
|---|---|---|
| **IHE SWF** (Scheduled Workflow) | تدفق طلب من HIS → RIS → Modality → PACS | ❌ لا يوجد |
| **IHE PIR** (Patient Information Reconciliation) | مطابقة demographics عند تصحيح البيانات | ❌ |
| **IHE ATNA** (Audit Trail & Node Auth) | audit log مطابق للمعيار + secure node authentication | جزئي (audit.py يكتب JSONL لكنه ليس ATNA-compliant) |
| **IHE SINR / XDS-I.b** (Cross-doc sharing) | مشاركة صور بين مستشفيات | ❌ |
| **DICOM MWL SCP** | Modality Worklist — الأجهزة تسحب قائمة المهام | ❌ (dicom-receiver يستقبل فقط) |
| **DICOM MPPS** (Modality Performed Procedure Step) | تحديث حالة الفحص من الجهاز | ❌ |
| **DICOM SR** (Structured Reporting) | تقارير machine-readable مع قياسات + observations | ❌ (نولّد نصاً حراً فقط) |
| **HL7 ORM^O01** | استقبال أوامر من HIS | ❌ (fhir-gateway stub) |
| **HL7 ORU^R01** | إرسال نتائج للـ HIS | ❌ |
| **HL7 ADT** (A01/A04/A10/A11) | مزامنة demographics + arrival status | ❌ |
| **FHIR R4 ImagingStudy** | REST-based interop حديث | Stub فقط |
| **FHIR R4 DiagnosticReport** | Stub فقط | ❌ |

**الخلاصة:** midcine ليس متكاملاً مع أي HIS أو RIS حالياً. لا يمكن ربطه بمشفى فعلي بدون كتابة كل ما سبق.

### 1.2 عارض DICOM (بمعيار PowerScribe / OHIF / Sectra)

| ميزة إكلينيكية | midcine اليوم | معيار الإنتاج |
|---|---|---|
| Window/Level presets | 1 tool | ✅ Bone(W2000/L500) · Lung(W1500/L-600) · Soft tissue · Brain(W80/L40) · Liver · Mediastinum |
| **MPR** (Multi-Planar Reconstruction) | ❌ | Axial + Coronal + Sagittal إلزامي لأي CT |
| **MIP** (Maximum Intensity Projection) | ❌ | ضروري للأوعية الدموية |
| **Volume Rendering** | ❌ (Placeholder فارغ حذفناه) | ضروري 3D |
| **Hanging Protocols** | ❌ | تخطيط تلقائي حسب نوع الفحص + مقارنة prior |
| **Cine mode** | ❌ | تشغيل CT/MR series كفيديو |
| **Measurements** (linear/angle/ROI/Cobb) | ❌ | ضروري إكلينيكياً |
| **Annotations** | ❌ | مع حفظ في DICOM PR (Presentation State) |
| Load speed multi-frame | 1 frame فقط | ~200-500 slice CT chest يحمّل تدريجياً |
| Prior comparison | ❌ | مطابقة تلقائية مع الفحوصات السابقة |
| Segmentation overlay | ❌ | DICOM SEG import + display |

**الحقيقة:** ما لدينا حالياً هو **Cornerstone3D بسيط يعرض شريحة واحدة**. لا يصلح للاستخدام السريري.

### 1.3 التقارير (بمعيار PowerScribe / Nuance)

| ميزة | midcine اليوم | معيار الإنتاج |
|---|---|---|
| مسودّة AI | ✅ (Naraya) | ✅ |
| **Speech recognition** (dictation) | ❌ | Nuance PowerScribe / Dragon مطلوب |
| **Structured Reporting** (SR templates) | ❌ (نص حرّ فقط) | ACR CDE / RSNA RadReport templates |
| **Auto-fill measurements من DICOM SR** | ❌ | يوفّر 25% من وقت التقرير |
| Multi-signature workflow | ❌ (توقيع واحد فقط) | Resident → Attending → Final |
| Report versioning + amendments | ❌ | مطلوب قانونياً |
| Voice commands (next study / done) | ❌ | معيار Powerscribe |
| Auto-send to referrer via HL7 ORU | ❌ | ← نحن نستخدم WhatsApp mock! |

### 1.4 الأمن / الامتثال

| ضمانة | midcine اليوم | معيار الإنتاج |
|---|---|---|
| **OAuth2 / OIDC / SSO** (Azure AD, Okta) | ❌ (JWT بسيط في ingestion-api) | إلزامي |
| **SAML** للـ enterprise | ❌ | إلزامي |
| **2FA** إلزامي | ❌ (مذكور فقط) | إلزامي عند التوقيع |
| **RLS على DB** | migration موجود، غير مُختبَر | إلزامي |
| **Field-level PHI encryption** | AES-256-GCM stub | إلزامي |
| **ATNA-compliant audit** | ❌ (JSONL محلي، ليس Syslog TLS + hash chain) | إلزامي للـ HIPAA |
| **HIPAA BAA** | ❌ | إلزامي |
| **GDPR / سدايا PDPL DPA** | ❌ | إلزامي |
| **DR + Backup RPO/RTO** | ❌ (mentioned) | ≤ 15 min RPO · ≤ 4 hr RTO |
| **DICOM TLS** | ❌ (بلا تشفير في dicom-receiver) | إلزامي للـ intra-hospital |

---

## 2. مسح صادق للـ codebase (كل خدمة)

### 2.1 mcp-bridge (1,538 سطر Python — النواة الحيّة)
- ✅ يعمل فعلاً — يستدعي Naraya، aggregator سليم، atlas matcher deterministic
- ⚠️ **لا يوجد unit tests** ولا integration tests
- ⚠️ **circuit breaker غير مُختبَر** تحت الفشل الحقيقي
- ⚠️ **لا rate limiting** على /pipeline (Naraya quota + cost exposure)
- ⚠️ **يعتمد على Naraya cloud** — خرق واضح لمبدأ Edge-First الذي نبيعه

### 2.2 dicom-receiver
- Skeleton فقط: `handle_store` بلا debounce حقيقي، بلا AET whitelist مفعّل، بلا **DICOM TLS**
- لا يرسل للـ ingestion-api فعلياً (URL في env لكن الـ end-to-end pipeline محلي غير مُختبَر)

### 2.3 ingestion-api
- Routers موجودة (auth, instances, reading, patient, public, realtime) لكن **غير مُشغَّلة/مُختبَرة** في هذه الجلسة
- Storage → MinIO buckets، DB → Postgres migrations موجودة
- **RLS policies موجودة لكن غير مُختبَرة**
- **لا connection مع apps/web** حالياً — الواجهة تكلّم mcp-bridge فقط

### 2.4 fhir-gateway
- Stub فقط. لا يعمل. مذكور في `/connect` كـ "connected" لكنه **كذبة**

### 2.5 whatsapp-bridge (Node/Baileys)
- موجود كـ skeleton، لا يعمل في هذا العرض
- الحقيقة: `whatsapp_mock.py` يكتب JSONL محلي، **لا رسالة WhatsApp حقيقية تُرسَل**

### 2.6 ai-worker / vision-ai / llm-service
- ai-worker: HU thresholding stub فقط (`triage_stub.py`)
- vision-ai / llm-service: **مجلدات موجودة، محتوى وظيفي غير مُشغَّل**

### 2.7 apps/web
- ✅ Landing + 7 routes ترجع 200
- ✅ Anatomy 3D + SVG + waveforms تعمل حقاً (three.js + react-three-fiber)
- ✅ Report editor + toggle i18n + empty states
- ⚠️ DICOM viewer يحمّل **شريحة واحدة CT** — ليس سلسلة، ليس multi-planar
- ⚠️ i18n toggle موجود لكن **80%+ من النصوص Arabic-only** (landing, layout, buttons, tooltips)
- ⚠️ Landing hero + trust points + philosophy = نصوص عربية hardcoded

---

## 3. الفجوة الحقيقية عن الإنتاج

### 3.1 ما هو غير موجود إطلاقاً (Blocker للـ MVP)

| المفقود | جهد التنفيذ | ضرورة |
|---|---|---|
| **DICOM MWL SCP** (يجب على الأجهزة سحب المهام) | 2-3 أسابيع | 🚨 blocker |
| **HL7 v2 ORM listener** | 3-4 أسابيع | 🚨 blocker |
| **HL7 v2 ORU sender** | 2 أسبوع | 🚨 blocker |
| **DICOM Structured Reporting output** | 3-4 أسابيع | 🚨 مهم |
| **MPR / MIP في العارض** | 4-6 أسابيع | 🚨 blocker |
| **Hanging protocols** | 2-3 أسابيع | 🚨 blocker |
| **Measurement / annotation tools** | 3-4 أسابيع | 🚨 blocker |
| **Multi-series DICOM loading** (200+ شريحة) | 2 أسبوع | 🚨 blocker |
| **Prior comparison** | 2-3 أسابيع | 🟡 مهم جداً |
| **Report templates (RadReport / ACR CDE)** | 3-4 أسابيع | 🟡 |
| **Voice dictation** (integrate Whisper / Vosk Arabic) | 4-6 أسابيع | 🟡 |
| **OAuth2/OIDC + SAML SSO** | 2-3 أسابيع | 🚨 blocker |
| **DICOM TLS + ATNA syslog** | 2 أسبوع | 🚨 blocker امتثال |
| **Real WhatsApp Business API** | 2-3 أسابيع | 🟡 (mock يكفي للـ demo) |
| **Multi-hospital tenancy** (RLS + real testing) | 2 أسبوع | 🟡 |
| **DR + backup automation** | 2-3 أسابيع | 🚨 blocker |
| **PACS conformance statement** | 1-2 أسبوع | 🚨 قانوني |
| **CE Mark / SFDA / EDA registration** | 6-12 شهر (خارج التطوير) | 🚨 قانوني |

### 3.2 ما يعمل لكن غير كافٍ للإنتاج
- ✅ Anatomy Atlas (21 حالة SVG) — جميل للتعليم لكن ليس تشخيصياً
- ✅ AI Ensemble — يعمل لكنه **يعتمد على Naraya**، لا LLM محلي
- ✅ Audit — يكتب JSONL، لكنه ليس WORM حقيقي (append-only بلا cryptographic chain)
- ✅ Report editor — الأقسام موجودة، بلا SR / templates / signatures متعدّدة

### 3.3 ما مذكور كذباً في الوثائق / الـ UI
- ❌ `"محرك FHIR R4 متكامل"` — stub فقط
- ❌ `"WhatsApp تسليم"` — mock محلي، لا رقم WhatsApp حقيقي
- ❌ `"HIPAA + GDPR + سدايا + EDA — dossier جاهز"` — **غير صحيح**
- ❌ `"46 وكيل NEXUS-AI"` — نستخدم 4 فقط
- ❌ `"Edge-First DICOM لا يغادر المشفى"` — Naraya cloud endpoint خارجي، مسار الـ AI **يخرق هذا**

---

## 4. مقارنة مباشرة مع Aidoc / Rad AI / DeepBench

على عكس ما قلناه في `docs/HOSPITAL-PITCH.md`:

| بند | midcine الحقيقي | Aidoc | Rad AI |
|---|---|---|---|
| CE Mark / FDA 510(k) | ❌ | ✅ 20+ approvals | ✅ |
| Clinical trials | ❌ | 400+ hospitals | 200+ |
| DICOM SR output | ❌ | ✅ | ✅ |
| MPR/MIP viewer | ❌ | ✅ (integration مع PACS) | لا يبني viewer |
| HL7/DICOM integration | Stub | Production ready | Production ready |
| Voice dictation | ❌ | ✅ Nuance integration | ✅ core product |
| Multi-language reports | Arabic (لا EN كامل) | English + partial i18n | English + Nuance TTS |

**الحقيقة الصادقة:** لا يمكن بيع midcine اليوم لمشفى تشتري Aidoc.

---

## 5. الميزات الفريدة الفعلية لـ midcine (بدون مبالغة)

بعد التنقية:
1. **واجهة عربية RTL مصمَّمة أصلياً** — فعلاً مميزة
2. **Atlas مرضي بصري** (21 حالة SVG state-driven) — مبتكر تعليمياً، ليس تشخيصياً
3. **AI ensemble مع matching للأطلس** — pattern جيد لكن يحتاج نماذج طبية حقيقية بدل Naraya cloud
4. **مبدأ Edge-First** كطموح — لكن **لا يوجد Edge implementation حقيقية حتى الآن**
5. **بناء حديث** (Next.js 15 + FastAPI + React 19) — أفضل من legacy PHP/Java في PACS التقليدية

---

## 6. التصنيف الصادق للحالة الحالية

| التصنيف | midcine |
|---|---|
| **prototype تعليمي / portfolio piece** | ✅ نعم |
| **demo لجذب مستثمر / فكرة** | ✅ نعم (مع تنقية الادّعاءات) |
| **PoC صالح لعرض على مدير مشفى مبدئي** | ⚠️ بشرط الصدق التام عمّا يعمل |
| **Alpha جاهز لـ pilot بمشفى صغير** | ❌ لا |
| **MVP إنتاجي صالح للاستخدام السريري** | ❌ لا |
| **معتمَد قانونياً (SFDA/EDA/CE)** | ❌ لا |

---

## 7. توصية Senior للخطوات التالية

### الخيار أ: تحويله لـ startup حقيقي (12-18 شهر)
1. **جمع تمويل seed** (SAR 2-3M) + توظيف: 2 dev backend، 1 dev frontend، 1 radiology consultant، 1 QA + compliance
2. **بناء الأساس الإلزامي (Q1-Q2):** MWL SCP + HL7 v2 + MPR viewer + measurements + hanging protocols
3. **الامتثال (Q2-Q3):** HIPAA + سدايا + EDA registration
4. **Pilot (Q4):** مشفى صغير في السعودية / مصر — قياس واقعي
5. **قرار Q4 2027:** التوسع أم البيع كـ IP لشركة كبيرة

### الخيار ب: تركيزه كأداة **AI-add-on** للـ PACS القائمة
- **لا نتنافس مع Aidoc** — نصبح **layer عربي فوق PACS موجود**
- integration واحد: DICOM Query/Retrieve من Orthanc/GE + توليد تقارير AI عربية
- WhatsApp delivery = الميزة الوحيدة الفريدة الفعلية
- فرصة أسرع للسوق (6-9 شهور)، ريسك تقني أقل بكثير

### الخيار ج: تحويله لـ **مكتبة أكاديمية / EdTech**
- Atlas مرضي بصري = fit ممتاز للتعليم الطبي (كليات الطب + مقيمين)
- 21 حالة → 200 حالة تفاعلية بالعربية
- ليست منتج مشفى، بل **منتج تعليمي** — سوق أسهل، منافسة أقل

---

## 8. ماذا يجب أن نقوله للمشفى بصدق

بدلاً من:
> "نظام RIS/PACS كامل، NEXUS Ensemble، edge-first، جاهز للنشر"

نقول:
> "**PoC** يوضح كيف يمكن أن تبدو **طبقة AI عربية فوق PACS الموجود عندكم**. الميزة الرئيسية: **تقارير عربية آلية + تسليم WhatsApp**. لبناء نسخة إنتاجية نحتاج ٩-١٢ شهر مع دعمكم كـ pilot. **لا يستبدل نظامكم الحالي.**"

هذا **قابل للبيع** — Aidoc نفسه بدأ هكذا (AI فوق PACS الموجود).

---

## المصادر

- [Medical Imaging & PACS Software Guide 2026 — MedSoftwares](https://www.medsoftwares.com/news/medical-imaging-pacs-software-guide-2026)
- [IHE Radiology Technical Framework Volume 2x](https://www.ihe.net/uploadedFiles/Documents/Radiology/IHE_RAD_TF_Vol2x.pdf)
- [GE HealthCare IHE Integration Statements](https://www.gehealthcare.com/middle-east/products/radiology-pacs-workstations-mammo-ris-ihe-integration-statements)
- [MedDream MPR Features](https://meddream.com/documentation/user-guide/mpr-features/)
- [Encord — 15 Best DICOM Viewers 2026](https://encord.com/blog/best-dicom-viewers/)
- [DICOM Structured Reporting — Dicom Systems](https://dcmsys.com/dicom-structured-reporting/)
- [RIS PACS Integration — HL7 & DICOM Worklist — Medicai](https://blog.medicai.io/en/ris-pacs-integration/)
- [dcm4chee Modality Worklist SCP](https://dcm4che.atlassian.net/wiki/spaces/ee2/pages/2555955/Modality+Worklist+SCP)
- [pacs_bridge — HL7 v2/FHIR R4 gateway with DICOM MWL/MPPS](https://github.com/kcenon/pacs_bridge)
- [Efficient structured reporting using speech + NLP — NCBI](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10019433/)
- [AI results into structured radiology reports — NCBI](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10951179/)

**آخر تحديث:** 2026-07-02 · مراجعة بعد بحث محدَّث + code audit كامل.
