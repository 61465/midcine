<div dir="rtl" lang="ar">

# Handoff A — Infrastructure & DevOps Bootstrap

> **يجب البدء أولاً.** كل الحزم الأخرى تعتمد على وجود البنية التحتية.

---

## 1. Goal (الهدف)
إعداد بنية تحتية إنتاجية على Hetzner مع Coolify وCloudflare وGitHub Actions، جاهزة لاستقبال 7 services في monorepo.

## 2. Scope

### داخل النطاق
- خادم Hetzner CCX23 (8 vCPU، 32GB RAM) في eu-central
- Domain `midcine.io` على Cloudflare + شهادات SSL تلقائية
- Coolify self-hosted على نفس الخادم
- مستودع GitHub `midcine/midcine` مع protected `main` branch
- GitHub Actions: build، test، lint، security (SAST/SCA)
- Logs: Loki + Grafana مدمجان عبر Coolify
- Secrets: Doppler حساب فريق + Coolify integration
- Backup سياسة: Hetzner volumes snapshot يومي
- Monitoring uptime: Uptime Kuma على VPS منفصل صغير

### خارج النطاق
- ❌ تشغيل services المشروع (هذه مسؤولية حزم B-G)
- ❌ Kubernetes (Coolify يكفي لـ MVP)
- ❌ Multi-region
- ❌ CDN setup (Cloudflare default يكفي)

## 3. Tech Spec

| المكوّن | الإصدار/الخدمة |
|---------|---------------|
| OS | Ubuntu 24.04 LTS Server |
| Container runtime | Docker 27.x |
| PaaS | Coolify v4 (latest stable) |
| CI/CD | GitHub Actions |
| DNS/CDN/WAF | Cloudflare (Free → Pro لاحقاً) |
| Secrets | Doppler |
| Logs | Loki 3.x + Grafana 11.x |
| Monitoring | Uptime Kuma 1.23+ |
| Infrastructure as Code | Terraform 1.9+ + Hetzner provider |

## 4. APIs / Interfaces

### Outputs (للحزم اللاحقة)
- `coolify.midcine.io` — Coolify UI
- `grafana.midcine.io` — Logs + Metrics
- `status.midcine.io` — Uptime Kuma public status
- GitHub Actions reusable workflows في `.github/workflows/_reusable/`
- Doppler config IDs: `dev`، `staging`، `prod`

### Inputs (من midcine team)
- Hetzner API token
- Cloudflare API token (DNS edit)
- GitHub org access
- Doppler workplace

## 5. Inputs الموفّرة من midcine

```
ENV vars يقدمها عبد الرحمن:
  HETZNER_API_TOKEN
  CLOUDFLARE_API_TOKEN
  GITHUB_PAT (repo:admin)
  DOPPLER_TOKEN
  DOMAIN=midcine.io
```

## 6. Acceptance Criteria

- [ ] `terraform apply` ينجح من الصفر وينشئ الخادم
- [ ] Coolify UI متاح على `https://coolify.midcine.io` مع SSL صحيح
- [ ] GitHub Actions يُشغّل CI pipeline على PR (lint+test+SAST)
- [ ] Grafana يستقبل logs من container تجريبي
- [ ] Uptime Kuma يُرسل تنبيه عند توقف خدمة
- [ ] Doppler يحقن secrets في Coolify deployments
- [ ] دليل run-book في `infra/RUNBOOK.md` (كيف restart، backup، recover)
- [ ] Snapshot يومي يعمل، اختبار restore ناجح

## 7. Definition of Done

- ✅ Terraform code في `infra/terraform/` مع `README.md`
- ✅ Coolify deployments documented خطوة بخطوة
- ✅ GitHub Actions reusable workflows في `.github/workflows/_reusable/`
- ✅ Sample app نشر بنجاح end-to-end كاختبار
- ✅ MFA مفعّل على كل الحسابات (Hetzner, Cloudflare, GitHub, Doppler)
- ✅ تسليم vault مفاتيح SSH لـ midcine في حساب 1Password المشترك

## 8. Timeline
**1 أسبوع** (يمكن إنجازها في 5 أيام عمل مع شخص خبير).

## 9. Risks

| الخطر | تخفيف |
|------|--------|
| Hetzner verification يأخذ أيام للحساب الجديد | ابدأ التحقق قبل الحزمة + استخدم خادم مؤقت |
| Coolify update يكسر الإعداد | pin إصدار محدد، update يدوياً |
| GitHub Actions billing شهري | استخدم self-hosted runner على نفس الخادم لاحقاً |

</div>
