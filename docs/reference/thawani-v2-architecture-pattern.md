# 🏛️ Thawani v3 — Architecture

> النسخة v3 = منصة متجر إلكتروني كامل + بوت واتس + NEXUS AI مدمج

---

## 🎯 المبادئ الجوهرية

1. **كل شيء يعيش في نفس الـ repo** — لا microservices، لا API خارجي للأدوات الذكية
2. **NEXUS = فريق داخلي** — وكلاء يقرأون الكود، يحللون البيانات، يقترحون التحسينات
3. **متعدد الواجهات، Core واحد** — Storefront/Admin/Master/Bot كلها تستخدم نفس orders.js
4. **آمان أولاً** — كل تغيير له snapshot، rollback تلقائي، اختبار قبل النشر

---

## 🧱 الطبقات الستة

### 1) Core Engine — منطق تجاري نقي
ملفات نقية بدون HTTP/UI — يستدعيها أي router.

```
src/core/
├── orders.js           ← إنشاء/قراءة/تحديث طلبات
├── products.js         ← إدارة منتجات + بحث
├── customers.js        ← سجل عملاء + VIP
├── carts.js            ← سلات الشراء (جديد)
├── payments.js         ← روابط دفع + تتبع (جديد)
├── coupons.js          ← خصومات + تحقق
└── analytics.js        ← KPIs محسوبة
```

**القاعدة**: كل ملف يأخذ inputs، يرجع outputs، يقرأ/يكتب data/. لا يعرف شيئاً عن HTTP أو UI.

### 2) Routers — واجهات HTTP
```
src/routers/
├── store-router.js       ← /store/* (admin التاجر)
├── master-router.js      ← /master/* (admin المنصة)
├── storefront-router.js  ← /storefront/* (متجر علني — جديد)
└── webhook-router.js     ← /webhook/* (دفع + سلة + غيرها)
```

### 3) WhatsApp Layer — البوت
موجود ومستقر:
```
src/whatsapp-manager.js   ← Baileys multi-session
src/ban-protection.js     ← حماية الحظر
src/conversation/*        ← خطوات الفلو (handlers/state)
```

### 4) NEXUS — العقل الذكي
```
src/nexus/
├── orchestrator.js       ← Maestro، يوزع المهام
├── agents/               ← 7 وكلاء (كل واحد ملف)
├── llm-router.js         ← اختيار النموذج
├── file-reader.js        ← قراءة ملفات المشروع
├── memory.js             ← ذاكرة مشتركة (RAM + disk)
└── context-builder.js    ← يبني context كامل عن المشروع
```

### 5) Storefront — متجر علني
```
public/storefront/
├── store.html            ← /store/<slug>
├── product.html          ← /store/<slug>/product/<id>
├── checkout.html         ← /store/<slug>/checkout
├── track.html            ← /track/<orderId>
└── storefront.css
```

### 6) Admin/Master Panels
موجود (`store-admin.html` + `master.html`) — يتطوّر لـ v2 UI لاحقاً.

---

## 🧠 NEXUS Embedded — التفاصيل

### الفلسفة
> **NEXUS ليس API. إنه فريق Node.js modules يعيش داخل المشروع، يقرأ كل ملف، يفهم كل سطر.**

### الوكلاء السبعة

| الوكيل | المهمة | يقرأ من | يكتب في |
|--------|--------|---------|---------|
| 🎯 **Orchestrator** | يوزّع المهام على الوكلاء | كل شيء | logs/nexus.jsonl |
| 🐛 **Debugger** | يحلل أخطاء logs + يقترح إصلاحات | data/alerts/*, error logs, src/* | reports/debug-*.md |
| 👁️ **Code Reviewer** | يراجع تغييرات قبل النشر | git diff, src/* | reports/review-*.md |
| ✍️ **Content Writer** | يكتب رسائل بوت + إعلانات + أوصاف | stores.json, products | data/templates/* |
| 📊 **Data Analyst** | يحلل أداء المتاجر + يقترح تحسينات | orders/*, customers/* | reports/insights-*.md |
| 🛡️ **Security Watcher** | يراقب أنماط حظر + تنبيهات | ban-protection.json, audit-log | alerts/security-*.json |
| 🎨 **SEO Writer** | يكتب أوصاف منتجات + meta tags | products | تحديث products في stores.json |

### كيف يقرأ NEXUS الملفات؟

`src/nexus/file-reader.js` يوفّر API:

```javascript
const reader = require('./nexus/file-reader');

// قراءة ملف
const code = await reader.readFile('src/orders.js');

// قراءة مع كاش
const stores = await reader.readJSON('data/stores.json');

// قراءة آخر N سطور من log
const errors = await reader.tailLog('data/alerts/errors.log', 100);

// قراءة diff
const diff = await reader.gitDiff('HEAD~1');

// قراءة كل ملفات مجلد
const sources = await reader.readDir('src/core/', { ext: '.js' });
```

### Context Building
عند تشغيل وكيل، نبني context كامل:

```javascript
// nexus/context-builder.js
async function buildContext(agentName, task) {
  return {
    project: {
      name: "Thawani",
      version: "v3",
      structure: await reader.tree('src/', 2),
    },
    stores: await reader.readJSON('data/stores.json'),
    recentOrders: await reader.tailJsonl('data/orders_*.jsonl', 50),
    relevantFiles: await pickRelevantFiles(agentName, task),
    memory: await memory.recall(agentName, task.id),
  };
}
```

### Multi-Provider LLM Router

```
src/nexus/llm-router.js
```

يدعم:
- 🚀 **Groq** (Llama 3.3 70B + 4 Scout/Maverick Vision) — الافتراضي السريع
- 🧠 **Anthropic Claude** (Sonnet/Opus) — للمراجعات الدقيقة والقرارات المعقدة
- 🌐 **Google Gemini** (2.0 Flash) — للـ vision وكبر النصوص

التوجيه الذكي:
| نوع المهمة | الـ provider الافتراضي |
|-----------|------------------------|
| كتابة رسالة بوت | Groq (سريع، رخيص) |
| مراجعة كود | Claude (دقيق) |
| تحليل صور المنتجات | Gemini أو Groq Vision |
| تحليل بيانات كبير | Gemini (context طويل) |

كل وكيل يستطيع override الـ provider في الـ config.

---

## 🛒 Storefront — المتجر العلني

### URL Patterns
```
/store/<slug>                  ← الصفحة الرئيسية
/store/<slug>/product/<id>     ← صفحة منتج
/store/<slug>/checkout         ← Checkout
/store/<slug>/cart             ← السلة (modal أو صفحة)
/track/<orderId>               ← تتبع طلب (بدون login)
```

### مكونات الصفحة

**Hero Section**:
- Logo + اسم المتجر
- Tagline
- أزرار: 💬 واتس + 📞 اتصال + 📍 الموقع

**Categories Bar** (sticky scroll):
- بطاقات أصناف بالأيقونات
- click → scroll للقسم

**Products Grid**:
- Card لكل منتج
- صورة + اسم + سعر + زر "أضف للسلة"
- click → modal تفاصيل

**Floating Cart**:
- bottom-right floating button
- يعرض عدد المنتجات + الإجمالي
- click → يفتح Cart Drawer

**Cart Drawer**:
- side panel من اليسار
- قائمة المنتجات + تعديل الكمية
- زر "أكمل الشراء"

**Checkout**:
- form بسيط (اسم + جوال + عنوان + ملاحظات)
- اختيار طريقة الدفع (COD / دفع إلكتروني)
- زر "تأكيد الطلب"

**Confirmation**:
- ✓ تم استلام طلبك
- رقم الطلب
- "ستصلك رسالة واتس بالتفاصيل"
- رابط تتبع الطلب

---

## 🔄 سيناريو كامل (E2E)

```
1. عميل يفتح: thawani.tail19ddab.ts.net/store/my-shop
   ├─ Storefront router يقرأ stores.json → يبني الصفحة
   └─ NEXUS Data Analyst يسجل الزيارة → analytics

2. عميل يضيف 3 منتجات للسلة
   └─ POST /api/storefront/my-shop/cart
       └─ core/carts.js يحفظ في data/carts/my-shop/<cartId>.json

3. عميل يخرج بدون شراء (Abandoned Cart!)
   ├─ بعد 30 دقيقة، NEXUS Data Analyst يكتشف
   ├─ يستدعي Content Writer لكتابة رسالة استرداد
   ├─ يستدعي WhatsApp Manager لإرسالها للعميل
   └─ كل ذلك بدون أي API خارجي

4. عميل يعود → يكمل الطلب
   ├─ POST /api/storefront/my-shop/checkout
   ├─ core/orders.js يحفظ في orders_my-shop.jsonl
   ├─ WhatsApp Manager يرسل للمالك + العميل
   └─ Owner Report (Track 1) يصل المالك بالتفاصيل

5. المالك يضغط "قبول" من admin أو يكتب "قبول" في الواتس
   └─ نفس flow الموجود الآن

6. بعد التسليم:
   ├─ NEXUS Data Analyst يحلل: العميل اشترى X → اقترح Y
   ├─ Content Writer يكتب رسالة "اشتروا أيضاً"
   └─ تُرسل تلقائياً بعد 24 ساعة
```

---

## 🛡️ السلامة + الصيانة

### Snapshots
- قبل أي تغيير كبير: `tar czf STABLE-<date>.tar.gz`
- محفوظة في `infra/backups/`

### Code Reviewer Gate
- كل feature جديدة → NEXUS Code Reviewer يفحص قبل deploy
- لو وجد bug → blocking
- لو OK → green light للنشر

### Health Monitoring
- موجود: `health-monitor.js` + `subscription-enforcer.js` + `inactivity-watcher.js`
- جديد: `nexus-watcher.js` — يراقب أداء الوكلاء (latency + errors)

### Rollback
- pipeline موجود: `infra/scripts/rollback.ps1`
- يستعيد آخر backup في < 30 ثانية

---

## 📅 خارطة الطريق (10 أسابيع)

| Phase | الوصف | المدة |
|-------|------|------|
| **0** | Architecture + NEXUS skeleton | 3 أيام ✅ (الآن) |
| **1** | Storefront UI كامل | 5 أيام |
| **2** | Cart + Checkout + ربط orders | 7 أيام |
| **3A** | COD + رسائل واتس | 3 أيام |
| **3B** | Moyasar/Tap integration | 7 أيام |
| **4** | كوبونات + شحن + تتبع | 14 يوم |
| **5** | NEXUS agents كاملين (7) | 21 يوم |
| **6** | دومينات خاصة + إطلاق | 7 أيام |

**المجموع**: ~70 يوم (10 أسابيع) للنسخة الجاهزة للتسويق الجاد.

---

## 🚦 الحالة الحالية

- ✅ Snapshot الإنتاج: `STABLE-20260620-230410.tar.gz`
- ✅ Owner Report (قبول → تقرير واتس للمالك)
- ✅ Ban Protection module
- ✅ UI v2 shell (store-admin-v2.html)
- 🚧 **Phase 0** الآن: NEXUS skeleton + Architecture (هذه الوثيقة)
