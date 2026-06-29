<div dir="rtl" lang="ar">

# 📚 Reference Library — أصول مستعارة من مشاريع أخرى

> **القاعدة:** كل ملف هنا **نسخة** من مشروع آخر. الأصل يبقى في مكانه ولا يُعدَّل. هذه الملفات للقراءة فقط كمراجع/قوالب.
> **التاريخ:** 2026-06-22
> **السبب:** بعد فحص عميق لـ D:\project (50+ مشروع)، اكتُشفت 13 أصلاً يخدم midcine مباشرة. نُسخت بدل إعادة الكتابة من صفر.

---

## 🗂️ خريطة المراجع

### `docs/reference/` — وثائق ومعمارية

| الملف | المصدر | يخدم في midcine |
|------|---------|----------------|
| [runbook-template-from-thawani.md](runbook-template-from-thawani.md) | `D:\project\thawanisup\RUNBOOK.md` | قالب `docs/RUNBOOK.md` بنمط "الأعراض → التشخيص → الإصلاح" لـ 8 سيناريوهات حادثة. **يُكيَّف لـ DICOM C-STORE، Orthanc، AI worker OOM، Edge box offline** |
| [security-checklist-from-thawani.md](security-checklist-from-thawani.md) | `D:\project\thawanisup\SECURITY.md` | قالب `docs/SECURITY-CHECKLIST.md` لإقلاع production: JWT 128 hex، 2FA، nightly backup cron، secrets خارج workspace |
| [deployment-pattern-from-thawani.md](deployment-pattern-from-thawani.md) | `D:\project\thawanisup\DEPLOYMENT.md` | نمط نشر منصة multi-tenant — يُلهم Stage 3 Beta Multi-tenant |
| [troubleshooting-from-thawani.md](troubleshooting-from-thawani.md) | `D:\project\thawanisup\TROUBLESHOOTING.md` | مكمّل لـ RUNBOOK — أعراض أقل خطورة |
| [gzp-aria-agents-pattern.md](gzp-aria-agents-pattern.md) | `D:\project\ai\AGENTS.md` | **نمط Free-API Cascade** (Cerebras→Gemini→Mistral→Cohere) — يطبّق `feedback_company_uptime` لوكلاء MCP non-PHI |
| [gzp-llm-architecture.md](gzp-llm-architecture.md) | `D:\project\ai\GZP_LLM_ARCHITECTURE.md` | قرار Qwen2.5-7B عربي + Apache 2.0 + 150k Arabic vocab — **مرشّح Q13 لـ medical brain local** |
| [gzp-readme.md](gzp-readme.md) | `D:\project\ai\README.md` | نظرة عامة على GZP/ARIA — يفيد عند دمج النموذج |
| [nexus-agents-full-list.py](nexus-agents-full-list.py) | `D:\project\suportagent\config\agents.py` | قائمة 46 وكيل NEXUS-AI كاملة بـ tier+model+capabilities — **مرجع لـ mcp-bridge dispatch_rules.yaml** |
| [thawani-v2-architecture-pattern.md](thawani-v2-architecture-pattern.md) | `D:\project\thawani-v2\docs\ARCHITECTURE.md` | **النمط البديل** "NEXUS embedded في الـ repo" — يدعم Q12 Hybrid (medical-brain embedded + mcp-bridge cloud) |

### `scripts/reference/` — سكربتات نشر

| الملف | المصدر | يخدم في midcine |
|------|---------|----------------|
| [edge-box-setup-luffy.sh](../../scripts/reference/edge-box-setup-luffy.sh) | `D:\project\luffy-server\setup.sh` | **قالب جاهز لـ NUC Edge box**: apt + Docker + ufw + fail2ban + Traefik + acme. يُكيَّف لـ Orthanc + Edge Pusher + Tailscale |
| [luffy-docker-compose.yml](../../scripts/reference/luffy-docker-compose.yml) | `D:\project\luffy-server\docker-compose.yml` | نمط multi-service compose مع Traefik labels — يُلهم `infra/docker/edge-bundle.yml` |
| [luffy-traefik.yml](../../scripts/reference/luffy-traefik.yml) | `D:\project\luffy-server\traefik\traefik.yml` | إعداد Traefik الأساسي |
| [luffy-traefik-dynamic/](../../scripts/reference/luffy-traefik-dynamic/) | `D:\project\luffy-server\traefik\dynamic\` | middleware Traefik (security headers، rate limit) |
| [luffy-env-template.env](../../scripts/reference/luffy-env-template.env) | `D:\project\luffy-server\.env` | متغيرات بيئة قالب |
| [oracle-bootstrap.sh](../../scripts/reference/oracle-bootstrap.sh) | `D:\project\server\scripts\01_setup_oracle.sh` | نمط Oracle Cloud — يُلهم Cloud infra لـ Stage 3+ |
| [server-deploy.sh](../../scripts/reference/server-deploy.sh) | `D:\project\server\scripts\02_deploy.sh` | نمط deploy بـ git pull + docker compose |
| [ssl-setup.sh](../../scripts/reference/ssl-setup.sh) | `D:\project\server\scripts\03_ssl_setup.sh` | Let's Encrypt setup يدوي (بديل acme تلقائي) |
| [nginx-gamezone.conf](../../scripts/reference/nginx-gamezone.conf) | `D:\project\server\nginx\nginx.conf` | nginx reverse proxy template (بديل Traefik) |

### `tests/security/` — اختبارات أمن

| الملف | المصدر | يخدم في midcine |
|------|---------|----------------|
| [pen-test-bothatim-template.js](../../tests/security/pen-test-bothatim-template.js) | `D:\project\mostqlworkwatssap\staging\pen-test.js` | **12 سيناريو هجوم حقيقي** بـ Node.js: Firebase Auth Bypass، XSS، 10 آخرون. يُكيَّف لـ midcine بـ JWT بدل Firebase، patient_name بدل storeName، إلخ |

### `tests/load/` — اختبارات حمل

| الملف | المصدر | يخدم في midcine |
|------|---------|----------------|
| [from-bothatim/](../../tests/load/from-bothatim/) | `D:\project\mostqlworkwatssap\staging\autocannon-test\` | autocannon load test (package.json + node_modules) — يُكيَّف لاختبار DICOMweb QIDO/WADO تحت ضغط |

---

## 🎯 ترتيب الاستخدام المقترح

عند تنفيذ midcine، تُستخدم هذه المراجع بهذا الترتيب:

| Stage | المرجع المُستخدم |
|------|-----------------|
| Stage 0 Foundation | `nexus-agents-full-list.py` (لبناء mcp-bridge dispatch_rules) + `thawani-v2-architecture-pattern.md` (لقرار Hybrid) |
| Stage 1 Vertical Slice | `gzp-llm-architecture.md` (لاختيار Qwen2.5-7B medical brain) + `gzp-aria-agents-pattern.md` (لـ cascade fallback) |
| Stage 2 Alpha Pilot | `edge-box-setup-luffy.sh` + `luffy-docker-compose.yml` + `luffy-traefik.yml` (لتركيب NUC في مركز الإشعاع التجريبي) |
| Stage 3 Beta | `runbook-template-from-thawani.md` + `troubleshooting-from-thawani.md` + `pen-test-bothatim-template.js` + `tests/load/from-bothatim/` |
| Stage 4 Hospital | `security-checklist-from-thawani.md` (للإقلاع production) + `oracle-bootstrap.sh`/`ssl-setup.sh` (للسحاب) + `deployment-pattern-from-thawani.md` |

---

## ⚠️ قواعد التعامل مع هذه الملفات

1. **لا تعدّل الأصل** — كل تعديل يحدث في `midcine/` خارج `reference/`. هذه الملفات للقراءة فقط.
2. **عند الاستلهام**، اكتب التطبيق الفعلي في الموضع الصحيح:
   - وثيقة قالب → `midcine/docs/<اسم-جديد>.md` (مثلاً `RUNBOOK.md` المحدّث لـ DICOM)
   - سكربت → `midcine/scripts/<اسم-جديد>.sh`
   - اختبار → `midcine/tests/security/<اسم-midcine>.js` (مثلاً `pen-test-midcine.js`)
3. **لا تتجاهل الأصل** — لو حدّثنا (مثلاً) thawanisup security، أعِد النسخ هنا لتزامن المراجع.
4. **لا تُعد توليد ما هو موجود هنا** — هذه الملفات تختصر أسابيع عمل.

---

## 📊 الاستفادة المقدّرة (مقابل البناء من صفر)

| المرجع | كم يوفّر؟ |
|--------|----------|
| RUNBOOK template | ~3 أيام عمل |
| SECURITY checklist | ~1 يوم |
| pen-test (12 سيناريو) | ~5 أيام |
| edge-box-setup.sh | ~2 يوم |
| autocannon load test | ~1 يوم |
| Free-API Cascade pattern | ~2 يوم |
| GZP-LLM architecture decision | ~1 يوم بحث |
| 46 NEXUS agents catalog | ~2 يوم تصنيف |
| Thawani embedded NEXUS pattern | ~1 يوم تصميم |
| Traefik + Docker patterns | ~1 يوم |
| **الإجمالي** | **~19 يوم عمل** |

---

## 🔗 ربط بالذاكرة

- [[project-midcine-pivot]] — Strategic Pivot الذي استدعى هذا الفحص
- [[project-midcine-infra-philosophy]] — الفلسفة الخمسية التي تقرّر أيّ مرجع يُتبنّى
- [[feedback-midcine-full-company]] — اتصال الشركة مستمر على كل قرار من هذه المراجع
- [[feedback-doctor-nurse-model]] — الشركة تقرأ هذه المراجع، عبد الرحمن يقرّر الدمج

</div>
