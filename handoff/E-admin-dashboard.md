<div dir="rtl" lang="ar">

# Handoff E — Admin Dashboard (Next.js)

> **المهمة:** لوحة إدارية للمراكز/المستشفيات: Worklist + RIS + Patients + Billing.

---

## 1. Goal
بناء تطبيق Next.js 15 RTL أصلي يدير العمليات التشغيلية للمركز خارج Viewer (الـ Viewer منفصل، Handoff D).

## 2. Scope

### داخل النطاق
- **Worklist:** قائمة الفحوصات اليومية، فلاتر، تخصيص للطبيب، AI priority badges
- **RIS:** جدولة مواعيد، بيانات مريض، رفع طلب فحص يدوي
- **Patients:** بحث، تاريخ، سجل فحوصات
- **Reports management:** قائمة المنتظر، توقيع، أرشيف
- **Billing لايت:** فواتير شهرية للمركز، استهلاك، plan info
- **Admin:** إدارة users، RBAC، تعيين صلاحيات
- **Analytics:** dashboard بـ Recharts للـ KPIs الأساسية (فحوصات/يوم، avg time، AI hit rate)
- **Settings:** branding override للمركز، لغة، تنسيقات

### خارج النطاق
- ❌ Viewer (Handoff D)
- ❌ HIS integration UI (لاحقاً)
- ❌ Multi-branch dashboard (Chain feature — لاحقاً)
- ❌ Mobile app

## 3. Tech Spec

```yaml
Next.js: 15.x (App Router)
React: 19.x
TypeScript: 5.6+
Tailwind CSS: 4.x
shadcn/ui: latest
TanStack Query: 5.x
TanStack Table: 8.x
React Hook Form + Zod: latest
date-fns: 4.x (with Arabic locale)
i18next: 24+
Recharts: 2.x
Authentik client: OIDC
```

## 4. APIs / Interfaces

استهلاك Cloud Ingestion API (Handoff C):
```
GET    /api/v1/worklist
POST   /api/v1/studies/{uid}/assign
GET    /api/v1/patients?search=
POST   /api/v1/patients
GET    /api/v1/reports?status=pending
POST   /api/v1/reports/{id}/sign
GET    /api/v1/billing/current
GET    /api/v1/analytics/dashboard
GET    /api/v1/users
POST   /api/v1/users
PATCH  /api/v1/users/{id}/role
```

## 5. Inputs Provided

```
NEXT_PUBLIC_API_URL=https://api.midcine.io
NEXT_PUBLIC_VIEWER_URL=https://viewer.midcine.io
NEXT_PUBLIC_OIDC_ISSUER=https://auth.midcine.io
NEXT_PUBLIC_OIDC_CLIENT_ID=admin-dashboard
NEXT_PUBLIC_TENANT_ID=...
NEXT_PUBLIC_BRAND_PRIMARY=#0F62FE
```

### Design System
- Tokens من `06-BRAND.md` كـ CSS variables
- Figma file مع 12 screen mockups (يقدّمه midcine UI/UX designer قبل البدء)
- Icons: Phosphor + Health Icons

## 6. Acceptance Criteria

- [ ] Worklist يعرض 500 فحص بدون UI lag (virtualization)
- [ ] AI priority badge يتحدّث real-time عبر WebSocket
- [ ] RBAC: doctor لا يرى billing، owner يرى كل شيء
- [ ] RTL كامل + LTR toggle يعمل
- [ ] Forms validation شاملة + رسائل عربية واضحة
- [ ] Pagination + filtering لكل list view
- [ ] Lighthouse score ≥90 (Performance، Accessibility، Best Practices)
- [ ] Empty states + Loading states + Error states لكل view

## 7. Definition of Done

- ✅ كود في `apps/web/`
- ✅ Storybook لـ components مشتركة
- ✅ Playwright E2E لـ 5 user flows رئيسية
- ✅ Unit tests للـ utility functions (≥70% coverage)
- ✅ Bundle size ≤300KB initial (gzipped)
- ✅ Hosted على Coolify على `https://app.midcine.io`
- ✅ Internationalization tested بـ pseudo-locale + Arabic

## 8. Timeline
**2 أسابيع (مع تصميم Figma جاهز).**

| Sprint | Output |
|--------|--------|
| W1 | Auth + Worklist + Patients + Reports list |
| W2 | Billing + Admin + Analytics + Settings + polish |

## 9. Risks

| الخطر | تخفيف |
|------|--------|
| Figma غير جاهز في الوقت | start with Tailwind + shadcn defaults، التحسين يأتي لاحقاً |
| OIDC flow معقّد | استخدام `next-auth` v5 مع Authentik adapter |
| Bundle size يكبر سريعاً | tree-shaking صارم + Next dynamic imports |

</div>
