<div dir="rtl" lang="ar">

# Handoff Packages — حزم تسليم midcine

> **الغرض:** كل ملف هنا حزمة عمل مستقلة قابلة للتسليم لمساعد آخر (OpenCode، Kiro، Cursor، أو مطور Freelance).
> كل حزمة مكتوبة كـ "بريف" قائم بذاته — يجب أن يستطيع شخص لا يعرف المشروع تنفيذها من الـ brief فقط.

---

## نظرة عامة على الحزم السبع

| # | الحزمة | الوقت | المُسلّم له | المسار الحرج |
|---|--------|-------|------------|---------------|
| **A** | [Infra Bootstrap](A-infra-bootstrap.md) | أسبوع | DevOps freelance | ⚡ يجب البدء أولاً |
| **B** | [Edge Gateway](B-edge-gateway.md) | 2 أسبوع | OpenCode/Backend dev | يبدأ بعد A |
| **C** | [Cloud Ingestion API](C-cloud-ingestion.md) | 3 أسابيع | Backend dev (الأكبر) | يبدأ بعد A |
| **D** | [OHIF Arabic RTL](D-ohif-arabic.md) | 3 أسابيع | Frontend specialist | يبدأ بعد A، مستقل عن B/C |
| **E** | [Admin Dashboard](E-admin-dashboard.md) | 2 أسبوع | Next.js dev | يبدأ بعد C جاهز |
| **F** | [AI Worker (MONAI)](F-ai-worker.md) | 2 أسبوع | ML Engineer | يبدأ بعد C جاهز |
| **G** | [Clinical LLM](G-clinical-llm.md) | 3 أسابيع | ML Engineer (متقدم) | يبدأ بعد C + F جاهزان |

## المخطط الزمني

```
الأسبوع:  1   2   3   4   5   6   7   8   9   10  11  12  13
          ──────────────────────────────────────────────────────
A: Infra  ███
B: Edge       ███████
C: Cloud      ████████████
D: OHIF       ████████████
E: Admin                ███████
F: AI                       ███████
G: LLM                            ████████████
```

## القواعد المشتركة لكل حزمة

### Repo Structure
كل حزمة تعيش في مجلدها الخاص داخل `apps/` أو `services/` في monorepo midcine.

### Conventions
- **Python:** 3.12+، `uv` لإدارة venv، `ruff` للـ format/lint، `pytest` للاختبار
- **TypeScript:** Node 22+، `pnpm` workspaces، `eslint flat` + `prettier`، `vitest` للاختبار
- **Docker:** كل service له `Dockerfile` + `docker-compose.dev.yml` (للتطوير المحلي)
- **Git:** Conventional Commits + Squash merge
- **CI:** GitHub Actions، يجب أن ينجح قبل merge

### المخرجات الإلزامية لكل حزمة
- ✅ كود في PR واحد على الأقل
- ✅ README.md داخل المجلد يشرح الـ run/deploy
- ✅ tests بنسبة coverage ≥70%
- ✅ Postman/Bruno collection للـ APIs (إن وجدت)
- ✅ docs/architecture.md داخل المجلد (يكفي 1 صفحة)
- ✅ CI/CD pipeline يعمل

### قواعد الجودة
- ❌ لا hardcoded secrets — كلها في `.env.example`
- ❌ لا commented-out code في الـ PR
- ✅ Type hints إلزامية (Python) / strict TypeScript
- ✅ Logging structured (JSON) في كل service

### Reporting (أسبوعياً)
كل مُسلّم يُقدّم تقريراً أسبوعياً ≤200 كلمة:
1. ما أُنجز
2. ما لم يُنجز ولماذا
3. blockers
4. ما الذي يحتاج قراراً من midcine

---

## الـ Critical Path للـ MVP

```
A (Infra)  →  C (Ingestion API)  →  F (AI Worker)  →  G (LLM)
   │              │                                       │
   ▼              ▼                                       ▼
B (Edge)      D (OHIF RTL)    E (Admin)    [Integration Sprint]
```

> **القرار:** A أولاً (أسبوع)، ثم B+C+D بالتوازي، ثم E+F، أخيراً G.

</div>
