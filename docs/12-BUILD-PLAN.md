<div dir="rtl" lang="ar">

# 12 — خطة البناء الكاملة (Build Plan)
## midcine v2 — النسخة المتمايزة

> **التاريخ:** 2026-06-18
> **يدمج:** ADR-008 (AI Ensemble) + ADR-009 (Edge-First Security) + ADR-010 (Modular Suite)
> **يُحدّث:** docs/11-MASTER-ENGINEERING-PLAN.md
> **الفلسفة الجديدة:** "نتفوّق بالاختلاف، لا بالتقليد"

---

## 0. التحوّل الاستراتيجي — ملخّص

كنا نخطّط نظاماً يقلّد الأنظمة الكبيرة بنسخة عربية. القرار الجديد: **نهدم 3 افتراضات أساسية للأنظمة التقليدية:**

| الافتراض التقليدي | الافتراض الجديد لـ midcine |
|--------------------|---------------------------|
| نموذج AI واحد ضخم / نماذج منفصلة كأدوات | **عقل واحد ensemble** متعدد النماذج موحّد بـ aggregator |
| تشفير شامل + zero-trust internal + HSM | **Edge-first:** البيانات لا تغادر المشفى. تشفير حيث يهمّ |
| Dashboard monolith بـ 200 ميزة | **7 apps مركّزة** ينتقل بينها بزر |
| تكامل HIS واسع كميزة | **تجاهل HIS مؤقتاً.** نركّز على تجربة الطبيب اليومية |
| Multi-region cloud كأولوية | **Per-hospital edge + cloud كموصّل فقط** |

---

## 1. المعمارية الجديدة (High Level)

```
┌─────────────────────────────────────────────────────────────────┐
│                  المشفى A (داخلي)                                │
│  ┌──────────┐  ┌──────────┐  ┌─────────────┐  ┌──────────────┐│
│  │ CT/MRI/  │→│ Orthanc  │→│ Edge        │→│ AI Cache      ││
│  │ XR scans │ │ (local)  │ │ Gateway     │ │ (local CPU)   ││
│  └──────────┘ └──────────┘ └─────┬───────┘ └──────────────┘ ││
│                                   │                            ││
│                                   ▼                            ││
│                          gRPC + mTLS (Cloud-bound only)        ││
└───────────────────────────────────┼────────────────────────────┘│
                                    │
        ┌───────────────────────────┴────────────────────────────┐
        │                  midcine Cloud                          │
        │                                                          │
        │  ┌─────────────────────────────────────────────────┐   │
        │  │  Dispatcher (AI Routing)                         │   │
        │  └─────────┬───────────────────────────────────────┘   │
        │            │                                            │
        │  ┌─────────┼──────────┬──────────┬──────────┬─────┐   │
        │  ▼         ▼          ▼          ▼          ▼     │   │
        │ TorchXRay  MONAI    Segment    Qwen2-VL   Clinical│   │
        │            Brain    (HU+SAM)   (GPU)      LLM     │   │
        │  └─────────┬──────────┴──────────┴──────────┴─────┘   │
        │            ▼                                            │
        │  ┌─────────────────────────────────────────────────┐   │
        │  │  Aggregator (consensus + citations)              │   │
        │  └─────────┬───────────────────────────────────────┘   │
        │            │                                            │
        │  ┌─────────▼─────────┬─────────────┬─────────────┐    │
        │  │ Cloud Index       │ Consent     │ Tunnel      │    │
        │  │ (PMI hash only)   │ Service     │ Broker      │    │
        │  └───────────────────┴─────────────┴─────────────┘    │
        │            │                                            │
        │            ▼                                            │
        │  ┌─────────────────────────────────────────────────┐   │
        │  │  midcine Suite (7 apps)                          │   │
        │  │  Worklist | Reader | Patient | Insights |        │   │
        │  │  Connect  | Console | Mobile                     │   │
        │  └─────────────────────────────────────────────────┘   │
        └────────────────────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┴────────────────────────────┐
        │                  المشفى B (داخلي)                       │
        │              [نفس البنية الداخلية]                       │
        │  ← P2P tunnel (consented) → A                          │
        └────────────────────────────────────────────────────────┘
```

### المكوّنات الجديدة (لم تكن في الـ Master Plan)

1. **AI Dispatcher Service** (`services/ai-dispatcher/`)
2. **AI Aggregator Service** (`services/ai-aggregator/`)
3. **Cloud Index Service** (`services/cloud-index/`)
4. **Consent Service** (`services/consent/`)
5. **Tunnel Broker** (`services/tunnel-broker/`)
6. **7 apps في monorepo** (`apps/{worklist,reader,patient,insights,connect,console,mobile}`)
7. **Shared packages** (`packages/{ui,auth,api-client,event-bus,command-palette}`)

### المكوّنات المُلغاة أو المقلّصة

- ❌ `apps/web` (الـ monolith) → يُفكَّك إلى 7 apps
- ⬇ DICOM TLS داخلي → يُلغى (LAN معزولة)
- ⬇ HSM-backed KMS → Infisical + age keys
- ⬇ Field encryption شامل → محدود على PII الحرج
- ⬇ Service mesh → لم يكن مخططاً أصلاً، نؤكّد عدم احتياجه

---

## 2. خارطة الـ Sprints المحدّثة (90 يوم)

> كل تغيير عن الخطة السابقة موسوم بـ 🆕 أو 🔄

### Sprint 0 (الأسبوع 1) — Foundation + Strategic Pivot
- [ ] `.github/workflows/ci.yml`
- [ ] Sentry + structlog + correlation IDs
- [ ] 🆕 إنشاء ADR-008/009/010 (تم)
- [ ] 🆕 monorepo skeleton: Turborepo + pnpm workspaces
- [ ] 🆕 `packages/ui` + `packages/auth` + `packages/api-client` skeletons
- [ ] 🆕 حذف `apps/web` الحالي وإنشاء 7 apps فارغة في `apps/*`
- [ ] trufflehog scan على repo

**Go/No-Go:** monorepo يبني، CI أخضر، 7 apps تطبع "Hello"

### Sprint 1 (الأسبوع 2) — Tests + Design System
- [ ] الـ 3 E2E tests
- [ ] testcontainers integration
- [ ] 🆕 `packages/ui` كامل: design tokens + shadcn + RTL config
- [ ] 🆕 Storybook لـ `packages/ui`
- [ ] 🆕 Chromatic visual regression في CI

**Go/No-Go:** E2E يمرّ + Storybook منشور + visual regression شغّال

### Sprint 2 (الأسبوع 3) — 🔄 Edge-First Security + SSO
- [ ] Infisical self-hosted
- [ ] migration `.env` → Infisical
- [ ] 🔄 step-ca لـ signing certs **فقط** (لا mTLS داخلي شامل)
- [ ] 🆕 mTLS فقط على Edge↔Cloud boundary
- [ ] 🆕 Zitadel deployment + SSO cookie shared على `.midcine.io`
- [ ] 🆕 `packages/auth` يلفّ Zitadel SDK لكل apps

**Go/No-Go:** SSO يعمل عبر apps متعدّدة بـ login واحد

### Sprint 3 (الأسبوع 4) — 🆕 Worklist App + Alembic + Backup
- [ ] alembic baseline من 8 SQL files
- [ ] pgBackRest + WAL→R2 + DR drill أول
- [ ] mc mirror MinIO→R2
- [ ] 🆕 **midcine Worklist app** (الأولوية أهم app للأطباء)
  - قائمة + filters (modality, priority, status)
  - بحث سريع
  - command palette ⌘K
  - WebSocket realtime updates

**Go/No-Go:** restore drill < 4h + طبيب يستطيع فرز 50 حالة وهمية

### Sprint 4 (الأسبوع 5) — 🆕 AI Dispatcher + أول Specialist
- [ ] 🆕 `services/ai-dispatcher/` (routing + parallel inference)
- [ ] 🆕 `services/ai-aggregator/` stub (single-model passthrough)
- [ ] TorchXRayVision densenet121 في ai-worker
- [ ] benchmark CPU: < 10s/study على CX32
- [ ] Sensitivity ≥ 80% على 50 chest X-ray
- [ ] vision-ai integration مع Redis stream

**Go/No-Go:** dispatcher يستدعي 2 نماذج بالتوازي، aggregator يدمج النتائج

### Sprint 5 (الأسبوع 6) — 🆕 Reader App + RAG
- [ ] WHO ICD-11 API ingestion
- [ ] bge-m3 embeddings → pgvector HNSW
- [ ] hybrid search (BM25 + vector + RRF)
- [ ] integration في llm-service prompt
- [ ] Recall@10 ≥ 75%
- [ ] 🆕 **midcine Reader app**
  - OHIF v3 embedded
  - AI Insights panel (يستهلك ensemble output)
  - Report editor مع inline citations
  - Sign + save flow
- [ ] 🆕 segmentation كـ specialist في dispatcher

**Go/No-Go:** طبيب يفتح حالة، يقرأها، يعدّل التقرير، يوقّع — كل ذلك في Reader app

### Sprint 6 (الأسبوع 7) — Observability + 🆕 Qwen2-VL على GPU
- [ ] Loki + Prometheus + Tempo + Grafana
- [ ] healthchecks لكل service
- [ ] alert rules: error spike, DICOM anomaly, Redis lag
- [ ] dashboards: ensemble latency per-model + accuracy
- [ ] 🆕 Qwen2-VL 7B على Vast.ai L4 (batch mode)
- [ ] 🆕 Qwen2-VL إضافة كـ specialist في dispatcher (shadow mode أول 14 يوم)

**Go/No-Go:** alert يصل خلال 60s + Qwen2-VL يعمل في shadow

### Sprint 7 (الأسبوع 8) — FHIR + 🆕 Patient + Connect Apps
- [ ] FHIR Patient + Practitioner + Organization
- [ ] Observation للقياسات AI
- [ ] ServiceRequest
- [ ] SMART-on-FHIR backend services
- [ ] OAuth بدل client_secret hardcoded
- [ ] 🆕 **midcine Patient app**
  - timeline visual
  - attachments + history
  - cross-hospital lookup button (يستدعي Cloud Index)
- [ ] 🆕 **midcine Connect app**
  - WhatsApp dispatch UI
  - QR generation للأطباء الخارجيين
  - sharing controls

**Go/No-Go:** Inferno ≥ 80% + طبيب معالج يفتح ملف مريض كامل

### Sprint 8 (الأسبوع 9) — 🆕 Cloud Index + Consent + 2FA
- [ ] 🆕 `services/cloud-index/` (PMI hash lookup)
- [ ] 🆕 `services/consent/` (WhatsApp/SMS consent flow)
- [ ] 🆕 `services/tunnel-broker/` (mTLS handshake broker)
- [ ] 🆕 cross-hospital P2P transfer (proof-of-concept بين instance A و B)
- [ ] 2FA WebAuthn للـ admin + signing actions فقط
- [ ] session revocation

**Go/No-Go:** demo: مريض في مشفى A، طبيب يطلب دراسات من مشفى B، مريض يوافق عبر WhatsApp، DICOM ينتقل P2P

### Sprint 9 (الأسبوع 10) — Edge Gateway + 🆕 Console App + Pen Test
- [ ] `edge-gateway/` Docker bundle: Orthanc + Pusher + Redis
- [ ] gRPC bidirectional stream mTLS للسحاب
- [ ] HTJ2K compression
- [ ] 🆕 **midcine Console app**
  - users management
  - dashboards (volume, AI accuracy, turnaround)
  - billing summary
  - tenant settings
- [ ] pen test خارجي على staging

**Go/No-Go:** edge bundle يعمل على NUC منفصل + 0 critical في pen test

### Sprint 10 (الأسبوع 11) — PDF Signing + Compliance + 🆕 Aggregator Smart
- [ ] PAdES-B-LT توقيع PDF (GlobalSign cert)
- [ ] DICOM SR signed (PS3.15)
- [ ] compliance dossier PDF
- [ ] 🆕 Aggregator يصبح "ذكي":
  - consensus algorithm
  - conflict flagging
  - citation forced في output
  - uncertainty propagation

**Go/No-Go:** PDF موقّع يمرّ verify + aggregator يولّد تقرير منظّم مع citations

### Sprint 11 (الأسبوع 12) — 🆕 Insights + Mobile Apps + Pilot Onboarding
- [ ] 🆕 **midcine Insights app**
  - drill-down per ensemble result
  - model comparison view
  - uncertainty visualization
- [ ] 🆕 **midcine Mobile app** (PWA)
  - push notifications للحالات الحرجة
  - quick read + sign
- [ ] تنصيب edge bundle في مركز الشريك
- [ ] تدريب الأطباء + الفنيين

**Go/No-Go:** ≥ 20 study/يوم لـ 5 أيام + رضا 4/5

### Sprint 12 (الأسبوع 13) — Hardening + 🆕 MONAI Brain Hemorrhage
- [ ] إصلاح كل bug من الـ pilot
- [ ] performance tuning
- [ ] 🆕 MONAI Brain Hemorrhage كـ specialist إضافي (GPU)
- [ ] command palette refinement
- [ ] onboarding tours في كل app

**Go/No-Go:** uptime ≥ 99% + الطبيب الرئيسي يوقّع شهادة

### Sprint 13 (الأسبوع 14-15) — Demo Day + Q4 Planning
- [ ] فيديو يوم عمل كامل (يبرز التفوّق)
- [ ] case study PDF
- [ ] قياس KPIs الجديدة:
  - متوسط clicks للوصول لمهمة شائعة
  - وقت أول case في الصباح
  - معدل استخدام command palette
  - NPS سهولة استخدام
- [ ] Q4 2026 + 2027 roadmap محدّث

---

## 3. الفرق التنفيذية والتوزيع

### تقسيم العمل (RACI محدّث)

| نشاط | عبد الرحمن | OpenCode/Kiro | NEXUS-AI | Pilot Doctor |
|------|------------|----------------|----------|---------------|
| Architecture + ADRs | A,R | I | C | I |
| AI Dispatcher + Aggregator | A,R | I | C | I |
| Specialist Models integration | A | R (TorchXRay+MONAI) | C | I |
| Cloud Index + Consent + Tunnel | A | R (handoff كامل) | C | I |
| Worklist + Reader apps | A,R | I | C | C |
| Patient + Connect + Console + Insights + Mobile | A | R (handoff per app) | C | I |
| Design system + packages | A,R | C | C | I |
| CI/CD + Observability | A | R | C | I |
| Security (Edge-First) | A,R | C | C | I |
| Pilot training | A | I | I | C |

> **استراتيجية handoff:** كل app له spec مستقل، يمكن تسليمه لـ OpenCode بعد بناء `packages/ui` و`packages/auth` و`packages/api-client`. عبد الرحمن يحتفظ بالـ AI services والـ critical apps (Worklist + Reader).

### الـ Critical Path (يجب على عبد الرحمن شخصياً)
1. Monorepo + design system + auth (Sprint 0-2)
2. AI Dispatcher + Aggregator (Sprint 4-10)
3. Worklist + Reader apps (Sprint 3, 5)
4. Cloud Index + Consent + Tunnel (Sprint 8)
5. Production deploy + DR (Sprint 3, 9)

### الـ Parallel Path (يمكن delegate)
- Patient/Connect/Console/Insights/Mobile apps (Sprint 7-11)
- التقارير + compliance dossier
- Marketing one-pager
- API documentation portal

---

## 4. التكاليف المحدّثة (شهرياً USD)

| البيئة | السابق | الجديد بعد ADRs | الفرق |
|--------|--------|-----------------|-------|
| Dev | $0 | $0 | — |
| Staging | $5.5 | $5.5 | — |
| Pilot (1 مركز) | $45 | $35 | -$10 (لا HSM) |
| GPU rental (batch only) | $96 | $60 | -$36 (batch بدل always-on) |
| Production (10 مراكز) | $200 | $150 | -$50 (Edge-first يقلّل cloud load) |

**التوفير الإجمالي شهرياً عند 10 مراكز:** ~$96/شهر = $1,150/سنة

---

## 5. ميزة بيع جديدة (Marketing Pivot)

| السابق | الجديد |
|--------|--------|
| "نظام RIS/PACS عربي" | "أول suite طبية عربية بـ عقل واحد متعدد النماذج" |
| "AES-256 + HIPAA" | "بياناتك لا تغادر مشفاك" |
| "أرخص من المنافسين" | "7 apps مركّزة، لا dashboard مزدحم" |
| "Cloud-native" | "Edge-first — السحاب يخدمك، لا يحتجزك" |
| "AI Triage" | "عقل ذكاء اصطناعي يفكّر بصوت عالٍ — تشرح لك لماذا" |

---

## 6. مخاطر جديدة + تخفيف

| المخاطر | احتمال | تأثير | تخفيف |
|---------|--------|-------|--------|
| 🆕 Ensemble aggregator يهلوس | متوسط | عالي | schema strict + citations forced + golden test set |
| 🆕 Cross-app navigation أبطأ من توقع الطبيب | متوسط | متوسط | command palette + state preserved + measure first |
| 🆕 P2P tunnel معطّل بـ NAT/firewall | عالي | متوسط | STUN/TURN + fallback لـ relay مشفّر مؤقت |
| 🆕 Design drift بين 7 apps | متوسط | متوسط | Chromatic visual regression + design review في PR |
| 🆕 Solo dev يبني 7 apps = overload | عالي | عالي | handoff صارم لـ OpenCode + apps متشابهة structurally |
| 🆕 Cloud Index hash collisions | منخفض | متوسط | salt per-deployment + SHA-256 (collision غير realistic) |

---

## 7. خطوات أول 7 أيام (Actionable Now)

### اليوم 1-2: Strategic Pivot Locked
- [x] كتابة ADR-008/009/010
- [x] كتابة Build Plan
- [ ] حفظ الذاكرة (Memory) بالتحوّل
- [ ] notify OpenCode بالـ specs الجديدة

### اليوم 3-4: Monorepo Foundation
- [ ] `pnpm create turbo` initialize
- [ ] نقل `apps/web` إلى backup branch
- [ ] إنشاء 7 apps skeletons + packages
- [ ] CI workflow أوّلي

### اليوم 5-7: Design System Skeleton
- [ ] `packages/ui`: tokens + 10 components أساسية
- [ ] Storybook setup
- [ ] RTL config محسومة
- [ ] أول Pull Request: "Worklist app — Hello World مع design system"

---

## 8. مؤشرات النجاح (KPIs محدّثة)

### تقنية
- Ensemble: ≥ 4 specialists يعملون بالتوازي < 15s P95
- E2E uptime: ≥ 99% خلال pilot
- DR drill: < 4h RTO، < 1h RPO

### تجربة طبيب (الأهم)
- متوسط clicks لمهمة شائعة: ≤ 3
- وقت أول case في الصباح: ≤ 30s
- معدل استخدام command palette: ≥ 40% بعد أسبوعين
- NPS سهولة استخدام: ≥ 50

### عمل
- ≥ 20 study/يوم لـ 5 أيام متواصلة في pilot
- شهادة موقّعة من الطبيب الرئيسي
- ≥ 2 مراكز إضافية مهتمّة بعد الـ case study

---

## 9. ما الذي لن نفعله (صراحة)

- ❌ تكامل HIS واسع — تأجيل لـ post-MVP
- ❌ Mammography AI — Q2 2027
- ❌ Native mobile app — PWA يكفي
- ❌ Multi-region — single region حتى نخدم 10 مراكز فعلياً
- ❌ Self-service onboarding — manual للـ pilot
- ❌ Billing automation — manual invoice للأول
- ❌ منافسة GE/Sectra على feature breadth — لن نفوز هذه المعركة

---

## 10. الخطوة الفورية التالية

**ابدأ بـ Sprint 0 الآن.** الـ blueprint كامل، التنازلات واضحة، الـ KPIs محدّدة.

أول commit يجب أن يكون: حذف `apps/web` القديم + إنشاء `apps/*` السبعة الفارغة + Turborepo config + `packages/ui` skeleton.

> "نتفوّق بالاختلاف، لا بالتقليد. كل قرار في هذه الخطة يجاوب: هل يجعل midcine مختلفاً عن GE/Carestream بطريقة يحبّها الطبيب؟"

</div>
