<div dir="rtl" lang="ar">

# 09 — مواصفات النموذج التجريبي (Prototype Spec)

> **الهدف:** Vertical Slice E2E يثبت كل التقنيات الأساسية على جهاز تطوير واحد (Intel Core Ultra 9 + 32GB) **بدون GPU**.
> **ليس MVP:** هذا dev prototype للتحقق المعماري + demo للشركاء المحتملين. الإنتاج يحتاج كل ما في `02-ROADMAP.md`.
> آخر تحديث: 2026-06-13

---

## 1. النطاق (Scope)

### 1.1 السيناريو الذهبي (Golden Path)

```
1. fixtures/ct-brain.dcm  →  Edge Pusher  →  Ingestion API
2. Ingestion يحفظ في MinIO + ينشر "studies:new"
3. AI Worker stub يكشف "نزيف وهمي" بقاعدة بسيطة على pixel intensity
   → ينشر "ai:inference" مع priority=1
4. LLM Service stub يولّد تقريراً عربياً مهيكلاً بقالب
   → ينشر "llm:report"
5. Web App يستلم WebSocket push: study جديد بأولوية حرجة
6. الطبيب يفتح Viewer (OHIF stub) → يرى الصور + Heatmap + Draft عربي
7. الطبيب يعدّل سطرين، يضغط "اعتمد"
8. التقرير يُحفظ موقّعاً + يُولَّد PDF عربي
9. FHIR Gateway يقبل GET /DiagnosticReport ويرجع المورد
```

### 1.2 المعايير القابلة للقياس (Acceptance Criteria)

| المعيار | القيمة المستهدفة |
|--------|------------------|
| `docker compose up` ينجح في < 3 دقائق | ≤ 180s |
| رفع الفحص → ظهور في worklist | ≤ 10s |
| AI Triage (stub) → ظهور أولوية | ≤ 3s |
| LLM Draft (stub) → ظهور المسودة | ≤ 8s |
| توقيع التقرير → ظهور PDF | ≤ 4s |
| تشغيل الكل بدون GPU | ✅ إلزامي |
| ذاكرة كلية للـ stack | ≤ 14 GB RAM |
| كل خدمة تمر CI smoke test | ✅ |

---

## 2. ما يُبنى فعلياً vs ما يُحاكى (Stub Matrix)

### 2.1 يُبنى فعلياً (Real)

| المكوّن | السبب |
|---------|------|
| Orthanc 1.12 (Docker) | جوهر DICOM؛ لا بديل معقول |
| PostgreSQL 16 + pgvector + ParadeDB | جوهر البيانات؛ نختبر RLS الفعلي |
| MinIO | يحاكي R2 محلياً بنفس S3 API |
| Redis 7 + Streams | جوهر الـ pipeline |
| FastAPI: Ingestion + AI Worker + LLM + FHIR Gateway | الكود نفسه يصلح للإنتاج |
| Next.js 15 + shadcn/ui + Tailwind 4 RTL | الواجهة الفعلية |
| OHIF v3.10 (مُضمَّن في iframe ابتدائياً) | الـ viewer الفعلي |
| Edge Pusher (Python script) | يحاكي Edge Gateway عبر مجلد watched |
| docker-compose dev stack | كما هو معدّ للإنتاج المحلي |
| RLS سياسات + Casbin | اختبار نموذج RBAC الفعلي |
| Audit log + trigger immutability | كاملاً |

### 2.2 يُحاكى (Stub)

| المكوّن | الـ Stub | السبب |
|---------|---------|------|
| **AI Triage (MONAI brain hemorrhage)** | كاشف rule-based: يحسب %pixels في نطاق Hounsfield 60-90 HU؛ إذا > 0.5% → "ictus" priority=1، confidence=0.92 ثابتة | لا GPU + نموذج 250MB يثقل التطوير |
| **Measurements** | يرجع dict ثابت من ملف `fixtures/measurements.json` بناءً على modality+body_part | تجنب نشر MONAI الكامل |
| **AceGPT-13B Clinical LLM** | قالب Jinja2 يدمج: { age, sex, indication, measurements, ICD-11 retrieved } → نص عربي مهيكل. **بديل اختياري:** خدمة Ollama جانبية بـ `qwen2.5:3b-instruct-q4_K_M` (4GB RAM) | نموذج 13B يحتاج ≥10GB VRAM |
| **bge-m3 embedding** | عند الحاجة في الـ RAG demo: نستخدم `fastembed` بـ `BAAI/bge-small-en-v1.5` (~120MB، CPU) + قاموس عربي صغير yدوي | bge-m3 ضخم (~2GB) ولا يلزم لإثبات pipeline |
| **Smallstep mTLS CA** | شهادات self-signed مُولَّدة بـ `openssl` في سكريبت bootstrap | step-ca يعمل لكنه إضافة complexity للـ prototype |
| **Vault** | متغيرات بيئة في `.env.development` + ملف `secrets.json` غير مرفوع | Vault يعمل لكن overhead للـ dev |
| **HTJ2K compression** | نقبل DICOM Explicit VR Little Endian كما هو في الـ prototype | HTJ2K يحتاج `pylibjpeg-libjpeg` compile معقّد على Windows |
| **PDF بتوقيع رقمي** | نولّد PDF بـ WeasyPrint مع watermark بـ "TEST" — لا توقيع PKI حقيقي | كافٍ لإثبات pipeline |
| **Cloudflare CDN/R2** | MinIO محلي | dev offline |
| **Linkerd service mesh** | شبكة Docker وحدها | overhead للـ dev |
| **OIDC (Authentik)** | endpoint محلي يولّد JWT بسر مشترك | overhead للـ dev |
| **Continuous learning loop** | غير مفعّل | يخرج عن نطاق النموذج |
| **DICOM TLS على Port 11112** | TCP عادي | overhead للـ dev |

### 2.3 خارج النطاق كلياً (Out of Scope)

- ✗ تطبيق Mobile / Flutter
- ✗ Mammography AI
- ✗ Continuous Learning loop
- ✗ Multi-region failover
- ✗ Self-service onboarding wizard
- ✗ Billing automation (لا Stripe/Paymob)
- ✗ Slack/Email notifications إنتاج
- ✗ Bug bounty integration

---

## 3. شجرة الملفات

```
midcine/
├── apps/
│   ├── web/                          # Next.js 15 — Worklist + Reading + Admin (مدمجة في الـ prototype)
│   │   ├── src/
│   │   │   ├── app/                  # App Router
│   │   │   │   ├── (auth)/login/
│   │   │   │   ├── (dash)/worklist/page.tsx
│   │   │   │   ├── (dash)/study/[uid]/page.tsx
│   │   │   │   ├── (dash)/admin/
│   │   │   │   ├── api/                  # Next.js API routes (BFF صغير)
│   │   │   │   └── layout.tsx            # RTL + Plex Sans Arabic
│   │   │   ├── components/
│   │   │   │   ├── worklist/
│   │   │   │   ├── viewer/               # iframe لـ OHIF + chat panel
│   │   │   │   ├── report-editor/
│   │   │   │   └── ui/                   # shadcn/ui
│   │   │   ├── lib/
│   │   │   │   ├── api-client.ts
│   │   │   │   └── auth.ts
│   │   │   └── styles/globals.css
│   │   ├── public/fonts/                 # IBM Plex Sans Arabic
│   │   ├── package.json
│   │   └── next.config.mjs
│   │
│   ├── viewer/                       # OHIF v3 stub (مرحلة 1: iframe لـ OHIF community)
│   │   └── README.md                 # توجيه للـ image الجاهز
│   │
│   └── edge-pusher/                  # Python script — يحاكي Edge Gateway
│       ├── app/
│       │   ├── pusher.py             # يراقب inbox/ ويرفع للـ Ingestion
│       │   └── client.py
│       ├── inbox/                    # ضع DICOMs هنا
│       ├── pyproject.toml
│       └── README.md
│
├── services/
│   ├── ingestion-api/                # FastAPI
│   │   ├── app/
│   │   │   ├── main.py
│   │   │   ├── routers/
│   │   │   │   ├── instances.py
│   │   │   │   ├── studies.py
│   │   │   │   └── health.py
│   │   │   ├── core/
│   │   │   │   ├── config.py
│   │   │   │   ├── storage.py        # MinIO client
│   │   │   │   ├── db.py             # SQLAlchemy async + RLS context
│   │   │   │   ├── streams.py        # Redis Streams producer
│   │   │   │   └── auth.py           # mTLS + JWT
│   │   │   └── models/               # Pydantic
│   │   ├── tests/
│   │   ├── pyproject.toml
│   │   └── Dockerfile
│   │
│   ├── ai-worker/
│   │   ├── app/
│   │   │   ├── worker.py             # Redis consumer
│   │   │   ├── triage/
│   │   │   │   └── stub_rule_based.py
│   │   │   ├── measurements/
│   │   │   │   └── stub_fixtures.py
│   │   │   └── core/                 # نفس storage/db/streams
│   │   ├── tests/
│   │   ├── pyproject.toml
│   │   └── Dockerfile
│   │
│   ├── llm-service/
│   │   ├── app/
│   │   │   ├── main.py               # FastAPI
│   │   │   ├── routers/
│   │   │   │   ├── draft.py
│   │   │   │   ├── refine.py
│   │   │   │   └── embed.py
│   │   │   ├── prompts/
│   │   │   │   ├── system_ar.txt
│   │   │   │   └── report_template.j2
│   │   │   ├── rag/
│   │   │   │   ├── retriever.py      # pgvector + ParadeDB
│   │   │   │   └── seed_icd11.py
│   │   │   ├── backends/
│   │   │   │   ├── stub_template.py  # Jinja2 → default
│   │   │   │   └── ollama.py         # اختياري
│   │   │   └── worker.py             # Redis consumer للـ auto-draft
│   │   ├── tests/
│   │   ├── pyproject.toml
│   │   └── Dockerfile
│   │
│   └── fhir-gateway/
│       ├── app/
│       │   ├── main.py
│       │   ├── resources/
│       │   │   ├── imaging_study.py
│       │   │   └── diagnostic_report.py
│       │   └── core/
│       ├── tests/
│       ├── pyproject.toml
│       └── Dockerfile
│
├── packages/
│   ├── shared-types/                 # Pydantic + TS Zod مشتركة
│   │   ├── py/
│   │   │   └── midcine_types/
│   │   ├── ts/
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── pyproject.toml
│   │
│   └── dicom-utils/                  # helpers
│       ├── midcine_dicom/
│       └── pyproject.toml
│
├── infra/
│   ├── docker/
│   │   ├── docker-compose.dev.yml    # كل الـ stack
│   │   ├── docker-compose.override.example.yml
│   │   ├── orthanc/orthanc.json
│   │   └── postgres/init.sql
│   ├── sql/
│   │   ├── migrations/
│   │   │   ├── 001_init_schema.sql
│   │   │   ├── 002_rls_policies.sql
│   │   │   ├── 003_audit_triggers.sql
│   │   │   └── 004_seed_dev.sql
│   │   └── seed/
│   │       ├── icd11_ar_sample.csv   # ~200 entry للـ demo
│   │       └── templates/            # 5 قوالب نقابة
│   └── caddy/Caddyfile               # reverse proxy + TLS لـ dev
│
├── tests/
│   └── e2e/
│       ├── conftest.py
│       ├── test_golden_path.py       # السيناريو 1
│       ├── test_priority_routing.py  # السيناريو 2
│       └── test_rls_isolation.py     # السيناريو 3
│
├── fixtures/
│   ├── ct-brain-normal.dcm
│   ├── ct-brain-hemorrhage.dcm       # مع pixel intensity مرتفع في نطاق نزيف
│   ├── chest-xray.dcm
│   ├── measurements.json             # لـ AI Worker stub
│   └── README.md
│
├── scripts/
│   ├── bootstrap.ps1                 # Windows
│   ├── bootstrap.sh                  # Linux/Mac
│   ├── seed-db.py
│   └── gen-dev-certs.sh
│
├── docs/                             # موجود
├── handoff/                          # موجود
├── research/                         # موجود
├── .env.example
├── .gitignore
├── pnpm-workspace.yaml
├── pyproject.toml                    # root: uv workspaces
└── README.md                         # موجود
```

---

## 4. ملف docker-compose.dev.yml — نظرة عامة

| Service | Image / Build | الذاكرة المتوقعة | المنفذ |
|---------|---------------|-------------------|--------|
| `postgres` | `paradedb/paradedb:0.10.x` (يحوي pgvector + pg_search) | 1 GB | 5432 |
| `redis` | `redis:7-alpine` | 256 MB | 6379 |
| `minio` | `quay.io/minio/minio` | 512 MB | 9000, 9001 |
| `orthanc` | `orthancteam/orthanc:24.6.1` + plugin Postgres | 512 MB | 8042, 11112 |
| `ingestion-api` | build `services/ingestion-api` | 512 MB | 8100 |
| `ai-worker` | build `services/ai-worker` | 1 GB | — (worker) |
| `llm-service` | build `services/llm-service` | 2 GB (stub) / 6 GB (Ollama qwen) | 8300 |
| `fhir-gateway` | build `services/fhir-gateway` | 256 MB | 8400 |
| `web` | build `apps/web` (Next.js dev mode) | 1 GB | 3000 |
| `viewer` | `ohif/app:v3.10` | 512 MB | 3030 |
| `caddy` | `caddy:2` | 64 MB | 443, 80 |
| `ollama` (اختياري profile=llm-real) | `ollama/ollama:latest` | 6 GB | 11434 |

**الإجمالي الافتراضي (بدون Ollama):** ~7-8 GB RAM
**مع Ollama:** ~12-14 GB RAM

---

## 5. متغيرات البيئة (`.env.example`)

```ini
# === Tenancy ===
MIDCINE_DEV_TENANT_ID=11111111-1111-1111-1111-111111111111
MIDCINE_DEV_TENANT_SLUG=demo
MIDCINE_DEV_TENANT_PLAN=center

# === PostgreSQL ===
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=midcine
POSTGRES_USER=midcine_app
POSTGRES_PASSWORD=changeme_dev_only
POSTGRES_MIGRATOR_USER=midcine_migrator
POSTGRES_MIGRATOR_PASSWORD=changeme_dev_only

# === Redis ===
REDIS_URL=redis://redis:6379/0

# === MinIO / S3 ===
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=midcine-dev
MINIO_SECRET_KEY=midcine-dev-secret-change-me
MINIO_BUCKET=midcine-studies
MINIO_USE_SSL=false

# === Orthanc ===
ORTHANC_URL=http://orthanc:8042
ORTHANC_USERNAME=midcine
ORTHANC_PASSWORD=changeme_dev_only

# === Auth ===
JWT_SECRET=dev-only-replace-with-256-bit-key
JWT_ALG=HS256
JWT_TTL_SECONDS=900
REFRESH_TTL_SECONDS=604800

# === Encryption (dev only — استبدل بـ Vault في الإنتاج) ===
FIELD_ENCRYPTION_KEY_B64=ZGV2X29ubHlfMzJfYnl0ZV9rZXlfZm9yX21pZGNpbmU=
FIELD_HMAC_KEY_B64=ZGV2X29ubHlfMzJfYnl0ZV9obWFjX2tleV9mb3JfbWlk

# === LLM Backend ===
LLM_BACKEND=stub                      # 'stub' أو 'ollama'
OLLAMA_URL=http://ollama:11434
OLLAMA_MODEL=qwen2.5:3b-instruct-q4_K_M

# === AI Worker ===
AI_TRIAGE_THRESHOLD=0.5               # %pixels HU 60-90 for fake hemorrhage detection

# === Web ===
NEXT_PUBLIC_API_BASE=http://localhost:8100
NEXT_PUBLIC_VIEWER_URL=http://localhost:3030
NEXT_PUBLIC_WS_URL=ws://localhost:8100/v1/realtime

# === FHIR Gateway ===
FHIR_CLIENT_ID=demo-his
FHIR_CLIENT_SECRET=dev-fhir-secret

# === Observability ===
LOG_LEVEL=info
SENTRY_DSN=                           # فارغ في dev
```

---

## 6. ترتيب التنفيذ (Scaffolding Order)

> الـ dependencies تفرض هذا الترتيب:

1. **Infrastructure base** — `infra/docker/docker-compose.dev.yml` + `.env.example` + `Caddyfile`
2. **DB schema** — `infra/sql/migrations/001-004_*.sql` + seed
3. **Shared types** — `packages/shared-types/` (Pydantic + Zod)
4. **DICOM utils** — `packages/dicom-utils/`
5. **Ingestion API** — أول service لأن كل شيء يحتاجه
6. **Edge Pusher** — يحتاج Ingestion
7. **AI Worker** — يستهلك `studies:new`
8. **LLM Service** — يستهلك `ai:inference`
9. **FHIR Gateway** — يستهلك `doctor:signed`
10. **Web App (Next.js)** — يحتاج كل APIs
11. **E2E Tests** — تتطلب كل ما سبق
12. **Bootstrap script** — يجمعها معاً

---

## 7. سيناريوهات الاختبار E2E (3)

### 7.1 السيناريو 1 — Golden Path (`test_golden_path.py`)

```
GIVEN: stack نظيف، tenant demo seeded
WHEN: edge-pusher يدفع fixtures/ct-brain-hemorrhage.dcm
THEN:
  - study يظهر في GET /v1/worklist خلال 10s
  - ai_inferences يحوي صفاً بـ inference_type='triage', confidence>=0.9
  - reports يحوي مسودة auto-generated خلال 8s إضافية
  - POST /v1/reports/{id}/sign ينجح
  - GET /fhir/R4/DiagnosticReport يرجع التقرير
  - audit_log يحوي ≥ 6 صفوف (upload, ai, llm, view, sign, fhir)
```

### 7.2 السيناريو 2 — Priority Routing (`test_priority_routing.py`)

```
GIVEN: 3 fixtures: hemorrhage, normal, lung_nodule
WHEN: يُرفعون بعكس الترتيب (lung, normal, hemorrhage)
THEN:
  - GET /v1/worklist?status=unread يرجعهم بترتيب: hemorrhage (P1), lung (P3), normal (P5)
  - WS realtime ينشر STUDY_AI_READY مع priority=1 أولاً
```

### 7.3 السيناريو 3 — Tenant Isolation (`test_rls_isolation.py`)

```
GIVEN: tenant_a + tenant_b، كل منهما له طبيب
WHEN:
  - طبيب tenant_a يحاول GET /v1/studies/{uid_of_b}
THEN: 404 (وليس 403 — لا نكشف أن المورد موجود)
WHEN:
  - استعلام DB مباشر بـ session لـ tenant_a
THEN: row count = صفر للجداول التي تخص tenant_b
WHEN:
  - super_admin يستعلم
THEN: يرى كل tenants
```

---

## 8. تشغيل سريع (Quick Start)

```bash
# Windows PowerShell
cd D:\project\midcine
copy .env.example .env
.\scripts\bootstrap.ps1            # يولّد certs + يبني الصور + يشغّل الـ stack
.\scripts\seed-db.py               # يضيف tenant demo + user + ICD-11 sample

# افتح المتصفح
start http://localhost:3000        # تسجيل دخول demo@midcine.io / demo

# اختبر الـ pipeline
copy fixtures\ct-brain-hemorrhage.dcm apps\edge-pusher\inbox\

# شغّل اختبارات E2E
pnpm -C tests/e2e test
```

---

## 9. ملخص قرارات النموذج التجريبي

| البند | القرار |
|------|--------|
| المنصة | Windows 11 + Docker Desktop |
| GPU | غير مطلوب |
| LLM backend افتراضي | Jinja2 template stub |
| LLM backend اختياري | Ollama + qwen2.5:3b-instruct |
| AI Triage | rule-based على pixel intensity HU |
| RAG | pgvector + ParadeDB مع 200 ICD-11 entry seeded |
| Compression | DICOM Explicit VR LE (لا HTJ2K في dev) |
| mTLS | self-signed certs مولّدة في bootstrap |
| Secrets | .env فقط — لا Vault |
| OHIF Viewer | image رسمية في iframe |
| RLS | مُفعّل ومُختبَر فعلاً |
| Audit log | كامل + immutable triggers |
| الذاكرة المتوقعة | ≤14 GB RAM |
| وقت bootstrap | ≤3 دقائق |

</div>
