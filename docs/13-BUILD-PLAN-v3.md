<div dir="rtl" lang="ar">

# 13 — خطة البناء v3 (مُختصرة + عملية)
## midcine — "نتفوّق بالخفّة + حرية الإبداع + ويب أولاً"

> **التاريخ:** 2026-06-28
> **يستبدل عملياً:** `docs/12-BUILD-PLAN.md` (يبقى تاريخياً للمرجع)
> **مبني على:** ADR-008/009/010 + المبادئ الستّة (ADR-011 قيد الكتابة) + استشارة الشركة (Architect + DevOps Master + DevSecOps)
> **الحالة:** مُجمَّعة، **بانتظار اعتماد التنفيذ** — لا تُنفّذ Sprint 0 قبل تأكيد عبد الرحمن

---

## 0. السياق

بعد فحص e2e للمشروع:
- 15 خدمة من Prototype E2E تعمل (docker-compose.dev.yml)
- 5 خدمات جديدة في v12 (ai-dispatcher/ai-aggregator/cloud-index/consent/tunnel-broker) **scaffolding فقط** (2–9KB لكل واحدة)
- 7 apps في v12 **scaffolding فقط** (10 ملفات لكل app)
- `packages/ui` + `packages/auth` + باقي packages **موجودة** لكن غير مكتملة
- `docs/reference/` و `scripts/reference/` و `tests/security/` بها 13 مرجعاً مستعاراً من thawanisup/luffy-server/bothatim/gzp

قرار عبد الرحمن (2026-06-28): **لا نبني من صفر — ننسخ من مشاريع D:\project ونعدّل لـ midcine**.

---

## 1. المبادئ الستّة (الحاكمة لكل قرار)

1. **NEXUS-AI = عقل midcine.** لا dispatcher/aggregator داخلي. `services/mcp-bridge` يستدعي 46 وكيل NEXUS.
2. **أمن خفيف لا يقيّد الإبداع.** رفض صريح للـ paranoia. لا HSM، لا mTLS داخلي، لا 2FA شامل.
3. **لا تقليد.** Infisical > Vault، Compose > k8s، Lucia/Authelia > Zitadel، Coolify > custom CI، SigNoz > Loki+Prom+Tempo+Grafana.
4. **عدة تقنيات صغيرة بدل واحدة عملاقة.** ensemble pattern على كل طبقة.
5. **Inherited Avoidance.** كل ما تتجنّبه الأنظمة الكبيرة لإرث = ميزتنا (DICOMweb، WebSocket، FHIR JSON، WASM DICOM، ⌘K palette).
6. **ويب أولاً.** قبل أي تعقيد: "هل تكفي صفحة ويب؟" غالباً نعم. **app واحد بـ 7 routes** بدل 7 apps منفصلة.

---

## 2. القرارات المعمارية الكبرى (v12 → v3)

| القرار | كان (v12) | يصبح (v3) | المبدأ |
|--------|-----------|------------|--------|
| AI Brain | `ai-dispatcher` + `ai-aggregator` | `services/mcp-bridge/` → NEXUS-AI (46 agents) | #1 |
| Apps | 7 Next.js منفصلة | **`apps/web/`** بـ 7 routes + `⌘K` palette | #6 |
| Auth | Zitadel SSO | Lucia (server-side) أو Authelia | #3 |
| Secrets | Vault + HSM | Infisical + age keys للـ backups | #2, #3 |
| Queue | Redis Streams | يبقى Redis (YAGNI لـ NATS) | YAGNI |
| Observability | Loki+Prom+Tempo+Grafana | **SigNoz** one-box | #3 |
| Deploy | CI ضخم + manual SSH | **Coolify** webhook + Tailscale Funnel | #3 + استعارة mobeface |
| Edge box | غير محدّد | NUC + Compose + Tailscale + Traefik | استعارة luffy-server |
| 2FA | إجباري شامل | **فقط** عند `report sign` (WebAuthn) | #2 |
| TLS داخلي | mTLS بين الخدمات | يُلغى — TLS فقط على Edge↔Cloud | #2 |
| Apps for admin | Console app كامل | HTML+vanilla page تكفي | #6 |

---

## 3. خريطة الاستعارة (Source → midcine target)

| midcine target | Source project | Source path | Adapt | Risk |
|----------------|----------------|-------------|-------|------|
| `services/mcp-bridge/` | `D:\project\suportagent` | `core/` + `config/agents.py` | M | L |
| `apps/web/` (unified) | `D:\project\thawani-v2` | `src/store-admin-v2` (dashboard pattern) | M | L |
| `services/whatsapp-bridge/` (تحديث) | `D:\project\mostqlworkwatssap` | `whatsapp-cafe-bot/` | S | L |
| `infra/monitoring/` (4 layers) | `D:\project\mostqlworkwatssap` | `monitoring/` (نختار 4 من 8) | S | L |
| `scripts/start-edge.ps1` + watchdog | `D:\project\mobeface` | `start-backend.ps1` | S | L |
| `infra/docker/edge-bundle.yml` | `D:\project\luffy-server` | `docker-compose.yml` + Traefik | S | L |
| `tests/security/pen-test-midcine.js` | `D:\project\mostqlworkwatssap` | `staging/pen-test.js` | S | M (تكييف JWT بدل Firebase) |
| Free-API Cascade لـ ICD-11 lookup | `D:\project\ai` | `AGENTS.md` (Cerebras→Gemini→Mistral→Cohere) | M | L (non-PHI فقط) |
| Medical brain candidate (Q4) | `D:\project\ai` (GZP-LLM) | Qwen2.5-7B + LoRA + DPO | L | M |

**قواعد الاستعارة:** (1) انسخ كاملاً، الأصل لا يُعدَّل. (2) عدّل أسماء المجال (store→hospital, order→study, customer→patient). (3) أضف PHI-safe layer قبل أي حفظ. (4) سجّل كل استعارة في `docs/reference/INDEX.md`.

---

## 4. Sprints (8 بدل 13)

| # | اسم | Deliverables | Go/No-Go |
|---|------|---|---|
| 0 | تنظيف + monorepo unified | git tag قبل الحذف · حذف `apps/{worklist,reader,patient,insights,connect,console,mobile}` · إنشاء `apps/web/` بـ Next.js 15 + 7 routes · توحيد `packages/ui` · كتابة ADR-011 | `apps/web` يبني، 7 routes ترجع Hello |
| 1 | mcp-bridge | حذف `ai-dispatcher` + `ai-aggregator` (git tag) · بناء `services/mcp-bridge/` · `dispatch_rules.yaml` لـ chest XR + brain CT · استدعاء NEXUS-AI عبر MCP | study جديد → 2 specialists بالتوازي → نتيجة موحدة في < 20s |
| 2 | Worklist + Reader routes | استعارة من `thawani-v2/store-admin-v2` لـ `/worklist` · OHIF embedded في `/reader/:id` · AI Insights panel · Report editor + sign | طبيب يفرز 50 حالة + يفتح + يوقّع |
| 3 | Edge box + Tailscale | استعارة `luffy-server` + `mobeface` deploy · compose للـ NUC · Tailscale Funnel · Coolify webhook | NUC افتراضي يعمل، C-STORE من DCMTK ينجح |
| 4 | Monitoring + Audit + Backup | استعارة 4 layers من `mostqlworkwatssap/monitoring` (health + watchdog + backup + audit) · SigNoz one-box · pgBackRest + R2 | تشخيص حادثة وهمية في < 5 دقائق · DR drill < 4h RTO |
| 5 | WhatsApp + Patient + Connect routes | تحديث `whatsapp-bridge` من `mostqlworkwatssap/whatsapp-cafe-bot` · `/patient/:id` timeline · `/connect` QR + share | إرسال packet كامل لطبيب معالج + QR يعمل |
| 6 | Compliance + 2FA-on-sign | WebAuthn على signing فقط · RLS audit موسّع · IR plan 5-step · compliance dossier PDF | EDA reviewer يقبل التصميم |
| 7 | Pilot Prep | تنصيب على مركز تجريبي · تدريب أطباء · KPIs dashboard | ≥ 20 study/يوم لـ 5 أيام + NPS ≥ 50 |

**استبعدنا** من v12: Sprints 0-1 (CI + Storybook + Chromatic) — تُدمج في 0. Sprints 4-5 (Qwen2-VL + RAG) → تُؤجّل لـ post-MVP أو يحلّ NEXUS-AI محلّها. Sprint 8 (cloud-index + consent + tunnel-broker) → يُؤجّل لـ Phase 2 (cross-hospital).

---

## 5. الحدّ الأدنى الأمني (مُتفَّق عليه مع DevSecOps + لا يخالف #2)

غير قابل للتنازل:
1. PHI field-encryption (أسماء + national_id + phone) — AES-256-GCM
2. RLS على كل جداول PHI
3. Audit log immutable (WORM via Postgres trigger)
4. 2FA WebAuthn على `report sign` فقط
5. Backup مشفّر at-rest + off-site (R2 + age keys)
6. Incident Response plan 5-step موثّق
7. TLS على Edge↔Cloud (يكفي)

ما نلغيه (مبدأ #2): HSM، mTLS داخلي، 2FA شامل، Vault، RBAC الشامل، DICOM TLS داخلي، service mesh، DICOM TLS أصلاً.

---

## 6. الخطوة الأولى الفورية (أول 3 ساعات عمل)

> **لا تنفّذ قبل تأكيد عبد الرحمن.**

1. `git tag pre-v3-refactor-2026-06-28`
2. حذف `apps/{worklist,reader,patient,insights,connect,console,mobile}`
3. إنشاء `apps/web/` بـ `pnpm create next-app` + RTL config
4. إضافة 7 routes فارغة: `/worklist /reader/[id] /patient/[id] /insights /connect /console /m`
5. `git tag pre-mcp-bridge-2026-06-28`
6. حذف `services/ai-dispatcher` + `services/ai-aggregator`
7. إنشاء `services/mcp-bridge/` scaffold + استيراد `D:\project\suportagent\config\agents.py` كمرجع
8. كتابة `docs/adr/ADR-011-infra-philosophy.md` (يجمع المبادئ الستّة + الجداول #2 و #3 و #5)

---

## 7. ما تأجّل (post-MVP)

- Cross-hospital P2P (cloud-index + consent + tunnel-broker) → Phase 2
- TotalSegmentator GPU → Phase 2
- AceGPT-13B/Qwen2.5-7B fine-tune → Phase 3 (بعد GPU rental)
- HIS integration → Phase 3
- Mammography → Q2 2027
- Native mobile → لا (PWA فقط)

---

## 8. KPIs

- **تقنية:** ensemble ≥ 4 specialists < 15s P95 · uptime ≥ 99% · DR < 4h RTO
- **طبيب:** clicks لمهمة شائعة ≤ 3 · أول case في الصباح ≤ 30s · ⌘K usage ≥ 40% · NPS ≥ 50
- **عمل:** ≥ 20 study/يوم لـ 5 أيام في pilot · شهادة موقّعة من رئيس القسم · ≥ 2 مراكز إضافية مهتمّة

---

## 9. ربط

- `docs/adr/ADR-008-ai-ensemble-brain.md` — يبقى ساري المفعول، الـ ensemble يصبح NEXUS bridge
- `docs/adr/ADR-009-edge-first-security.md` — يبقى ساري المفعول، يُعزَّز بالمبدأ #2
- `docs/adr/ADR-010-modular-suite.md` — **مُعدَّل**: 7 apps → app واحد بـ 7 routes
- `docs/adr/ADR-011-infra-philosophy.md` — **سيُكتب في Sprint 0**
- `docs/12-BUILD-PLAN.md` — يبقى تاريخياً، v3 يحلّ محلّه عملياً
- `docs/reference/INDEX.md` — يتوسّع مع كل استعارة جديدة

</div>
