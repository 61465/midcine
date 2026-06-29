<div dir="rtl" lang="ar">

# 11 — Master Engineering Plan
## خطة هندسية متكاملة لإكمال midcine إلى أفضل RIS/PACS عربي

> **التاريخ:** 2026-06-18
> **الأفق:** 90 يوماً → MVP Production-Ready، ثم Q4 2026 + 2027
> **المالك:** عبد الرحمن محمد + شركة NEXUS-AI الرقمية + OpenCode/Kiro handoffs
> **النموذج التشغيلي:** Doctor/Nurses — الشركة تجمع وتقترح، الطبيب يقرر
> **الحالة الحالية:** Prototype E2E يعمل (~70% حقيقي، 30% placeholder)

---

## 0. Executive Summary

midcine اليوم prototype معماري ممتاز ولكن الـ docs أكبر من الـ implementation. الأقوى: RLS + tenant_session، AES-256-GCM + HMAC، audit_log immutable، pynetdicom SCP، Baileys consumer groups، shared-types Zod/Pydantic. الأضعف: edge-gateway فارغ كلياً، صفر اختبارات E2E، صفر CI/CD، صفر observability، RAG غير منفذ رغم pgvector جاهز، FHIR Gateway 3 endpoints فقط، AI Triage rule-based فقط، توقيع PDF "TEST" غير قانوني.

**القرار الاستراتيجي:** نُغلق فجوات المنصة (CI/observability/secrets/tests) قبل أي feature جديد. نختار Chest X-ray لأول نموذج AI حقيقي (أبسط من brain CT). نبدأ بـ Ollama qwen2.5:14b كـ LLM افتراضي ونؤجّل قرار AceGPT/ALLaM لـ Sprint 8 بعد قياس فعلي.

**الميزانية المتوقعة شهرياً (Production):**
- Dev/staging: ~25$ (Hetzner CX22 + R2)
- Pilot center: ~75$ (Hetzner CX32 + R2 1TB + Cloudflare Pro)
- GPU rental عند تفعيل LLM حقيقي: ~150-300$ (Vast.ai L4)
- **الإجمالي شهرياً للـ pilot:** 250-400$

---

## 1. Architecture Vision + ADRs

### ADR-001: Hybrid Cloud Topology
- **القرار:** Edge Gateway (Docker bundle داخل المركز) يحوي Orthanc + Pusher + Redis محلي. Cloud يحوي everything else.
- **التبرير:** البيانات الخام تبقى داخل المركز (compliance + شبكة)، السحاب للذكاء + الـ workflow.
- **البديل المرفوض:** Full Cloud (شبكة المراكز في مصر/السعودية غير مستقرة + قلق compliance).

### ADR-002: Edge ↔ Cloud Protocol
- **القرار:** gRPC bidirectional streaming over mTLS (HTTP/2). Compression: HTJ2K للـ pixel data، zstd للـ metadata.
- **التبرير:** gRPC أكفأ من WebSocket لـ بـ binary بحجم كبير + يدعم streaming في الاتجاهين. WS يصلح لـ realtime UI فقط.
- **المرفوض:** MLLP (HL7v2 قديم)، Raw WebSocket (لا backpressure flow control).
- **المرجع:** [gRPC Performance Best Practices](https://grpc.io/docs/guides/performance/)

### ADR-003: AI Orchestration
- **القرار:** Redis Streams + consumer groups (الحالي) للـ MVP. ترقية لـ Temporal عند تجاوز 500 study/day أو الحاجة لـ multi-step workflows مع compensation.
- **التبرير:** Redis Streams موجود + يعمل. Temporal overkill حالياً.
- **trigger للترقية:** أي workflow يحتاج > 3 steps مع rollback، أو DLQ + retry policy متقدمة.

### ADR-004: Multi-tenant Isolation
- **القرار:** RLS على مستوى DB (مفعّل) + tenant_session middleware (مفعّل) + RBAC بـ Casbin في الـ app layer.
- **التبرير:** defense-in-depth. RLS تحمي حتى لو app bug.
- **خطة التحسين:** إضافة tenant_id في correlation IDs + Sentry tags + Loki labels.

### ADR-005: Service Mesh
- **القرار:** **بدون service mesh للـ MVP.** نستخدم Caddy reverse proxy + mTLS عبر step-ca داخلي.
- **التبرير:** Linkerd/Istio تتطلب Kubernetes — overkill لـ Coolify + Docker Compose. الـ overhead لا يُبرَّر بـ < 10 خدمات.
- **trigger للترقية:** الانتقال إلى k3s/k8s، أو > 20 service، أو الحاجة لـ canary deployments متقدمة.

### ADR-006: Database
- **القرار:** Postgres 16 + ParadeDB (pgvector + pg_search) كنواة واحدة. لا Elasticsearch، لا Pinecone، لا Qdrant.
- **التبرير:** تقليل moving parts. ParadeDB يكفي حتى ~10M chunks. RLS موحّد. backup واحد (pgBackRest).
- **trigger للترقية:** > 50M vector chunks → Qdrant separate.

### ADR-007: LLM Strategy
- **القرار:** Multi-backend router مع fallback chain:
  1. Ollama (qwen2.5:14b محلياً للـ dev، AceGPT-13B على GPU pilot)
  2. Claude API (للحالات المعقّدة + privacy-aware)
  3. Stub Jinja (إذا الكل فشل — تقرير فارغ مهيكل)
- **التبرير:** uptime + cost + privacy + quality كلها متضاربة. router يحلّ التعارض.

### Capacity Planning
| النطاق | الخدمات | الـ infra | trigger للترقية |
|--------|---------|-----------|------------------|
| 1 مركز / 50 study/يوم | Compose واحد على CX22 | 4GB RAM | — |
| 10 مراكز / 500 study/يوم | Compose على CX32 + Redis منفصل | 8GB | تقسيم ai-worker + llm-service |
| 100 مراكز / 5k study/يوم | k3s + 3 nodes | 24GB | Kafka بدل Redis Streams |
| 1000 مراكز / 50k study/يوم | Multi-region + read replicas + Qdrant | — | إعادة معمارية كاملة |

---

## 2. 90-Day Sprint Plan

> كل sprint = أسبوع. acceptance criteria قابلة للقياس. Go/No-Go gate في نهاية كل sprint.

### Sprint 0 (الأسبوع 1) — Foundation
**الهدف:** كل ما يجب أن يكون قبل أي كود جديد.
- [ ] `.github/workflows/ci.yml`: ruff + mypy + pytest + docker build
- [ ] Sentry SDK في كل service مع DSN لكل بيئة
- [ ] structlog + correlation IDs في كل service
- [ ] إنشاء `docs/adr/` + كتابة ADRs 001-007 كملفات منفصلة
- [ ] فحص أمني أوّلي: trufflehog على الـ repo (لا secrets)

**Go/No-Go:** CI أخضر على PR فارغ + Sentry يلتقط test error.

### Sprint 1 (الأسبوع 2) — Tests Foundation
- [ ] `tests/e2e/test_golden_path.py`
- [ ] `tests/e2e/test_priority_routing.py`
- [ ] `tests/e2e/test_rls_isolation.py`
- [ ] testcontainers-python integration
- [ ] coverage report في CI، fail < 60% للـ services الحرجة

**Go/No-Go:** الـ 3 سيناريوهات تمرّ على main.

### Sprint 2 (الأسبوع 3) — Secrets + mTLS
- [ ] Infisical self-hosted أو SOPS+age (قرار في Sprint 0)
- [ ] migration كل `.env` إلى الـ vault
- [ ] step-ca داخلي + cert-manager Docker
- [ ] DICOM TLS على 11112
- [ ] mTLS بين services الداخلية

**Go/No-Go:** لا secret في الـ repo + كل intra-service traffic مشفّر.

### Sprint 3 (الأسبوع 4) — Alembic + Backup
- [ ] alembic baseline من الـ 8 SQL files
- [ ] pgBackRest على Postgres + WAL إلى R2
- [ ] mc mirror MinIO → R2
- [ ] DR drill أول: استعادة كاملة في staging

**Go/No-Go:** restore drill يكتمل < 4 ساعات.

### Sprint 4 (الأسابيع 5-6) — Real AI Triage
- [ ] TorchXRayVision densenet121 (CheXpert) في ai-worker
- [ ] benchmark على CPU: target < 10s/study على CX32
- [ ] integration مع Redis Stream ai:inference
- [ ] Sensitivity ≥ 80% على 50 chest X-ray مجهولة من مصادر مفتوحة

**Go/No-Go:** يعمل على fixtures + Sensitivity متحقّقة.

### Sprint 5 (الأسبوع 7) — RAG ICD-11
- [ ] WHO ICD-11 API ingestion + ترجمة عربية حيث متاحة
- [ ] bge-m3 embeddings → pgvector HNSW
- [ ] hybrid search (BM25 + vector + RRF)
- [ ] integration في llm-service prompt
- [ ] Recall@10 ≥ 75% على 50 سؤال طبي مرجعي

**Go/No-Go:** التقرير يستشهد inline بـ ICD codes صحيحة.

### Sprint 6 (الأسبوع 8) — Observability + Healthchecks
- [ ] Grafana Loki + Prometheus + Tempo stack
- [ ] healthchecks لكل service في compose
- [ ] alert rules: error rate spike, DICOM volume anomaly, Redis lag
- [ ] dashboards: golden path latency، AI throughput، worklist load

**Go/No-Go:** alert يصل خلال 60s من فشل مصطنع.

### Sprint 7 (الأسبوع 9) — FHIR Gateway Expansion
- [ ] Patient + Practitioner + Organization CRUD
- [ ] Observation للقياسات AI
- [ ] ServiceRequest
- [ ] SMART-on-FHIR backend services authorization
- [ ] OAuth بدل client_secret hardcoded

**Go/No-Go:** Inferno (FHIR test suite) يمرّ ≥ 80%.

### Sprint 8 (الأسبوع 10) — OIDC + 2FA
- [ ] Zitadel deployment
- [ ] migration JWT HS256 → OIDC
- [ ] 2FA WebAuthn للأطباء
- [ ] session revocation tested

**Go/No-Go:** طبيب يسجّل دخول بـ YubiKey + admin يلغي session فوراً.

### Sprint 9 (الأسبوع 11) — Edge Gateway + Pen Test
- [ ] `edge-gateway/` Docker bundle: Orthanc + Pusher + Redis
- [ ] gRPC mTLS client للسحاب
- [ ] HTJ2K compression
- [ ] pen test خارجي على staging قبل الـ pilot
- [ ] إصلاح كل critical + high

**Go/No-Go:** edge bundle يعمل على NUC منفصل + 0 critical في pen test.

### Sprint 10 (الأسبوع 12) — PDF Signing + Compliance Dossier
- [ ] PAdES-B-LT توقيع للـ PDF عبر شهادة GlobalSign
- [ ] DICOM SR signed (PS3.15)
- [ ] compliance dossier PDF (HIPAA + GDPR + EDA + سدايا)
- [ ] BAA + DPA templates

**Go/No-Go:** PDF موقّع يمرّ verify-pdf-signature.

### Sprint 11 (الأسبوع 13) — Pilot Doctor Onboarding
- [ ] تنصيب edge bundle في مركز الشريك
- [ ] تدريب 3 أطباء + فني (نصف يوم + ساعة)
- [ ] feedback form يومي
- [ ] دعم على WhatsApp مباشر للـ pilot

**Go/No-Go:** ≥ 20 study/يوم لمدة 5 أيام متواصلة + رضا 4/5.

### Sprint 12 (الأسبوع 14) — Hardening Round
- [ ] إصلاح كل bug من الـ pilot
- [ ] performance: P95 < 60s upload → worklist
- [ ] uptime ≥ 99% على آخر 30 يوم
- [ ] حالة دراسية موثّقة (anonymized)

**Go/No-Go:** الطبيب الرئيسي يوقّع شهادة.

### Sprint 13 (الأسبوع 15) — Demo Day + Q4 Planning
- [ ] فيديو يوم عمل كامل
- [ ] case study PDF
- [ ] Q4 2026 + 2027 roadmap محدّث
- [ ] decision: scale to 3 centers أم hardening إضافي

---

## 3. Engineering Workstreams

### 3.1 DevOps Master (Sprint 0/3/6/9)

**CI/CD على GitHub Actions:**
- Workflow `ci.yml`: matrix Python 3.12 × Node 22، jobs: lint (ruff + eslint) → type (mypy strict + tsc) → test (pytest + vitest) → build images → Trivy scan → push GHCR
- Workflow `cd.yml`: على tag → Coolify webhook → smoke test → Slack notify
- pre-commit hooks: ruff format + eslint --fix + commitlint
- Branch protection: required reviews 1 + CI green

**Observability Stack:**
- **Logs:** Loki + Promtail (Docker driver)، structlog مع correlation_id + tenant_id + user_id
- **Metrics:** Prometheus + node_exporter + cAdvisor + custom (FastAPI prometheus_fastapi_instrumentator)
- **Traces:** Tempo + OpenTelemetry SDK في كل service
- **Errors:** Sentry self-hosted أو cloud (free tier للـ MVP)
- **Dashboards:** Grafana مع dashboards محفوظة في `infra/grafana/dashboards/`

**Production Infra:**
- Hetzner CX32 (4 vCPU + 8GB) + Coolify لإدارة الـ deployments
- Cloudflare R2 للـ DICOM + backups (S3 compatible، no egress fees)
- Tailscale للـ admin access (لا public SSH)
- خطة الترقية: CX32 → CCX23 (8 vCPU + 16GB، dedicated CPU) عند 500 study/يوم

**Backup Strategy:**
- pgBackRest: full أسبوعي، diff يومي، incr ساعي، WAL مستمر إلى R2
- PITR window: 14 يوم
- RPO: 1 ساعة، RTO: 4 ساعات
- monthly restore drill في staging مع timing
- MinIO mc mirror cross-region + versioning + object lock WORM للـ DICOM (compliance 7 سنوات)
- Orthanc REST `/exports` + tar+zstd weekly

### 3.2 DevSecOps (Sprint 0/2/4/8/9/10)

> الأجزاء الـ critical: انظر [DevSecOps Detail](#7-devsecops-detail) أدناه.

**Compliance Gap Closure Plan (ملخص):**

| المتطلب | الفجوة | Sprint |
|---------|--------|--------|
| Encryption in transit | DICOM plain TCP | 2 |
| Access Control 2FA | لا WebAuthn | 8 |
| Audit alerts | لا SIEM | 6 |
| Breach notification | manual | 6 |
| Patient consent | implicit | 5 |
| Right-to-erasure | soft delete | 7 |
| Data residency Saudi | Egypt only | post-MVP |

**Secrets:** Infisical self-hosted (Docker). KMS عبر age keys في Infisical secret. Rotation: DB creds شهري، JWT signing keys ربع سنوي، service tokens سنوياً.

**mTLS:** step-ca Docker + بسكربت rotation يومي للشهادات داخلية (TTL 24h). Caddy على edge.

**OIDC:** Zitadel (single-binary، WebAuthn built-in، أداء أفضل من Authentik/Keycloak في benchmarks). RBAC mapping من الـ roles الحالية.

**Network:** Caddy reverse proxy (TLS auto). Cloudflare WAF rules: rate limit `/v1/instances` 100 req/min/IP، block known bad ASNs، challenge على `/v1/auth/login` بعد 5 failures.

**Runtime Security:** Falco (container syscall monitoring) — قرار: Wazuh overkill لـ < 20 host. Loki alert rules كـ SIEM خفيف.

**Threat Model STRIDE:** انظر [DevSecOps Detail](#7-devsecops-detail).

**PDF + DICOM SR Signing:** PAdES-B-LT للـ PDF بشهادة GlobalSign Qualified (مصر: قانون 15/2004 مستوى 3 + سدايا CSF). DICOM SR DigitalSignaturePurposeCodeSequence (PS3.15).

**Pen Test:** خارجي Sprint 9 قبل pilot بأسبوعين. scope: OWASP Top 10 + DICOM Security Profile.

### 3.3 Test Engineer (Sprint 1/4/5/7/12)

**Pyramid:** Unit 50% / Integration 30% / E2E 15% / Manual 5%. Coverage gate: 70% للـ services الحرجة (crypto/auth/repo/segmentation)، 50% الباقي.

**E2E (3 سيناريوهات):**
- pytest-asyncio + httpx async + testcontainers-python (أفضل من docker compose down/up — isolation حقيقي)
- factory_boy للـ DICOM fixtures
- duration target: golden_path ≤ 120s، priority_routing ≤ 60s، rls_isolation ≤ 30s

**Unit:** crypto.py 100% (FIPS boundary tests)، auth.py 100% (JWT expiration + tenant isolation)، repo.py 90% (parameterized SQL injection vectors)، segmentation.py 80% (mock Orthanc DICOMweb).

**Contract:** Schemathesis على كل OpenAPI spec (auto). Pact لـ ingestion ↔ ai-worker ↔ llm.

**Performance (k6):**
- Worklist: 100 concurrent، P95 ≤ 2s
- Study burst: 1000/day (10/min peak)، 0 lost objects
- LLM: 50 concurrent، P95 ≤ 15s
- WS: 200 connections، 0 lost events

**Chaos:** toxiproxy + pumba. سيناريوهات: kill Redis، Postgres partition 30s، MinIO 50% loss، Ollama timeout 30s.

**Security in CI:** Bandit + Semgrep + npm audit + Snyk + ZAP baseline.

**Test Data:** DICOM مجهولة الهوية ≤50MB في CI + synthetic (pydicom) للـ metadata edge cases.

**CI:** Matrix Python 3.12 × Postgres 16 × Redis 7. pytest-xdist parallel. pytest-rerunfailures لـ flaky (max 2 retries).

### 3.4 Backend Dev (Sprint 3/7/8)

**FHIR Gateway Completion:**
- R4B (الأكثر استقراراً في 2026، R5 لم يستقر بعد للـ implementers الكبار)
- مكتبة: `fhir.resources` (Pydantic-based، type-safe، active maintenance)
- Resources بالأولوية: Patient → Practitioner → Organization → ImagingStudy expand → DiagnosticReport + SR ref → Observation → ServiceRequest → Encounter → Consent → AllergyIntolerance
- SMART-on-FHIR backend services (JWT client assertion + JWKS)
- Bulk Data API `$export` async pattern (ndjson إلى MinIO + status polling)
- Conformance test: Inferno suite

**LLM Service Router:**
- Class-based router مع fallback chain (Ollama → Claude → Stub)
- Prompt versioning: Langfuse self-hosted (open source، track versions + scores + traces)
- Citation tracking: structured output مع `chunk_id` per claim
- SSE streaming للـ Chat panel
- Cost tracking per tenant في Redis + daily summary في DB
- Rate limit per user (sliding window عبر Redis)

**vision-ai Integration:**
- تحويل من POST endpoint إلى Redis Streams consumer
- subscribe إلى `studies:new`، publish إلى `ai:inference`
- circuit breaker (pybreaker) لـ Ollama timeouts
- DLQ stream `ai:failed` للـ manual review

**Alembic:**
- `alembic init alembic_async` (asyncpg)
- baseline: `alembic stamp head` بعد دمج الـ 8 SQL files
- env.py: استثناء autogenerate لـ RLS policies + triggers (manual revisions فقط)
- CI check: `alembic upgrade head && alembic downgrade -1 && alembic upgrade head`

**API Versioning:** URL versioning (`/v1`). Deprecation: 6 شهور warning عبر `Deprecation` header + Sentry tag. OpenAPI diff في CI (oasdiff).

**Error Handling:** RFC 7807 Problem Details. Correlation IDs من header `X-Request-ID` أو auto-generated. middleware يحذف PHI من error messages قبل log/Sentry.

**Background Jobs:** Redis Streams الحالي يكفي للـ MVP. Migration لـ ARQ (async Python، أبسط من Celery) عند الحاجة لـ cron + scheduled + DLQ متقدمة.

**WebSocket Scaling:** FastAPI WS + Redis pub/sub bridge للـ multi-instance. heartbeat ping 30s. JWT refresh عبر `auth_refresh` message.

**Caching:** Cloudflare HTTP للـ static + DICOM thumbnails. Redis app cache (cachetools per-request + Redis للـ cross-request). invalidation events عبر Redis pub/sub channel `cache:invalidate`.

### 3.5 Database Wizard (Sprint 3/6/7)

**Schema Audit (Predicted Risks):**
- Missing indexes متوقعة: `studies(tenant_id, status, priority, created_at DESC)`، `instances(study_uid)`، `audit_log(entity_type, entity_id, created_at)`، `notifications(user_id) WHERE read_at IS NULL`
- N+1 على worklist (studies → series count → instances count): حلّ بـ materialized columns أو covering index INCLUDE
- RLS gaps محتملة على junction tables (`patient_doctors`، `study_tags`): تحقق + اختبار
- UUID v7 (time-ordered) بدل BIGSERIAL للـ studies — يسهّل sharding مستقبلاً
- TIMESTAMPTZ في كل مكان، تخزين UTC، عرض بـ user timezone

**Partitioning (pg_partman):**
- `audit_log`: monthly، retention 7 سنوات (HIPAA) → cold partitions تُنقل إلى R2 (pg_dump per partition)
- `ai_inferences`: monthly، retention سنتان
- `studies`: غير مفيد قبل > 10M صف
- خطة zero-downtime: `CREATE TABLE_new PARTITION BY RANGE` + `INSERT ... SELECT` في batches + RENAME atomic

**Indexing Plan:**
- B-tree على FK + sort columns (الأساس)
- GIN على `patient.name_hmac` (deterministic encrypted search)
- HNSW على `knowledge_chunks.embedding` (pgvector، ef_construction=200، m=16)
- BM25 (pg_search) على `reports.body_ar` + `knowledge_chunks.text_ar` مع Arabic tokenizer
- Partial indexes: `WHERE status='unread'` للـ worklist hot path
- Covering INCLUDE: worklist query يستخدم index-only scan

**Backup (pgBackRest):** Full أسبوعي، diff يومي، incr ساعي، WAL مستمر إلى R2. PITR 14d. Monthly DR drill في staging مع توثيق RTO المتحقّق. Weekly auto restore + health check.

**Alembic:** baseline stamp + autogenerate للـ schema changes فقط (RLS/triggers manual). CI: upgrade + downgrade + upgrade test.

**Patient Master Index (PMI):**
- مشكلة: نفس المريض في 3 مراكز برقم بطاقة وطنية موحّد
- حل: `cross_tenant_pmi` table في tenant خاص `_system`
- matching: Splink (probabilistic + explainable) > Dedupe.io (موثّق طبياً أكثر)
- consent-driven: المريض يوافق صراحةً قبل ربط ملفه عبر مراكز
- privacy: SHA-256(national_id + salt_per_tenant) + Bloom filter للـ matching بدون كشف خام
- audit كل matching attempt

**Query Performance Targets:**
- Worklist load: P95 < 200ms على 100k study
- Patient timeline: P95 < 500ms على 1k study/patient
- Audit search: P95 < 1s على 10M صف

**ParadeDB pg_search:** Arabic tokenizer مخصّص + snowball Arabic stemming. combined query: `BM25 score + cosine similarity` مع RRF.

**PgBouncer (تحذير حرج):**
- transaction pooling يكسر `set_config` (RLS context) لأن الجلسة قد تتبدّل
- الحلول: (أ) session pooling مع pool أكبر، (ب) `SET LOCAL` داخل transaction واحد، (ج) tenant_id كـ query param بدل session var
- التوصية: ابدأ بـ session pooling، اقس قبل التحوّل لـ transaction

### 3.6 RAG Specialist (Sprint 5)

**Knowledge Sources:**

| المصدر | حجم | لغة | ترخيص | تحديث |
|--------|-----|-----|-------|-------|
| ICD-11 MMS (WHO API) | ~2GB | ar/en (78% ar coverage) | WHO open | ربع سنوي |
| RadLex (RSNA) | ~420MB | en (نترجم محدودياً) | CC-BY-NC-SA | سنوي |
| MeSH Arabic | ~155MB | ar | NLM | 2024 |
| سدايا radiology guidelines | ~320MB | ar | حكومي | شهري |
| ESR templates | ~18MB | en/multi | ESR | 2023 |

**تحذير حقيقي:** ترجمة WHO للعربية غير مكتملة. خطة: استخدام بسرعة (FastText Arabic NMT أو Claude API) لإكمال الـ 22% الناقصة بمراجعة طبيب.

**Embedding Model:** **bge-m3** للـ MVP (1024 dim، 82% MTEB-Arabic، context 8k). Fallback: `jina-embeddings-v3` (أسرع 3x للـ real-time). تأجيل AceGPT-Embedding حتى GPU متاح.

**Chunking:**
- ICD-11: 1 entry = 1 chunk + metadata (code, parent_path, version)
- Templates: section-based
- Guidelines: semantic chunking عبر LangChain SemanticChunker

**Indexing Pipeline:** بسيط cron job (لا Prefect/Dagster overhead). Idempotent عبر content hash. Versioning: `knowledge_chunks_v1` → `v2` + view `knowledge_chunks` يشير للأحدث، swap atomic.

**Hybrid Search:** BM25 (pg_search) + dense (pgvector HNSW) + RRF (Reciprocal Rank Fusion، أبسط من learned-to-rank). Re-ranker: `bge-reranker-v2-m3` على top-50 → top-10 (يفعّل فقط إذا confidence منخفض < 0.7).

**Query Pipeline:** query rewriting بـ qwen2.5:3b صغير. HyDE للأسئلة الغامضة (generate hypothetical answer ثم بحث). Metadata filters: modality + body_part + age_range.

**Generation + Citation:**
- مرّر top-k chunks في system prompt
- citation format: `[ICD-11:1A00.0]` inline في النتيجة
- Anti-hallucination: CRAG (Corrective RAG) — لو confidence منخفض ترجع "غير كافٍ للإجابة"

**Evaluation:**
- 100 سؤال طبي عربي مرجعي — partnership مع كلية طب القاهرة أو UMM al-Qura (طبيب يصحّح)
- Metrics: Recall@10، MRR، nDCG، Ragas (Answer Relevance + Faithfulness + Context Precision)
- CI eval على PR يلمس llm-service أو knowledge_chunks

**Cache:** Query cache في Redis (semantic hash عبر embedding similarity > 0.95). Embedding cache (لو نفس النص). Invalidation: TTL 24h + force invalidate عند تحديث KB version.

### 3.7 Model Optimizer (Sprint 4/8)

**AI Triage Selection (MVP Sprint 4):**

| نموذج | modality | حجم | CPU latency متوقع | License |
|-------|----------|-----|-------------------|---------|
| TorchXRayVision densenet121 | Chest X-ray | 30MB | ~3-5s/image على Core Ultra 9 | Apache 2.0 |
| MONAI Brain CT Hemorrhage | Brain CT | 250MB | ~20-40s/volume | Apache 2.0 |
| CheXNet (Stanford) | Chest X-ray | 50MB | ~5-8s/image | Research only ⚠️ |

**القرار:** TorchXRayVision أولاً (chest X-ray أبسط + license تجاري + أسرع على CPU). Brain CT في Sprint 12+. تجنّب CheXNet (research license).

**LLM Clinical Arabic:**

| نموذج | حجم | عربي طبي | لـ commercial medical |
|-------|-----|---------|------------------------|
| qwen2.5:14b | 14B | جيد عام، طبي محدود | Apache 2.0 ✅ |
| AceGPT-13B (KAUST) | 13B | جيد طبي | research-friendly لكن fine-tune حق commercial غامض |
| ALLaM (سدايا) | متغيّر | ممتاز عربي | API فقط، privacy؟ |
| Jais-30B | 30B | جيد عربي عام | Apache 2.0، GPU كبير |
| Claude API | — | ممتاز | privacy + cost |

**القرار:**
- Dev: qwen2.5:3b على CPU (سرعة)
- Pilot: qwen2.5:14b على GPU rental + fine-tune خفيف على تقارير عربية مجهولة (سنبني datasets في pilot)
- Fallback: Claude API للحالات المعقدة (يقرّر الـ router)
- **رأي صريح:** AceGPT لا يستحق التحول إلا بعد قياس فعلي على 100 تقرير. ادعاءات "أفضل عربي طبي" لم تُختبر مستقلاً في domain الأشعة.

**Serving:** vLLM للـ production GPU (أفضل throughput من Ollama). Ollama للـ dev (DX أفضل). Quantization: GGUF Q4_K_M (Ollama)، AWQ على vLLM. Speculative decoding غير ضروري للـ MVP.

**Hardware Roadmap:**
- Phase 1 (Sprint 0-7): CPU dev، lab development فقط
- Phase 2 (Pilot Sprint 9-12): GPU rental Vast.ai L4 (~$0.40/hour، 24GB VRAM) — تشغيل عند الحاجة فقط (cold start مقبول للـ batch)
- Phase 3 (3-6 شهور): RTX 4090 dedicated (~$2000) — breakeven مع Vast.ai عند ~5000 ساعة استخدام، أي ~7 شهور تشغيل 24/7
- Phase 4 (1000+ studies/يوم): multi-GPU أو Claude API hybrid

**Continuous Learning:**
- الطبيب يعدّل التقرير → نخزّن `(prompt, generated, edited)` triple
- Label Studio للـ annotation review أسبوعياً
- Re-training: شهري على 1k samples (LoRA fine-tune)، canary 10% traffic
- A/B framework عبر header `X-Model-Version`
- Data leakage prevention: hash patient_id قبل تخزين training data

**Model Registry:** MLflow self-hosted (Docker، open source، Postgres backend). تخزين weights في R2. Stages: dev → staging → prod.

**Monitoring:** Drift detection عبر Evidently AI (input distribution + prediction distribution). Alert: accuracy drop > 5% على validation set اليومي.

**Inference Pipeline:** Pre-processing CPU (windowing + normalization، numpy)، inference (batching حتى 8)، post-processing (DICOM SR generation عبر highdicom). Latency budget: pre 1s + inference 5s + post 2s = 8s P95.

**Privacy:** Federated learning مؤجّل (post-2027). Differential privacy في fine-tuning عبر Opacus. Model extraction mitigation: rate limit + output noise.

### 3.8 Project Manager — RACI + Risks

**RACI Matrix:**

| نشاط | عبد الرحمن | OpenCode/Kiro | NEXUS-AI | Pilot Doctor |
|------|------------|----------------|----------|---------------|
| Architecture decisions | A,R | C | C | I |
| CI/CD setup | A,R | R | C | I |
| FHIR endpoints | A | R | C | I |
| AI model selection | A,R | I | C | C |
| Clinical UX | A | C | I | R |
| Pilot training | A | I | I | C |
| Production deploy | A,R | C | C | I |
| Incident response | A,R | I | C | I |

> A=Accountable, R=Responsible, C=Consulted, I=Informed

**Risk Register (sorted by P × I):**

| المخاطر | احتمال | تأثير | درجة | تخفيف |
|---------|--------|-------|------|--------|
| Pilot doctor ينسحب | متوسط | عالي | 9 | مركزان احتياط مُعدّان من Sprint 0 |
| LLM quality لتقارير عربية ضعيف | عالي | عالي | 12 | router + human-in-loop + Claude fallback |
| Edge Gateway compression متعطّل | متوسط | عالي | 9 | fallback لـ uncompressed + bandwidth budget |
| Compliance approval EDA يتأخّر | عالي | متوسط | 8 | تقديم مبكر + tenant SaaS pattern |
| Solo dev burnout | عالي | عالي | 12 | حدود ساعات يومية + NEXUS-AI parallelization + OpenCode handoffs |
| GPU rental cost spike | متوسط | متوسط | 6 | budget alert + Claude API fallback |
| AI false negative critical case | منخفض | حرج | 8 | disclaimer + Sensitivity threshold عالٍ + radiologist يبقى المسؤول |
| Postgres data loss | منخفض | حرج | 8 | pgBackRest + DR drill + PITR |
| WhatsApp ban (Baileys) | متوسط | متوسط | 6 | Cloud API كـ fallback (مكلف) + warning للأطباء |
| Dependency CVE حرج | عالي | متوسط | 8 | Trivy + Dependabot + patch SLA 7 أيام |

### 3.9 Documentation Writer

**Inventory:**

| وثيقة | جمهور | صيغة | أداة | sprint |
|-------|-------|------|------|--------|
| Runbook | ops | MD | repo `docs/runbook/` | 6 |
| DR Playbook | ops | MD | repo | 3 |
| C4 Diagrams | dev | mermaid | repo | 0 |
| API Docs | dev/integrator | OpenAPI | Scalar | 7 |
| Dev Onboarding | dev | MD | repo | 1 |
| Pilot Doctor Onboarding | طبيب | PDF + فيديو | Canva + Loom | 11 |
| Pilot Technician | فني | PDF | Canva | 11 |
| Compliance Dossier | شريك/regulator | PDF | LaTeX | 10 |
| Privacy + ToS | مستخدم | HTML | Next.js page | 11 |
| Patient Consent | مريض | PDF | LaTeX | 11 |
| Marketing One-pager | شريك تجاري | PDF | Canva | 13 |

**Runbook Sections:** prerequisites، dashboards links، common incidents (10 سيناريو محدّد)، escalation matrix، rollback، DR drill schedule.

**Pilot Doctor Half-Day:**
- 30min Login + UI tour
- 60min 5 cases (CT brain normal، CT brain hemorrhage، chest X-ray normal، chest X-ray pneumonia، MRI knee)
- 30min Report edit + sign + WhatsApp send
- 30min Patient file + history + QR
- 30min Q&A + feedback form
- مخرج: بطاقة مرجع سريع عربية مطبوعة (A5) + فيديو Loom 10 دقائق

**Pilot Technician (1h):** DICOM router config (AE: MIDCINE) + troubleshooting (network/AE/compression) + WhatsApp escalation contact.

**API Docs:** OpenAPI 3.1 auto من FastAPI. Scalar portal (أجمل من Stoplight free + سريع). examples لكل endpoint. SDK gen عبر openapi-generator (Python + TS).

**Compliance Dossier:** PDF موحّد: architecture 1-page + data flow + storage locations + encryption + access control + audit + incident response + BAA + DPA templates + سدايا/EDA approvals.

**Internal KB:** **Obsidian + Git** (مشاركة عبر repo، markdown، لا dependency cloud). هيكل: `/architecture` `/runbooks` `/incidents` (postmortems) `/decisions` (ADRs) `/sprint-notes` `/pilot-feedback`.

**Patient-Facing Arabic:** QR explanation card، WhatsApp packet sample، privacy notice مختصر (1 صفحة سهل)، حقوق access/erasure/correction.

**Marketing One-pager:** عربي، ما يحلّه midcine، vs حورس + بدائل، نموذج تسعير، case study (post-pilot)، contact.

**Maintenance:** docs review في PR gate (CODEOWNERS لـ `docs/`)، quarterly review، broken link checker في CI.

---

## 4. Cost Estimate Monthly (USD)

| البيئة | Compute | Storage | Network | Tools | الإجمالي |
|--------|---------|---------|---------|-------|----------|
| Dev (local) | $0 | $0 | $0 | $0 | **$0** |
| Staging | Hetzner CX22 $4 | R2 100GB $1.5 | $0 | Sentry free | **$5.5** |
| Pilot (1 مركز) | Hetzner CX32 $8 + Edge bundle on NUC | R2 1TB $15 | Cloudflare Pro $20 | Infisical free, GlobalSign cert $25/yr | **$45** |
| + GPU pilot | Vast.ai L4 $0.40/hr × 8h × 30d | — | — | — | **+$96** |
| Production (10 مراكز) | CCX23 $25 + 2× edge | R2 5TB $75 | CF Pro $20 | + Loki Cloud $50 + Zitadel self-hosted $0 | **~$200** |

**Toolchain costs:**
- GitHub Actions: free (public/2000 min private)
- GHCR: free
- Cloudflare: $20 Pro (WAF + workers)
- Sentry: free tier 5k errors/شهر
- GlobalSign cert: ~$25/سنة
- Domain: ~$15/سنة

**نقطة حرجة:** GPU rental هو أكبر متغيّر. خطة الحدّ: تشغيل LLM بـ batch فقط (لا realtime call مباشر إلا للـ chat panel)، باقي تقارير preprocessed.

---

## 5. Go/No-Go Decision Gates

في نهاية كل sprint، اجتماع 30 دقيقة:
1. هل acceptance criteria مُتحقّقة؟
2. هل أي risk صعد فوق درجة 9؟
3. هل الـ budget لمدة الـ sprint التالي متوفر؟
4. **No-Go triggers:**
   - sprint blocker > 3 أيام بدون حل واضح
   - critical security issue غير مغلق
   - pilot doctor signals churn
   - cost overrun > 50% شهرياً

عند No-Go: pause الـ feature work + week-long hardening + retro.

---

## 6. Post-MVP Roadmap

### Q4 2026 (Sprint 14-26)
- **Sprint 14-17:** 3 مراكز paid pilot ($150/شهر/مركز خصم 50%)
- **Sprint 18-20:** Mobile-responsive viewer (لا native app بعد)
- **Sprint 21-23:** FHIR integration مع أول HIS (نختار الأكثر شيوعاً)
- **Sprint 24-26:** AI Triage الثاني (Brain CT Hemorrhage على GPU dedicated)

### Q1 2027
- DICOM SR كامل يستبدل PDF كمعيار التبادل
- Multi-tenant SaaS self-onboarding wizard
- midcine Chain (multi-branch dashboard)
- Continuous Learning loop production

### Q2 2027
- Mammography AI
- Flutter mobile app
- بدء تجريبي السعودية (Data residency Saudi region)
- Series B fundraising (or revenue-based)

---

## 7. DevSecOps Detail

### STRIDE Threat Model (entry points)

| Entry Point | S | T | R | I | D | E |
|-------------|---|---|---|---|---|---|
| `ingestion-api` /v1/instances | OIDC ✅ | WAF ⏳ | audit ✅ | TLS ✅ | rate limit ⏳ | RLS ✅ |
| `dicom-receiver` :11113 | AE whitelist ✅ | DICOM TLS ❌→⏳ | logs ✅ | TLS ❌→⏳ | Orthanc QoS ✅ | N/A |
| `fhir-gateway` :8400 | SMART-on-FHIR ⏳ | WAF ⏳ | audit ✅ | TLS ✅ | rate limit ⏳ | scope check ⏳ |
| QR public token | signed token ✅ | TLS ✅ | log access ✅ | redacted view ✅ | rate limit ⏳ | one-time scope ✅ |
| `whatsapp-bridge` :8500 | mTLS ⏳ | TLS ✅ | logs ✅ | encrypted media ⏳ | Baileys self-limit | RBAC ⏳ |

> ✅ = موجود، ⏳ = مخطّط، ❌ = مفقود

### Secrets Detail

**Infisical Setup (Sprint 2):**
- self-hosted Docker (free)، PostgreSQL backend مشترك مع midcine DB (schema منفصل)
- CLI integration في كل service `infisical run -- python -m app`
- Secret tags: `env=prod`، `service=ingestion-api`، `rotation=monthly`
- Webhook عند rotation → service reload

**Rotation Schedule:**
- DB credentials: monthly (تلقائي عبر `pg_user_rotation` extension أو script)
- JWT signing keys: quarterly
- Service-to-service tokens: yearly
- GlobalSign cert: annual + monitoring قبل 30 يوم

### Compliance Specific Articles

**HIPAA:**
- §164.312(a) Access Control → OIDC + RBAC + RLS ✅
- §164.312(b) Audit Controls → immutable audit_log ✅
- §164.312(c) Integrity → SHA-256 checksums + WAL
- §164.312(d) Authentication → 2FA WebAuthn Sprint 8
- §164.312(e) Transmission → mTLS Sprint 2

**GDPR:**
- Art. 7 Consent → explicit consent UI Sprint 5
- Art. 17 Right to erasure → crypto-shredding (delete encryption key) Sprint 7
- Art. 25 Privacy by Design → embedded في architecture
- Art. 30 Records of processing → audit_log ✅
- Art. 33 Breach notification 72h → automated detection Sprint 6
- Art. 35 DPIA → نوثّق قبل pilot

**EDA (مصر) — قانون 151/2020 لحماية البيانات:**
- مادة 4: موافقة صريحة للمعالجة → consent UI Sprint 5
- مادة 8: نقل عبر الحدود → نوثّق مسارات البيانات
- مادة 19: تعيين مسؤول حماية بيانات (DPO) → عبد الرحمن مبدئياً مع تأهيل لاحق

**سدايا (السعودية) — PDPL + Cybersecurity Framework:**
- DS-1: Data residency → خادم Saudi region post-MVP
- IAM-01: MFA إلزامي → Sprint 8
- IR-3: Incident response 72h → playbook Sprint 6
- DS-4: Data destruction → crypto-shredding Sprint 7

---

## 8. ملاحظات نهائية

**ما تتوقعه من الـ pilot الأول (Sprint 11):**
- 80% من الأطباء سيشكون من بطء UI (network في مصر) → الحل: edge bundle + lazy loading
- 50% من الـ AI suggestions سترفض → طبيعي في v1، نتعلّم منها
- 1-2 incident أمني بسيط (failed login bursts، dependency CVE) → runbook جاهز

**ما ليس في الخطة عمداً:**
- Kubernetes (overkill حتى 500 study/يوم)
- Kafka (Redis Streams يكفي)
- Microservices مفرطة (الخدمات الحالية بحجم مناسب)
- Native mobile app (web responsive يكفي للـ pilot)
- Stripe/Paymob (pricing manual للـ pilot، automation لاحقاً)
- Custom LLM training من الصفر (fine-tune فقط)

**القاعدة الذهبية:** كل قرار يجب أن يجاوب: "هل يقرّبنا من pilot doctor راضٍ في Sprint 11؟" — لو الإجابة لا، فهو post-MVP.

</div>
