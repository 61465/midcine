<div dir="rtl" lang="ar">

# 10 — المكتبات البرمجية الطبية

> **المبدأ:** لا تعيد اختراع DICOM ولا FHIR ولا Segmentation. استخدم مكتبات ناضجة ومجتمعها قوي.
> آخر تحديث: 2026-06-14

---

## 1. خريطة الاستخدام في midcine

| الطبقة | المكتبة | في أي خدمة | لماذا |
|--------|---------|------------|--------|
| **DICOM I/O** | `pydicom` | كل خدمة تلمس DICOM | معيار الـ Python؛ موجود فعلاً |
| **DICOM Networking (C-STORE/C-FIND/C-MOVE)** | `pynetdicom` | new: `services/dicom-receiver/` | يستقبل من أجهزة CT/MRI حقيقية |
| **DICOM SR (Structured Reports)** | `highdicom` | ingestion-api (عند sign report) | يولّد تقارير DICOM SR قياسية → تتدفق لـ HIS كأي تقرير حقيقي |
| **DICOM SEG (Segmentation Object)** | `highdicom` | ai-worker (عند seg) | يحفظ overlay segmentation كـ DICOM SEG → OHIF يعرضها native |
| **DICOM ↔ NIfTI** | `dicom2nifti`, `nibabel` | ai-worker | تحويل series لـ NIfTI لاستخدامها مع MONAI/TotalSeg |
| **Image Processing** | `SimpleITK` | ai-worker | registration, resampling, filtering — أقوى من numpy خام |
| **CT/MRI Anatomy Segmentation** | `TotalSegmentator` | ai-worker (profile=heavy-ai) | 104 بنية تشريحية، CPU mode |
| **Medical Deep Learning Framework** | `MONAI` | ai-worker (إنتاج) | نماذج جاهزة + transforms + DICOM-native |
| **3D Volume Rendering** | `pyvista` + `vtk` | ai-worker (snapshots) | يولّد PNG 3D للـ packet — أفضل من MIP يدوي |
| **FHIR R4 Models** | `fhir.resources` (Python) | fhir-gateway | Pydantic models قياسية بدلاً من dict-yдوي |
| **FHIR Client (Web)** | `fhirclient.js` / `@types/fhir` | apps/web (لاحقاً) | تكامل مع EHR/HIS |
| **DICOMweb Client** | `dicomweb-client` (Python) | edge-pusher v2 | بديل لـ multipart REST عند الانتقال لـ QIDO/WADO |
| **Web DICOM Viewer (احتياط)** | `dwv` | بديل خفيف لـ OHIF عند الحاجة | أصغر، أقل ميزات |
| **HL7v2 Parsing** | `hl7apy` | fhir-gateway (HIS legacy) | بعض المستشفيات لا تزال تستخدم HL7v2 |
| **ICD-11 / Terminology** | `pyicd` + WHO API | llm-service (RAG indexer) | لتعريف الـ codes الواردة من LLM |
| **Anonymization** | `dicognito`, `gdcm` | edge-pusher | قبل رفع DICOMs البحثية |
| **OCR for prior PDFs** | `paddleocr`, `tesseract` | attachments worker | لاستخراج نصوص من تقارير ورقية مرفوعة |
| **Whisper for voice dictation** | `faster-whisper` (CPU) | new: voice-service | إملاء صوتي عربي للطبيب |

---

## 2. المكتبات المُضافة فعلياً في النموذج التجريبي

### 2.1 الأساسية (إلزامية في dev)

| المكتبة | الإصدار الأدنى | الخدمة |
|---------|---------------|--------|
| `pydicom` | 2.4 | ingestion, ai-worker, edge-pusher |
| `pynetdicom` | 2.1 | dicom-receiver (جديدة) |
| `highdicom` | 0.24 | ingestion-api (DICOM SR) |
| `dicom2nifti` | 2.4 | ai-worker |
| `nibabel` | 5.2 | ai-worker |
| `SimpleITK` | 2.4 | ai-worker |
| `fhir.resources` | 7.1 | fhir-gateway |
| `pyvista` | 0.44 | ai-worker (snapshots) |

### 2.2 الاختيارية (profile=heavy-ai)

| المكتبة | السبب | تكلفة |
|---------|------|------|
| `TotalSegmentator` | segmentation أناتومي حقيقي | ~3GB download + 2-5min/CT على CPU |
| `MONAI` | pretrained models (brain hemorrhage) | ~2GB |
| `faster-whisper` (medium-ar) | إملاء عربي | ~1.5GB |
| `paddleocr` | OCR للتقارير الورقية المرفوعة | ~500MB |

### 2.3 ما رفضناه ولماذا

| المكتبة | الرفض |
|---------|------|
| `dcm4che` (Java) | JVM heavy، Orthanc يكفي |
| `OHIF v2` | قديم؛ v3 يدعم Cornerstone3D |
| `cornerstone-legacy` | استبدله Cornerstone3D |
| `imageio-dicom` | محدود؛ pydicom أقوى |
| `dicom-rs` (Rust) | غير ناضج كفاية للإنتاج 2026 |

---

## 3. تفاصيل دمج كل مكتبة

### 3.1 `highdicom` — DICOM SR + SEG

**أين:** `services/ingestion-api/app/routers/reading.py` — عند `POST /reports/{id}/sign` يولّد DICOM SR موازياً للـ PDF.

**فائدة:** يجعل التقرير قياسي صناعياً → يدخل أي HIS/PACS آخر بدون نقاش.

```python
import highdicom as hd
from highdicom.sr import (
    ComprehensiveSR, CodeContentItem, TextContentItem,
    SourceImageForRegion, CodedConcept,
)

sr = ComprehensiveSR(
    evidence=[study_ds],   # نمرّر pydicom datasets للـ instances
    content=[
        TextContentItem(name=CodedConcept('121071','DCM','Finding'), value=report.findings_ar),
        TextContentItem(name=CodedConcept('121072','DCM','Impression'), value=report.impression_ar),
    ],
    series_instance_uid=hd.UID(),
    sop_instance_uid=hd.UID(),
    series_number=999,
    institution_name='midcine',
    manufacturer='midcine',
)
sr.save_as('/tmp/sr.dcm')
# ثم نرفعها لـ Orthanc → تظهر كـ companion series
```

### 3.2 `pynetdicom` — استقبال DICOM C-STORE من جهاز حقيقي

**أين:** `services/dicom-receiver/` (خدمة جديدة) — تستمع على المنفذ 11112، تستلم C-STORE من CT/MRI scanner، تنقلها للـ Ingestion API.

**لماذا منفصلة عن Orthanc:** Orthanc يكفي للـ MVP، لكن `pynetdicom` يعطينا التحكم الكامل (whitelist AET، DLP، تحويل الـ transfer syntax). نحتفظ بـ Orthanc كـ "storage backend" ونضع pynetdicom كـ ingress.

### 3.3 `dicom2nifti` + `nibabel` + `SimpleITK` — معالجة الحجم

**أين:** `services/ai-worker/app/segmentation.py` — استبدال يدوي للـ `_load_volume`.

**فائدة:** يتعامل مع:
- ترتيب الشرائح الصحيح (ImagePositionPatient)
- تحويل HU
- resampling لـ isotropic voxels (مطلوب لـ MONAI/TotalSeg)
- exports NIfTI للـ pipeline التالي

```python
import dicom2nifti
import SimpleITK as sitk

# series_dir = مجلد فيه كل الـ DICOMs
dicom2nifti.convert_directory(series_dir, output_dir, compression=True)
# الآن لدينا series.nii.gz
img = sitk.ReadImage('series.nii.gz')
img_iso = sitk.Resample(img, ... )   # 1×1×1 mm
```

### 3.4 `TotalSegmentator` — segmentation تشريحي حقيقي

**أين:** `services/ai-worker/app/totalseg.py` — profile=heavy-ai في docker-compose.

**ميزة:** يجزّئ 104 بنية (دماغ، عظام، أعضاء داخلية) من CT body — بديل عن HU thresholding اليدوي.

**عيب:** بطيء على CPU (2-5 دقيقة لكل فحص).

**القرار للـ MVP:** متاح خلف profile، الافتراضي يبقى HU thresholding السريع.

### 3.5 `pyvista` + `vtk` — تجسيم 3D للـ packet

**أين:** `services/ai-worker/app/render_3d.py` — يستبدل MIP اليدوي.

**فائدة:** يولّد PNG 3D حقيقي (volume rendering + surface mesh للعظم + overlay الـ segmentation بلون).

```python
import pyvista as pv
import numpy as np

grid = pv.ImageData(dimensions=vol.shape, spacing=(0.6, 0.6, 5.0))
grid['HU'] = vol.flatten(order='F')
p = pv.Plotter(off_screen=True, window_size=(800, 800))
p.add_volume(grid, scalars='HU', cmap='bone', opacity='sigmoid', clim=[0, 1500])
if hem_mask.any():
    seg = pv.ImageData(dimensions=hem_mask.shape, spacing=(0.6, 0.6, 5.0))
    seg['mask'] = hem_mask.astype(np.float32).flatten(order='F')
    p.add_volume(seg, scalars='mask', cmap='Reds', opacity=[0, 0.8])
png = p.screenshot(return_img=True)   # numpy RGB
```

### 3.6 `fhir.resources` — FHIR Pydantic models

**أين:** `services/fhir-gateway/app/main.py` — استبدال dict-yدوي.

```python
from fhir.resources.diagnosticreport import DiagnosticReport
from fhir.resources.codeableconcept import CodeableConcept

dr = DiagnosticReport(
    status='final',
    code=CodeableConcept(coding=[{'system':'http://loinc.org','code':'36143-5'}]),
    subject={'reference': f'Patient/{mrn}'},
    issued=signed_at,
    conclusion=impression_ar,
)
return dr.dict(exclude_none=True)
```

### 3.7 `faster-whisper` — إملاء صوتي عربي (اختياري)

**أين:** `services/voice-service/` (إذا تم تفعيله) — يحوّل صوت الطبيب لنص عربي.

النموذج `large-v3` يدعم العربية جيداً، لكن `small.ar` يكفي للـ MVP CPU.

### 3.8 `paddleocr` — OCR للتقارير الورقية

**أين:** `services/attachments-worker/` (جديد، اختياري) — عند رفع PDF/JPG لتقرير سابق، يستخرج النص العربي + الإنجليزي ويفهرسه للـ RAG.

---

## 4. حزم JS/TS طبية للـ Web

| الحزمة | الاستخدام |
|--------|-----------|
| `@cornerstonejs/core` | محرك العرض (داخل OHIF) |
| `@cornerstonejs/tools` | الأدوات (قياسات، annotations) |
| `dicom-parser` | parse meta في المتصفح |
| `dcmjs` | تحويل DICOM ↔ JSON في المتصفح |
| `@cornerstonejs/streaming-image-volume-loader` | تحميل volume progressive |
| `@kitware/vtk.js` | 3D rendering في المتصفح (يستخدمه Cornerstone3D) |
| `fhirclient` | SMART on FHIR client للويب |
| `react-medical-icons` | أيقونات طبية |
| `@osi/dicom-web-viewer` (DWV) | بديل خفيف لـ OHIF |

---

## 5. مقياس النضج (Library Maturity Score)

> **قاعدة midcine:** لا نضيف مكتبة طبية بنضج <7/10. حياة المرضى لا تقبل bleeding edge.

| المكتبة | النضج | السبب |
|---------|-------|------|
| pydicom | 10/10 | ناضج جداً، صناعي |
| Orthanc | 10/10 | إنتاج منذ 2012 |
| OHIF v3 | 9/10 | مدعوم MGH/NIH |
| Cornerstone3D | 8/10 | جديد لكن مدعوم بقوة |
| MONAI | 9/10 | NVIDIA + 100+ مساهم |
| TotalSegmentator | 8/10 | منشور ورقياً، مستخدم في 50+ مؤسسة |
| highdicom | 8/10 | مؤلفاه أكاديميون نشطون |
| pynetdicom | 9/10 | معيار de-facto لـ Python |
| fhir.resources | 9/10 | يتبع HL7 R4 رسمياً |
| Baileys (WhatsApp) | 6/10 | غير رسمي — للـ MVP فقط، الانتقال لـ WhatsApp Cloud API لاحقاً |
| dwv | 7/10 | مفتوح المصدر، أصغر |

---

## 6. ترتيب الإضافة (Roadmap)

| المرحلة | المكتبة | الأولوية |
|---------|---------|----------|
| الآن (prototype) | pydicom, highdicom, dicom2nifti, nibabel, SimpleITK, fhir.resources, pyvista | عاجل |
| Sprint 1 (MVP) | pynetdicom (real C-STORE), TotalSegmentator (profile) | عالٍ |
| Sprint 3 | MONAI Deploy + Triton (للنماذج الحقيقية) | عالٍ |
| Sprint 5 | faster-whisper (إملاء) | متوسط |
| Sprint 7 | paddleocr (OCR) | متوسط |
| Sprint 8+ | hl7apy (HL7v2 legacy)، dicognito (anonymization) | متوسط |
| اختياري | dwv كبديل خفيف لـ OHIF | منخفض |

---

## 7. تحذيرات قانونية

- **TotalSegmentator** غير معتمد FDA — للأبحاث فقط حتى نحصل على تصنيف MDR Class IIa
- **MONAI Zoo models** بنفس الوضع — لا تخرج تشخيصات تلقائية بدون توقيع طبيب
- **Baileys** غير رسمي من Meta — رسائل WhatsApp التجارية تتطلب WhatsApp Business API
- **fhir.resources** لا يحلّ مشاكل التشغيل البيني — يحتاج profiling لكل HIS بعينه
- استخدام **AceGPT-13B** للتقارير الطبية يحتاج تنبيه واضح: "AI مساعد، الطبيب مسؤول"

---

## 8. ملخص قرارات هذه الوثيقة

| البند | القرار |
|------|--------|
| DICOM I/O | pydicom (موجود) |
| DICOM Networking | pynetdicom (خدمة جديدة) |
| DICOM SR/SEG | highdicom (ingestion + ai-worker) |
| Volume processing | dicom2nifti + SimpleITK + nibabel |
| 3D rendering | pyvista + vtk |
| Anatomy seg | HU thresholding (افتراضي) → TotalSegmentator (profile) |
| FHIR models | fhir.resources |
| Voice dictation | faster-whisper (sprint 5) |
| OCR | paddleocr (sprint 7) |
| Web viewer | OHIF v3 + Cornerstone3D + vtk.js |

</div>
