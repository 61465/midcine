<div dir="rtl" lang="ar">

# ADR-010: Modular Suite Architecture (apps منفصلة لا monolith dashboard)

- **الحالة:** مقبول
- **التاريخ:** 2026-06-18
- **القرار:** عبد الرحمن
- **يُلغي:** بنية `apps/web` كـ single-app كبير

## السياق

الأنظمة المنافسة (GE Centricity، Carestream Vue) = dashboard واحد بـ 200 menu item = cognitive overload. الطبيب يقضي 30% من وقته يبحث عن الزر الصحيح.

الفلسفة المقترحة: **midcine Suite — 7 apps مركّزة، كل app يفعل شيئاً واحداً ممتازاً، التبديل بزر.**

استلهام: Google Workspace (Gmail/Drive/Docs منفصلة، 9-dot switcher)، Notion (apps within app)، Linear (focused workflows).

## القرار

نبني **midcine Suite** = 7 apps في monorepo واحد، مشاركون design system + SSO + event bus.

## الـ Apps

### 1. midcine Worklist (`worklist.midcine.io` أو `/worklist`)
- **الجمهور:** طبيب الأشعة
- **يفعل:** فرز الحالات حسب الأولوية، البحث، الفلترة، assignment
- **لا يفعل:** قراءة الصور، كتابة تقارير، إدارة مرضى
- **Hot path:** قائمة + filters + بحث سريع + zero clicks للحالات الحرجة

### 2. midcine Reader (`reader.midcine.io/{study}`)
- **الجمهور:** طبيب الأشعة
- **يفعل:** OHIF viewer + AI insights panel + تقرير editor + signing
- **لا يفعل:** التنقل بين حالات (يعود للـ Worklist)
- **Hot path:** فتح حالة → قراءة → تعديل تقرير → توقيع → التالي

### 3. midcine Patient (`patient.midcine.io/{id}`)
- **الجمهور:** طبيب معالج، طبيب أشعة (read-only)، المريض (view-limited)
- **يفعل:** timeline + history + attachments + previous studies + consent management
- **لا يفعل:** فرز worklist، AI inference
- **Hot path:** timeline visual + بحث في الـ history

### 4. midcine AI Insights (`insights.midcine.io`)
- **الجمهور:** طبيب أشعة + admin (للـ analytics)
- **يفعل:** شرح الـ ensemble outputs، uncertainty، citations، model comparison
- **لا يفعل:** عرض الصور (يربط للـ Reader)
- **Hot path:** drill-down في تشخيص AI specific

### 5. midcine Connect (`connect.midcine.io`)
- **الجمهور:** فني، منسّق المركز، طبيب
- **يفعل:** WhatsApp dispatch، QR generation للأطباء الخارجيين، sharing، cross-hospital lookup
- **لا يفعل:** قراءة أو كتابة تقارير
- **Hot path:** "أرسل التقرير لـ د.س" بـ كليكين

### 6. midcine Console (`console.midcine.io`)
- **الجمهور:** مدير المركز، admin
- **يفعل:** users، billing، tenant settings، dashboards (volume, AI accuracy, turnaround)
- **لا يفعل:** أي workflow طبي
- **Hot path:** إحصائيات الشهر + إدارة المستخدمين

### 7. midcine Mobile (`m.midcine.io`)
- **الجمهور:** طبيب في الطريق
- **يفعل:** تنبيهات الحالات الحرجة فقط + قراءة سريعة + signing
- **لا يفعل:** workflows كاملة (يحوّل لـ desktop عند الحاجة)
- **Hot path:** push notification → فتح حالة P1 → موافقة سريعة

## App Switcher (المفتاح)

### الطرق:
1. **Keyboard:** `⌘ K` / `Ctrl K` → command palette عام يعمل في كل app
2. **Visual:** زر "9 نقاط" أعلى اليمين → grid من الـ apps مع badges للتنبيهات
3. **Deep linking:** كل صفحة لها URL يمكن bookmarking + sharing

### Command Palette (`⌘ K`)
- بحث universal: مرضى، حالات، أطباء، settings
- اختصارات: "go to worklist"، "open patient أحمد"، "settings billing"
- نتائج contextual: لو في Reader، يقترح "next case"

## المعمارية التقنية

### Monorepo Structure
```
apps/
  ├── worklist/          # Next.js 15 app
  ├── reader/            # Next.js 15 app (يحوي OHIF)
  ├── patient/           # Next.js 15 app
  ├── insights/          # Next.js 15 app
  ├── connect/           # Next.js 15 app
  ├── console/           # Next.js 15 app
  └── mobile/            # Next.js 15 app (PWA + responsive)

packages/
  ├── ui/                # shadcn + Tailwind + design tokens
  ├── auth/              # SSO client (Zitadel SDK)
  ├── api-client/        # FastAPI clients مولّدة من OpenAPI
  ├── event-bus/         # BroadcastChannel + Redis pub/sub
  ├── shared-types/      # Zod + Pydantic types (الموجود)
  └── command-palette/   # ⌘K component مشترك
```

**ليس 7 مشاريع منفصلة** — monorepo واحد بـ Turborepo/pnpm workspaces. build cache مشترك، deploy موحّد.

### Routing
- في production: subdomain لكل app (`worklist.midcine.io`، `reader.midcine.io`، ...)
- في dev: path-based (`/worklist`، `/reader`، ...) لتسهيل
- Cloudflare يوجّه كل subdomain للـ app المناسب

### SSO Session Sharing
- Zitadel يصدر access_token + refresh_token موحّد
- Cookie مشترك على `.midcine.io` domain
- كل app يتحقّق محلياً من JWT، يجدّد عند انتهاء

### Event Bus (Cross-App Sync)
- **داخل نفس tab:** لا يوجد (apps منفصلة في tabs مختلفة)
- **بين tabs نفس المتصفح:** `BroadcastChannel API` (native، بدون lib)
- **بين أجهزة مختلفة:** Redis pub/sub via WebSocket
- مثال: طبيب وقّع تقرير في Reader → Worklist يحدّث الحالة فوراً

### Shared Components Strategy
- design system في `packages/ui` — كل تغيير ينعكس على الجميع بعد بناء
- icons، colors، typography، spacing → tokens في JSON
- shadcn components مخصّصة + RTL-aware

### Deployment
- Coolify project واحد بـ 7 services
- كل app له Dockerfile صغير (Next.js standalone)
- build cache في Turborepo → فقط الـ apps المتغيّرة تُبنى
- Atomic deploys (إما الكل ينجح أو rollback)

## النتائج المتوقعة

### إيجابي
- **Cognitive load أقل:** الطبيب يفتح ما يحتاج فقط
- **Performance:** كل app صغير، first-load أسرع (lazy not entire monolith)
- **Role-based UX طبيعي:** الفني لا يرى worklist، المدير لا يرى reader
- **Bookmark + share friendly:** كل URL = حالة محدّدة
- **Mobile-first per use case:** Mobile app له UX مختلف جذرياً، ليس responsive-only
- **تطوير متوازي:** يمكن تسليم Patient app لـ OpenCode بينما عبد الرحمن يبني Reader

### سلبي
- **Cross-app workflow latency:** التبديل بين apps فيه navigation cost
  - **حلّ:** keyboard shortcuts سريعة + state preserved per app
- **Onboarding longer:** المستخدم الجديد يحتاج 5 دقائق ليفهم النظام
  - **حلّ:** product tour في كل app + tooltip للـ switcher
- **Design consistency خطر:** apps متعدّدة → drift في UX
  - **حلّ:** design system صارم في `packages/ui` + Chromatic visual regression
- **Auth complexity:** SSO + cross-domain cookies + refresh
  - **حلّ:** Zitadel SDK يحلّ معظم هذا

## البدائل المرفوضة

- **Single Next.js app بـ feature folders:** الـ monolith الحالي. يقود لنفس مشكلة GE.
- **Micro-frontends بـ Module Federation:** overkill، runtime complexity.
- **Tauri/Electron desktop:** يلغي ميزة "no installation".
- **iframe-based apps:** UX سيء، auth/state معقّد.

## التنفيذ — Sprint Mapping

| Sprint | App | الحالة |
|--------|-----|--------|
| **Sprint 2** | إعداد monorepo Turborepo + design system + Zitadel SSO | Foundation |
| **Sprint 3** | Worklist app (الأهم للأطباء) | MVP |
| **Sprint 5** | Reader app (OHIF + report editor + AI panel) | MVP |
| **Sprint 7** | Patient app + Connect app | MVP |
| **Sprint 9** | Console app (admin) | MVP |
| **Sprint 11** | Insights app + Mobile app (PWA) | للـ pilot |
| **Sprint 12** | Polish + Command Palette + onboarding tours | Pre-pilot |

## مؤشرات النجاح

بعد الـ pilot:
- متوسط clicks للوصول لمهمة شائعة: ≤ 3 (vs GE ~7-10)
- وقت أول case في صباح الطبيب: ≤ 30 ثانية (login + worklist + open case)
- معدل استخدام command palette: ≥ 40% من الأطباء بعد أسبوعين
- NPS لـ "سهولة الاستخدام": ≥ 50

</div>
