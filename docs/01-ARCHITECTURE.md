<div dir="rtl" lang="ar">

# 01 — المعمارية التقنية

> **هذه ليست وثيقة "احتمالات معمارية" — هذه قرارات نهائية.**
> كل خيار أدناه يأتي مع بديل مرفوض وسبب الرفض.
> آخر تحديث: 2026-06-07 | المؤلف: NEXUS-AI Architect

---

## 1. المخطط الكلي

```
                          ┌──────────────────────────────────────────┐
                          │            EDGE (داخل المستشفى)            │
                          │                                          │
   جهاز CT/MRI/X-Ray  ──▶ │  Orthanc 1.12 (DICOM C-STORE)            │
   (DICOM C-STORE        │     │                                    │
    على Port 11112)      │     ├──▶ MinIO محلي (S3 API)               │
                          │     │   (الصور الخام تبقى هنا)              │
                          │     │                                    │
                          │     └──▶ Edge Gateway (Python/FastAPI)   │
                          │           │                              │
                          └───────────┼──────────────────────────────┘
                                      │
                                      │  HTJ2K compressed
                                      │  WebSocket / mTLS
                                      ▼
                          ┌──────────────────────────────────────────┐
                          │             CLOUD (midcine.io)            │
                          │                                          │
                          │  Ingestion API (FastAPI)                 │
                          │     │                                    │
                          │     ├──▶ PostgreSQL + pgvector           │
                          │     │   (metadata + RAG vectors)         │
                          │     │                                    │
                          │     ├──▶ Redis Streams (task queue)      │
                          │     │                                    │
                          │     └──▶ S3 / R2 (AI inference cache)    │
                          │                                          │
                          │  AI Workers (Python + MONAI Deploy)      │
                          │     ├──▶ AI Triage (CT brain, chest)     │
                          │     ├──▶ Measurement extraction          │
                          │     └──▶ Clinical LLM (AceGPT-13B)       │
                          │                                          │
                          │  Web Viewer (OHIF v3.10 + Cornerstone3D) │
                          │     served via Cloudflare CDN             │
                          └──────────────────────────────────────────┘
```

---

## 2. القرارات التقنية الكاملة (X vs Y)

### 2.1 طبقة الـ DICOM Core

**القرار: Orthanc 1.12+**

| البديل | لماذا رفضناه |
|--------|---------------|
| DCM4CHEE (Java) | ثقيل (>4GB RAM)، صعب الـ embed، Java ecosystem أبطأ في التطوير |
| بناء DICOM stack من الصفر | جنون مهندسي — DICOM معيار من 5000 صفحة |
| dcmtk (C++ فقط) | مكتبة وليس نظام كامل |

**لماذا Orthanc:**
- C++ خفيف (<200MB RAM)، يعمل على Raspberry Pi
- REST API ناضج (لا نحتاج DICOM Verb مباشرة من العميل)
- Plugins جاهزة: PostgreSQL، S3، WebViewer، Authorization
- يدعم WADO-RS (للـ Streaming الذكي)
- مرخّص GPL لكن يسمح ببناء طبقات مغلقة فوقه

### 2.2 طبقة الـ Web Viewer

**القرار: OHIF v3.10 + Cornerstone3D**

| البديل | لماذا رفضناه |
|--------|---------------|
| بناء Viewer من الصفر | 18 شهر عمل لمطابقة OHIF — انتحار جدول زمني |
| Weasis | Desktop = الجيل القديم؛ يكسر فلسفة Zero-Footprint |
| Stone of Orthanc | محدود الميزات، مجتمع صغير |
| 3D Slicer Web | Research grade، ليس للإنتاج |

**لماذا OHIF:**
- مفتوح المصدر، مدعوم من MGH/NIH
- Cornerstone3D يستخدم WebGPU/WebGL تلقائياً
- Plugins للـ AI overlays (GSPS) جاهزة
- مرن للتخصيص — نضيف طبقة RTL عربية كـ extension

**التخصيصات المطلوبة:**
- Extension: `midcine-rtl-ui` — قلب التخطيط لـ RTL كاملاً
- Extension: `midcine-arabic-reporting` — محرر تقارير عربي مدمج
- Extension: `midcine-llm-assistant` — chat panel للـ Clinical LLM

### 2.3 طبقة التخزين

**القرار: PostgreSQL 16 + MinIO (Hybrid)**

| الطبقة | الاختيار | البديل المرفوض |
|--------|---------|----------------|
| Metadata / DB | PostgreSQL 16 + pgvector | MongoDB (NoSQL غير ضروري هنا)، MSSQL (ترخيص) |
| Object Storage (المستشفى) | MinIO | Ceph (overkill للـ MVP)، AWS S3 (سياسة الخصوصية) |
| Object Storage (السحاب) | Cloudflare R2 | AWS S3 (egress باهظ)، Backblaze B2 (دعم أضعف) |
| Cache | Redis 7 | Memcached (لا persistence) |

**لماذا PostgreSQL + pgvector:**
- نفس DB لـ metadata و RAG embeddings (تبسيط الـ ops)
- Orthanc له plugin رسمي PostgreSQL
- pgvector ناضج لـ similarity search على تقارير سابقة

**لماذا MinIO + R2:**
- MinIO يقدم S3 API → نفس الكود يعمل محلياً وسحابياً
- R2 لا يفرض egress fees (بخلاف S3) → AI inference رخيص

### 2.4 طبقة الـ Ingestion

**القرار: FastAPI + Redis Streams**

| البديل | لماذا رفضناه |
|--------|---------------|
| Kafka | Overkill قبل >1M event/يوم. الـ ops مكلف |
| RabbitMQ | Redis Streams أبسط، نفس DB نستخدمها للـ cache |
| Celery | يضيف Broker إضافي بدون قيمة |
| Django | بطيء، ORM ثقيل، لا async-first |

**لماذا FastAPI:**
- Async من اليوم الأول (مهم للـ WebSocket Streaming)
- Type-safe (Pydantic) → اكتشاف bugs مبكراً
- مجتمع ضخم + توثيق ممتاز
- يتكامل بسلاسة مع Orthanc REST

**ترقية لاحقة:** عندما نتجاوز 10 مستشفيات نشطة → نقيّم Apache Pulsar (أفضل من Kafka في multi-tenancy).

### 2.5 طبقة الـ AI

**القرار: MONAI Deploy Express + Triton Inference Server**

| البديل | لماذا رفضناه |
|--------|---------------|
| TorchServe وحده | لا يعرف DICOM؛ كل مهندس يعيد بناء pre-processing |
| Kubeflow Pipelines | Kubernetes-heavy، 6 أشهر setup |
| Vertex AI / SageMaker | Vendor lock-in + سعر مرتفع |
| ONNX Runtime مباشرة | لا orchestration |

**لماذا MONAI:**
- مصمم خصيصاً للأشعة (يقبل DICOM input مباشرة)
- يدمج Triton للـ batching الذكي
- نماذج pretrained: CT brain hemorrhage، chest X-ray، CT lung nodule — كلها جاهزة
- MAP (MONAI Application Package) معيار صناعي صاعد

**النماذج المختارة للـ MVP:**
| النموذج | المصدر | الاستخدام |
|---------|--------|-----------|
| CT Brain Hemorrhage Detection | MONAI Model Zoo (pretrained) | AI Triage حالات النزيف |
| Chest X-ray Multi-label | TorchXRayVision | كشف 14 حالة شائعة |
| Lung Nodule Detection | LUNA16 pretrained | فرز CT صدر |

### 2.6 طبقة الـ Clinical LLM

**القرار: AceGPT-13B fine-tuned + RAG**

| البديل | لماذا رفضناه |
|--------|---------------|
| بناء LLM من الصفر (GZP-LLM approach) | تجربتنا السابقة 3.5/10 — الطب لا يتسامح |
| Jais-30B | RAM متطلب >40GB، غالٍ للتشغيل |
| AraBERT / GPT-3 عربي | Decoder-only أضعف من Encoder-Decoder للطب |
| Claude/GPT API مباشرة | تعريض بيانات المرضى لمزود خارجي |
| Llama 3 عربي tune | عربيته أضعف من AceGPT |

**لماذا AceGPT-13B:**
- مدرب على عربي حقيقي + قدرات طبية معقولة
- 13B → يعمل على GPU واحد (A10G أو 4090)
- Open source، نقدر نـ fine-tune ونـ self-host
- يدعم Instruction tuning بسلاسة

**خط الأنابيب:**
```
قياسات AI ──┐
            ├──▶ Prompt Template ──▶ AceGPT-13B ──▶ Draft تقرير
RAG ICD-11 ─┘                                          │
                                                       ▼
                                              مراجعة الطبيب ──▶ توقيع
                                                       │
                                                       ▼
                                         تغذية راجعة لـ fine-tuning
```

### 2.7 طبقة الـ Edge Gateway

**القرار: Orthanc + Python sidecar في Docker Compose**

| المكوّن | الصورة | الوظيفة |
|---------|--------|---------|
| `midcine/orthanc-edge` | orthancteam/orthanc + Postgres plugin | استقبال DICOM من الأجهزة |
| `midcine/edge-pusher` | Python 3.12 + FastAPI | يضغط HTJ2K ويبثه للسحاب |
| `midcine/edge-cache` | Redis 7-alpine | Buffer مؤقت + queue |
| `traefik` | traefik:v3 | mTLS termination + routing |

**Hardware موصى به (BOM):**
- Intel NUC 13 Pro (i5/i7) — 32GB RAM، 1TB NVMe — ~25,000 ج.م
- UPS صغير 1KVA — ~3,000 ج.م
- إجمالي: ~30,000 ج.م لكل مركز (يدفعها العميل)

### 2.8 طبقة الـ Front-end (RTL Layer)

**القرار: Next.js 15 + React 19 + Tailwind 4 + shadcn/ui**

> RTL Wrapper حول OHIF + لوحات إدارية مستقلة (Worklist، RIS، فواتير)

| البديل | لماذا رفضناه |
|--------|---------------|
| Vue 3 + Nuxt | OHIF يعتمد React — تجنّب الفجوة |
| Svelte 5 | مجتمع أصغر، أقل مكتبات طبية |
| Angular | Enterprise overhead بلا داعٍ |

### 2.9 البنية التحتية والـ DevOps

**القرار: Hetzner (بداية) → Coolify self-hosted PaaS**

| الطبقة | الاختيار | السبب |
|--------|---------|-------|
| السحاب | Hetzner Cloud + Cloudflare | تكلفة 80% أقل من AWS، شبكة أوروبية قريبة |
| PaaS | Coolify | يحلّ محل Vercel + Render؛ مفتوح المصدر |
| CI/CD | GitHub Actions | البساطة |
| Observability | Grafana + Loki + Prometheus | كل شيء self-hosted |
| Secrets | Doppler (للفريق) + sealed-secrets (في prod) | لا نخزّن في Git |

**لاحقاً عند الحاجة (>20 عميل):** الانتقال لـ Kubernetes على Hetzner + AKS كبيئة DR.

---

## 3. مخطط البيانات (Data Flow End-to-End)

```
1. الفني يبدأ فحص CT للمريض
   └─ جهاز CT يرسل DICOM C-STORE لـ Orthanc Edge على Port 11112
2. Orthanc يخزّن الـ DICOMs في MinIO المحلي
   └─ يطلق Webhook لـ Edge Pusher
3. Edge Pusher:
   a. يضغط Pixel Data بـ HTJ2K (-70% حجم بدون فقد)
   b. يفصل Metadata إلى JSON
   c. يرفع لـ Cloud Ingestion API عبر WebSocket mTLS
4. Cloud Ingestion:
   a. يحفظ metadata في PostgreSQL
   b. يرفع pixel chunks لـ R2
   c. يضع رسالة في Redis Stream: "new_study"
5. AI Worker يستهلك الرسالة:
   a. ينزل الصور المضغوطة
   b. يفك الضغط في الذاكرة
   c. يشغّل MONAI pipeline (Triage + Measurements)
   d. ينتج DICOM GSPS overlay + JSON قياسات
   e. ينشر "study_ready" مع flag الخطورة
6. RIS Backend يحدّث Worklist:
   a. الحالات الحرجة ترفع لأعلى
   b. WebSocket Push لمستعرض الطبيب
7. الطبيب يفتح OHIF Viewer:
   a. Progressive load (50 slice أولاً)
   b. AI overlay يظهر فوق الصورة
   c. لوحة Clinical LLM تعرض draft تقرير
8. الطبيب يراجع → يصحح → يوقّع رقمياً
   └─ التقرير النهائي يحفظ كـ DICOM SR + PDF عربي
9. النظام يرسل النتيجة عبر FHIR API للمستشفى/التأمين
```

---

## 4. متطلبات الأداء (Performance Budget)

| المقياس | الهدف | الحد الأقصى المقبول |
|---------|------|---------------------|
| وقت ظهور أول slice في Viewer | <800ms | 1.5s |
| AI Triage latency (CT brain) | <12s | 30s |
| Clinical LLM draft (200 كلمة) | <8s | 20s |
| Worklist push WebSocket | <500ms | 1s |
| Uplink من Edge → Cloud (50MB CT) | <40s (5Mbps) | 2 دقيقة |
| Uptime SLA | 99.5% | 99% |

---

## 5. المعمارية الأمنية (Security Architecture)

> تفاصيل كاملة في [03-COMPLIANCE.md](03-COMPLIANCE.md). الملخص هنا:

- **mTLS** بين Edge Gateway والسحاب (شهادات per-tenant)
- **AES-256-GCM** للـ DICOMs at-rest (مفتاح per-tenant في KMS)
- **Field-level encryption** لاسم المريض ورقم القومي في DB
- **RBAC 5 طبقات:** SuperAdmin → Owner → Doctor → Technician → ReadOnly
- **Audit log immutable** على كل وصول لصورة (يخزّن في PostgreSQL + يُشحن لـ Loki)
- **WORM storage** للتقارير الموقّعة (R2 Object Lock)

---

## 6. ما لن نبنيه في MVP (Out of Scope)

عمداً، هذه ميزات مؤجلة للإصدار 1.x أو 2.x:

- ❌ تطبيق Mobile أصلي (الويب RTL يكفي للـ MVP)
- ❌ تكامل مع HIS غير القياسي (نبدأ بـ FHIR فقط)
- ❌ 3D MPR/MIP متقدم (Cornerstone3D يقدم الأساسي)
- ❌ Multi-region failover (single region حتى >10 عملاء)
- ❌ Self-service onboarding (yدوي حتى نفهم Edge Cases)
- ❌ AI training UI (نقدم training pipeline لـ data scientists فقط)
- ❌ Mammography AI (سوق متخصص، إصدار 2.0)

---

## 7. مخطط الـ Repos المقترح

```
midcine/
├── apps/
│   ├── web/              # Next.js 15 — RIS + Worklist + Admin
│   ├── viewer/           # OHIF v3 fork + midcine extensions
│   └── edge-pusher/      # Python FastAPI — يدفع DICOM للسحاب
├── services/
│   ├── ingestion-api/    # FastAPI — استقبال + queue
│   ├── ai-worker/        # Python — MONAI pipelines
│   ├── llm-service/      # Python — AceGPT inference + RAG
│   └── fhir-gateway/     # Python — تكامل HIS/EMR
├── infra/
│   ├── docker/           # Compose files
│   ├── coolify/          # Deployment manifests
│   └── terraform/        # Hetzner provisioning
├── packages/
│   ├── shared-types/     # TypeScript types مشتركة
│   └── dicom-utils/      # حزمة Python للـ DICOM helpers
├── docs/                 # هذه الوثائق
├── research/             # ملف Gemini + بحوث لاحقة
└── handoff/              # حزم تسليم لـ OpenCode/Kiro
```

---

## 8. ملخص القرارات في صف واحد

| المكوّن | الاختيار | في 5 كلمات |
|---------|---------|------------|
| DICOM Core | Orthanc 1.12 | خفيف، REST، plugins ناضجة |
| Viewer | OHIF v3 + Cornerstone3D | معيار صناعي، WebGPU |
| DB | PostgreSQL 16 + pgvector | شامل، RAG-ready |
| Storage محلي | MinIO | S3 API، on-prem |
| Storage سحاب | Cloudflare R2 | بدون egress fees |
| Ingestion | FastAPI + Redis Streams | async، خفيف |
| AI Framework | MONAI Deploy Express | DICOM-native |
| Triage Models | MONAI Zoo pretrained | جاهز للـ MVP |
| Clinical LLM | AceGPT-13B fine-tuned | عربي ذكي، self-hosted |
| Front-end | Next.js 15 + shadcn/ui | حديث، RTL ممكن |
| Cloud | Hetzner + Cloudflare | أرخص 80% من AWS |
| PaaS | Coolify self-hosted | يحلّ Vercel + Render |
| Observability | Grafana + Loki + Prometheus | مجاني، شامل |

</div>
