<div dir="rtl" lang="ar">

# 02 — خارطة طريق MVP (90 يوم)

> **مبدأ:** كل أسبوع ينتهي بشيء **قابل للعرض على طبيب حقيقي**.
> لا أسابيع "إعداد بنية تحتية" بدون مخرج مرئي.
> آخر تحديث: 2026-06-07 | تاريخ MVP المستهدف: **2026-09-05**

---

## نظرة عامة على الـ 90 يوم

| الـ Sprint | الأسابيع | الهدف الواحد | مخرج العرض |
|------------|----------|--------------|------------|
| **Sprint 0** | الأسبوع 1 | إعداد البنية | docker-compose يعمل end-to-end محلياً |
| **Sprint 1** | 2-3 | DICOM Pipeline | فحص حقيقي يدخل Orthanc ويظهر في OHIF |
| **Sprint 2** | 4-5 | الطبقة العربية RTL | OHIF يعمل RTL كامل + worklist عربي |
| **Sprint 3** | 6-7 | Edge Gateway + Cloud | فحص يبث من Edge للسحاب ويُعرض |
| **Sprint 4** | 8-9 | AI Triage الأول | CT brain hemorrhage يكتشف ويُنبّه |
| **Sprint 5** | 10-11 | Clinical LLM عربي | تقرير عربي يولّد تلقائياً من قياسات AI |
| **Sprint 6** | 12 | الصقل والـ Pilot | شريك تجريبي يستخدم النظام يومياً |
| **Sprint 7** | 13 | الاحتفاظية الأولى | حالات حقيقية + مقاييس + شهادة |

---

## Sprint 0 — إعداد البنية (الأسبوع 1)

### الأهداف
- [ ] هيكل monorepo بـ pnpm workspaces + Python uv
- [ ] docker-compose.dev.yml يشغّل: Orthanc + PostgreSQL + MinIO + Redis + OHIF
- [ ] CI/CD أساسي على GitHub Actions
- [ ] domain `dev.midcine.io` + Cloudflare DNS
- [ ] خادم Hetzner CX32 أوّلي مع Coolify

### المخرج للعرض
```bash
git clone midcine && pnpm install && docker compose up
# يظهر OHIF فارغ على localhost:3000 + Orthanc REST على :8042
```

### مَن يبني ماذا
- **عبد الرحمن:** هيكل المشروع + GitHub repos + Cloudflare
- **OpenCode (handoff):** docker-compose الكامل + Hetzner Terraform
- **NEXUS-AI (Architect):** مراجعة الإعدادات

---

## Sprint 1 — DICOM Pipeline (الأسابيع 2-3)

### الأهداف
- [ ] Orthanc يستقبل DICOM C-STORE من DCMTK simulator
- [ ] Orthanc plugin: PostgreSQL + S3/MinIO
- [ ] OHIF متصل بـ Orthanc DICOMweb (WADO-RS + QIDO-RS)
- [ ] أول 3 فحوصات عينة (CT brain, Chest X-ray, MRI knee) معروضة

### الكود الفعلي
```python
# services/ingestion-api/app/dicom_router.py
from fastapi import APIRouter
from orthanc_client import OrthancClient

router = APIRouter()
orthanc = OrthancClient("http://orthanc:8042")

@router.post("/studies/{study_uid}/notify")
async def study_received(study_uid: str):
    # Orthanc webhook: dispatch to AI worker queue
    await redis.xadd("studies:new", {"study_uid": study_uid})
    return {"queued": True}
```

### المخرج للعرض
> فيديو: طبيب يضع فحص CT في مجلد على جهازه، يضغط زر، يفتح المتصفح، يرى الفحص بعد 8 ثوانٍ.

### تحدّيات متوقعة
- Orthanc plugin S3 يحتاج compile from source (نوثّق الخطوات)
- بعض أجهزة الأشعة القديمة ترسل DICOM Implicit VR — Orthanc يقبلها لكن نختبر

---

## Sprint 2 — الطبقة العربية RTL (الأسابيع 4-5)

### الأهداف
- [ ] OHIF Extension `@midcine/rtl-ui` — قلب التخطيط RTL كاملاً
- [ ] OHIF Extension `@midcine/arabic-i18n` — ترجمة كل النصوص
- [ ] Next.js `apps/web` — Worklist عربي + إدارة مرضى
- [ ] خط Tajawal أو Cairo لكل النصوص + IBM Plex Arabic للتقارير

### المخرج للعرض
> طبيب يفتح worklist، يرى أسماء المرضى بالعربي، أرقام الفحوصات بالعربي-الهندي، أيقونات RTL، يضغط على مريض، يفتح Viewer ويرى أدواته بالعربي.

### تفاصيل الـ RTL Extension
```typescript
// apps/viewer/extensions/midcine-rtl/src/index.ts
import { id } from './id';

export default {
  id,
  preRegistration: ({ servicesManager }) => {
    document.documentElement.dir = 'rtl';
    document.documentElement.lang = 'ar';
    servicesManager.services.uiViewportDialogService.config.position = 'right';
  },
  getCommandsModule: () => ({
    definitions: {
      toggleHebrewArabicMode: { commandFn: () => {/* الأرقام الهندية */} }
    }
  }),
};
```

### تحدّيات متوقعة
- بعض أيقونات OHIF مرتبطة بـ CSS مكتوب LTR — نحتاج override
- المسطرة (ruler) تقيس من اليسار — نقلب الاتجاه في الـ overlay

---

## Sprint 3 — Edge Gateway + Cloud Streaming (الأسابيع 6-7)

### الأهداف
- [ ] حزمة Docker `midcine/edge-bundle` — Orthanc + Pusher + Redis في compose واحد
- [ ] Edge Pusher يضغط HTJ2K (مكتبة `pylibjpeg-libjpeg`)
- [ ] WebSocket mTLS بين Edge والسحاب
- [ ] Cloud Ingestion API يستلم + يخزّن في R2
- [ ] Web Viewer يعرض الصور المضغوطة فوراً (HTJ2K decoder في wasm)

### المخرج للعرض
> Edge Gateway على NUC في القاهرة → فحص يرفع → طبيب في الإسكندرية يفتحه على متصفحه في <40 ثانية. مقارنة جانبية مع VPN حورس التقليدي: 8 دقائق.

### مكوّن الـ Pusher (نموذج)
```python
# apps/edge-pusher/app/streamer.py
import asyncio
import websockets
from pylibjpeg import encode

async def push_study(study_path: Path, ws: websockets.WebSocketClientProtocol):
    for dcm_file in study_path.glob("*.dcm"):
        ds = pydicom.dcmread(dcm_file)
        # Compress pixel data with HTJ2K
        compressed = encode(ds.pixel_array, format="JPEG2000", high_throughput=True)
        # Stream as binary frame
        await ws.send(json.dumps({"meta": extract_meta(ds), "size": len(compressed)}))
        await ws.send(compressed)
```

---

## Sprint 4 — AI Triage الأول (الأسابيع 8-9)

### الأهداف
- [ ] MONAI Deploy Express يعمل في container منفصل مع GPU
- [ ] نموذج CT Brain Hemorrhage من MONAI Zoo مُحمّل
- [ ] AI Worker يستهلك Redis Stream، يفك ضغط، يستنتج، يحفظ DICOM GSPS overlay
- [ ] Worklist يرفع الحالات الحرجة لأعلى تلقائياً + WebSocket push للمتصفح

### المخرج للعرض
> 10 فحوصات CT حقيقية (5 طبيعية، 5 بنزيف) ترفع للنظام بترتيب عشوائي → النظام يكتشف الـ 5 الحرجة ويرفعها لأعلى Worklist مع تنبيه أحمر ≤12 ثانية لكل فحص.

### قياس النجاح
- Sensitivity ≥ 85% على عينة 50 فحص (نقبل false positives معتدلة في MVP)
- Specificity ≥ 75%
- وقت استجابة P95 < 15 ثانية

---

## Sprint 5 — Clinical LLM عربي (الأسابيع 10-11)

### الأهداف
- [ ] AceGPT-13B محمّل على GPU (A10G كافٍ، RTX 4090 يعمل)
- [ ] قالب prompt يحوّل قياسات MONAI لتقرير عربي مهيكل
- [ ] RAG: قاعدة معرفة ICD-11 معرّبة في pgvector
- [ ] واجهة Chat panel في OHIF — الطبيب يصحّح بالعربية
- [ ] التقرير يُحفظ كـ DICOM SR + PDF عربي موقّع

### المخرج للعرض
> فحص CT brain لمريض 65 سنة، AI يكتشف نزيف باراميتري أمامي بحجم 12cc → LLM يولّد تقرير عربي مفصّل في <8 ثوانٍ → الطبيب يقرأ، يعدّل جملتين، يضغط "اعتمد" → PDF عربي مع توقيع رقمي يُحفظ تلقائياً.

### قالب الـ Prompt (نموذج)
```
أنت طبيب أشعة مصري خبير. اكتب تقريراً طبياً عربياً رسمياً للفحص التالي.

نوع الفحص: {modality} {body_part}
عمر المريض: {age}، الجنس: {sex}
قياسات تلقائية من نظام AI:
{measurements_json}

اكتب التقرير بالشكل التالي:
- التقنية المستخدمة:
- النتائج:
- الانطباع:
- التوصيات:

استخدم المصطلحات الطبية العربية الرسمية. أضف رمز ICD-11 المناسب في الانطباع.
```

---

## Sprint 6 — الصقل والـ Pilot (الأسبوع 12)

### الأهداف
- [ ] تنصيب Edge Gateway في مركز شريك حقيقي (تم الاتفاق مع المركز X في الأسبوع 4)
- [ ] تدريب 3 أطباء + فني واحد (نصف يوم لكل دور)
- [ ] أول 50 فحص حقيقي يمر من النظام كاملاً
- [ ] استخراج logs + قياس أداء فعلي vs مستهدف
- [ ] دفتر ملاحظات الطبيب يومياً (نقاط احتكاك)

### المخرج للعرض
> فيديو: يوم عمل كامل في مركز الشريك مع midcine بدون حورس. مقارنة عدد الفحوصات، وقت كتابة التقرير، رضا الطبيب.

---

## Sprint 7 — الاحتفاظية الأولى (الأسبوع 13)

### الأهداف
- [ ] جمع بيانات الأسبوع الأول من الـ Pilot
- [ ] تقرير حالة دراسية موثّق (Anonymized)
- [ ] شهادة الطبيب الرئيسي (فيديو + كتابي)
- [ ] قائمة Bugs المحلولة vs المتبقية
- [ ] خطة Sprint 8-12 (الأسابيع 14-26 — ما بعد MVP)

### المخرج للعرض
> Demo Day داخلي: عبد الرحمن + الطبيب الشريك + مستثمر/شريك محتمل واحد على الأقل.

---

## ما بعد الـ 90 يوم — الخطة الإجمالية

### الشهور 4-6 (Q4 2026)
- توسيع AI Triage: Chest X-ray + Lung Nodule
- 3 مراكز مدفوعة بسعر مخفض
- تكامل FHIR مع أول HIS (نختار النظام الأكثر شيوعاً عند الشركاء)
- Mobile-responsive viewer (لا Native app بعد)

### الشهور 7-9 (Q1 2027)
- DICOM SR كامل (يستبدل PDF كمعيار التبادل)
- Multi-tenant SaaS واجهة self-onboarding
- midcine Chain (لوحة multi-branch)

### الشهور 10-12 (Q2 2027)
- Mammography AI
- تطبيق Mobile (Flutter)
- بدء تجريبي في السعودية

---

## مخاطر الجدول الزمني

| الخطر | الاحتمال | التأثير | تخفيف |
|--------|----------|---------|--------|
| Orthanc S3 plugin يعطّل | متوسط | -3 أيام | بديل: FUSE mount على MinIO |
| AceGPT inference بطيء | متوسط | -5 أيام | بديل: vLLM + quantization 4-bit |
| الشريك يلغي | منخفض | -أسبوعان | لدينا مركزان احتياط جاهزان |
| MONAI نموذج لا يدقّق على CT عربي | متوسط | -أسبوع | البدء بـ chest x-ray (أبسط، نماذج أكثر) |
| HTJ2K decoder بطيء في المتصفح | منخفض | -3 أيام | fallback لـ JPEG 2000 العادي |

---

## مقاييس النجاح للـ MVP

في يوم 90، يجب أن يتحقق التالي:

- ✅ شريك واحد يستخدم النظام يومياً (≥20 فحص/يوم)
- ✅ AI Triage يكتشف ≥80% من حالات النزيف الحاد
- ✅ Clinical LLM يولّد تقريراً مقبولاً للطبيب في ≥70% من الحالات (يحتاج <3 تعديلات)
- ✅ وقت من رفع الفحص لظهوره في worklist الطبيب: P95 < 60 ثانية
- ✅ Uptime خلال الـ 30 يوم الأخيرة ≥ 99%
- ✅ شهادة موقّعة من الطبيب الرئيسي

> إذا تحقق 5 من 6 → MVP ناجح، نبدأ المرحلة التجارية.
> إذا تحقق 3 أو أقل → نوقف، نراجع المعمارية، نعيد التخطيط.

</div>
