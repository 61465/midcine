<div align="center">

# midcine

**نظام RIS/PACS عربي سحابي من الجيل الجديد**
**Arabic Cloud-Native RIS/PACS — Next-Generation Radiology Platform**

</div>

---

<div dir="rtl" lang="ar">

## نظرة عامة

**midcine** نظام معلومات إشعاعي وأرشفة صور طبية (RIS/PACS) مصمم خصيصاً للسوق العربي:
- **Hybrid Cloud:** البيانات الخام تبقى داخل المركز، السحاب للذكاء فقط
- **Zero-Footprint Viewer:** OHIF v3 + Cornerstone3D — عرض 3D MPR/Volume بدون تثبيت
- **AI Triage:** يفرز الحالات الحرجة تلقائياً (نزيف، كسر) ويرفعها لأعلى Worklist
- **Clinical LLM عربي:** يصيغ تقريراً عربياً مهيكلاً (Jinja2 stub أو Ollama qwen2.5)
- **Segmentation:** overlay 2D + 3D snapshot على العضو/العطل
- **ملف مريض كامل:** تاريخ طبي + مرفقات (تحاليل، أشعة سابقة، روشتات)
- **QR للأطباء الخارجيين:** يمسحون → يرون الحالة → يرفعون ملفاتهم
- **WhatsApp packet:** يُرسَل تقرير PDF + صور segmentation للطبيب المعالج

## المعمارية المختصرة

```
CT/MRI scanner ─► dicom-receiver (pynetdicom) ─► Ingestion API ─► MinIO + Postgres
                                                       │
                                                       ├─► Redis Streams ─► AI Worker ─► triage + segmentation + 3D snapshot
                                                       │                            │
                                                       │                            └─► LLM Service ─► مسودة تقرير عربي
                                                       │
                                                       └─► Web (Next.js 15 RTL) + OHIF v3 (3D MPR + Volume)
                                                                                │
                                                                                ├─► Doctor signs ─► DICOM SR (highdicom)
                                                                                └─► WhatsApp Bridge (Baileys) ─► طبيب معالج
                                                                                
FHIR Gateway R4 ─► HIS/EMR    QR Public ─► طبيب خارجي يدخل بـ scan
```

## التشغيل السريع

> **المتطلبات:** Windows 11 + Docker Desktop + 16GB RAM للأساسي، 24GB مع LLM/WhatsApp

```powershell
git clone <repo> midcine
cd midcine
.\scripts\bootstrap.ps1 -Fixtures
```

السكريبت يقوم بـ:
1. نسخ `.env` من `.env.example`
2. بناء الـ Docker images
3. تشغيل postgres + redis + minio + orthanc + 4 خدمات FastAPI + dicom-receiver + whatsapp-bridge + ohif viewer + web
4. seed مستخدم demo + 200 ICD-11
5. توليد DICOMs اصطناعية (40 شريحة CT brain + chest XR)
6. دفعها للـ pipeline

افتح:
- **Web:** http://localhost:3000 (demo@midcine.io / DemoMidcine!2026)
- **API docs:** http://localhost:8100/docs
- **OHIF Viewer:** http://localhost:3030
- **Orthanc UI:** http://localhost:8042

## تفعيل الميزات الثقيلة

```powershell
# LLM حقيقي (Ollama qwen2.5:3b — 4GB):
.\scripts\bootstrap.ps1 -WithLlm

# WhatsApp حقيقي (Baileys — يتطلب مسح QR من هاتفك):
.\scripts\bootstrap.ps1 -WithWhatsApp
# ثم افتح http://localhost:8500/qr
```

## الخدمات

| الخدمة | المنفذ | الدور |
|--------|--------|------|
| postgres | 5432 | ParadeDB (pgvector + pg_search) |
| redis | 6379 | Streams |
| minio | 9000/9001 | S3-compatible storage |
| orthanc | 8042 / 11112 | DICOM core (REST + DICOMweb + C-STORE) |
| ingestion-api | 8100 | كل APIs الأساسية + WS realtime |
| ai-worker | — | triage + measurements + segmentation + 3D snapshot |
| llm-service | 8300 | توليد تقرير عربي (stub أو Ollama) |
| fhir-gateway | 8400 | FHIR R4 (ImagingStudy + DiagnosticReport) |
| dicom-receiver | 11113 | C-STORE SCP من أجهزة حقيقية |
| whatsapp-bridge | 8500 | Baileys + Redis consumer |
| web | 3000 | Next.js 15 RTL |
| viewer | 3030 | OHIF v3 (3D MPR + Volume) |
| ollama (profile) | 11434 | LLM حقيقي اختياري |

## المكتبات الطبية المُضافة

| الفئة | المكتبة |
|------|---------|
| DICOM I/O | pydicom |
| DICOM Networking | pynetdicom |
| DICOM SR / SEG | highdicom |
| DICOM ↔ NIfTI | dicom2nifti, nibabel |
| Image Processing | SimpleITK |
| FHIR Models | fhir.resources |
| 3D Rendering | pyvista (مُضمَّن لـ snapshots — يُفعَّل لاحقاً) |
| Anatomy Seg | HU thresholding (افتراضي) + TotalSegmentator (profile) |
| Web Viewer | OHIF v3 + Cornerstone3D + vtk.js |
| WhatsApp | Baileys (Node.js) |

راجع `docs/10-MEDICAL-LIBS.md` للقائمة الكاملة + تفاصيل الدمج.

## الوثائق

| | |
|---|---|
| [00-STRATEGY](docs/00-STRATEGY.md) | استراتيجية + سوق |
| [01-ARCHITECTURE](docs/01-ARCHITECTURE.md) | معمارية تقنية |
| [02-ROADMAP](docs/02-ROADMAP.md) | 90 يوم |
| [03-COMPLIANCE](docs/03-COMPLIANCE.md) | HIPAA/GDPR/EDA/سدايا |
| [04-AI](docs/04-AI.md) | استراتيجية AI |
| [05-BUSINESS](docs/05-BUSINESS.md) | تسعير + GTM |
| [06-BRAND](docs/06-BRAND.md) | هوية بصرية |
| [07-DATA-MODEL](docs/07-DATA-MODEL.md) | DB schema |
| [08-API-CONTRACTS](docs/08-API-CONTRACTS.md) | REST + WS |
| [09-PROTOTYPE-SPEC](docs/09-PROTOTYPE-SPEC.md) | مواصفات النموذج التجريبي |
| [10-MEDICAL-LIBS](docs/10-MEDICAL-LIBS.md) | المكتبات الطبية |

## استخدام النموذج التجريبي على أشعة حقيقية

1. **رفع من المتصفح:** اذهب لـ http://localhost:3000/upload — اسحب ملفات DICOM
2. **من جهاز CT/MRI:** وجّه C-STORE إلى:
   - Host: عنوان الخادم
   - Port: 11113
   - AE Title الهدف: `MIDCINE`
3. **من سكريبت:** ضع DICOMs في `apps/edge-pusher/inbox/` وشغّل `python -m app.pusher`
4. **عبر DCMTK simulator:** `storescu -aec MIDCINE -aet MYCT localhost 11113 *.dcm`

## التحقق من الـ E2E

```powershell
# بعد bootstrap -Fixtures
# فحص ct-brain-hemorrhage يجب أن يظهر في worklist بـ P1 خلال 15 ثانية
# مع segmentation overlays + 3D MIP snapshot
# واقتراح تقرير LLM عربي خلال 5 ثوانٍ إضافية
```

## الخريطة الزمنية للإنتاج

> الـ prototype جاهز للعمل على فحص حقيقي **واحد** للعرض على شريك تجريبي.
> الإنتاج الكامل يحتاج 90 يوماً وفق `02-ROADMAP.md`.

</div>

---

## License

Copyright © 2026 midcine — جميع الحقوق محفوظة.
