# 🚀 دليل النشر الكامل — من الصفر إلى البث على رقم العميل

هذا الدليل سيأخذك من الكود في جهازك إلى بوت يعمل على رقم واتساب حقيقي للعميل خلال **30 دقيقة**.

---

## 📋 ما ستحتاجه قبل البدء

| العنصر | المصدر | المسؤول عنه |
|--------|--------|--------------|
| رقم هاتف العميل (واتساب بزنس) | العميل يوفّره | العميل |
| حساب فيسبوك للعميل | العميل يوفّره | العميل |
| Google Sheet للمنتجات | تنشئه أنت + تشاركه مع العميل | أنت |
| حساب Railway | تنشئه أنت | أنت |
| 30 دقيقة من وقت العميل | للتحقق ورفع الرقم | العميل + أنت |

> 💡 **نصيحة:** اطلب من العميل أن يكون متاحاً على مكالمة أو شاشة مشتركة أثناء الخطوة 1 و 2، لأن Meta ترسل OTP على رقم العميل.

---

## 🔵 الخطوة 1 — إعداد Meta Business و WhatsApp

### 1.1 إنشاء حساب Meta Business
1. اذهب إلى **business.facebook.com**
2. سجّل دخول بحساب فيسبوك العميل
3. اضغط **Create Account** → اكتب اسم متجر العميل والإيميل
4. ستصلك رسالة تأكيد — اضغط الرابط

### 1.2 إنشاء تطبيق Developer
1. اذهب إلى **developers.facebook.com/apps**
2. **My Apps** → **Create App**
3. اختر نوع التطبيق: **Business**
4. اسم التطبيق: "WhatsApp Bot — [اسم المتجر]"
5. ربط بحساب Business الذي أنشأته

### 1.3 إضافة منتج WhatsApp
1. داخل التطبيق → **Add Product** → ابحث عن **WhatsApp** → **Set up**
2. ستظهر صفحة **API Setup** — انسخ منها:
   - ✏️ **Temporary Access Token** (صالح 24 ساعة فقط)
   - ✏️ **Phone Number ID** (رقم 15 خانة)
   - ✏️ **WhatsApp Business Account ID**
3. في القسم **Send and receive messages**:
   - اضغط **Add phone number**
   - أدخل رقم واتساب العميل (الذي سيستقبل الطلبات)
   - فعّل بـ OTP يصل على نفس الرقم

### 1.4 الحصول على Permanent Token (هام جداً)
> ⚠️ الـ Temporary Token ينتهي بعد 24 ساعة. للإنتاج يجب Permanent.

1. **business.facebook.com** → **Settings** → **Users** → **System Users**
2. **Add** → اسم: "WhatsApp Bot System User" → Role: **Admin**
3. على المستخدم الجديد → **Add Assets** → **Apps** → اختر تطبيقك → **Full Control**
4. **Generate New Token** → اختر تطبيقك → الصلاحيات:
   - ✅ `whatsapp_business_messaging`
   - ✅ `whatsapp_business_management`
5. **Expiration**: **Never** → **Generate**
6. ✏️ انسخ الـ Token (لن يظهر مرة أخرى!)

---

## 🟢 الخطوة 2 — إعداد Google Sheet للمنتجات

1. افتح **sheets.google.com** → جدول جديد
2. الصف الأول (Headers) بالضبط:
   ```
   id | name | category | price | description | available | image_url
   ```
3. ابدأ تعبئة المنتجات (انظر `docs/products-template.csv` كمثال)
4. **قيم category المسموحة فقط:** `hot` / `cold` / `food`
5. **available:** `true` لإظهار المنتج، `false` لإخفائه
6. **image_url:** رابط صورة (اختياري) — يجب أن يكون عام
7. **النشر كـ CSV:**
   - File → Share → **Publish to web**
   - Range: `Sheet1`
   - Format: **Comma-separated values (.csv)**
   - **Publish** → انسخ الرابط ✏️

> 💡 الجدول يتحدّث تلقائياً كل 5 دقائق (cache) — يمكن لصاحب المتجر تعديل الأسعار من هاتفه مباشرة.

---

## 🟣 الخطوة 3 — النشر على Railway (مجاناً)

### 3.1 رفع الكود على GitHub
```bash
cd whatsapp-cafe-bot
git init
git add .
git commit -m "Initial bot for [اسم المتجر]"
# أنشئ repo على github.com ثم:
git remote add origin https://github.com/YOUR_USERNAME/whatsapp-bot-CLIENT_NAME.git
git push -u origin main
```

### 3.2 النشر على Railway
1. اذهب إلى **railway.app** → **Login with GitHub**
2. **New Project** → **Deploy from GitHub repo** → اختر المستودع
3. Railway يكتشف Node.js تلقائياً ويبدأ البناء
4. اذهب لـ **Variables** → **Raw Editor** → الصق هذا (مع تعبئة قيمك):

```env
WHATSAPP_TOKEN=Bearer_token_من_System_User
WHATSAPP_PHONE_ID=رقم_15_خانة
VERIFY_TOKEN=أي_كلمة_سرية_تخترعها
OWNER_PHONE=رقم_صاحب_المتجر_بالصيغة_الدولية_بدون_+
STORE_NAME=اسم المتجر بالعربية
CURRENCY=ر.س
DELIVERY_FEE=10
WORKING_HOURS_START=8
WORKING_HOURS_END=24
SHEET_CSV_URL=رابط_CSV_من_خطوة_2
LOG_LEVEL=info
```

5. **Settings** → **Networking** → **Generate Domain**
6. ستحصل على رابط مثل: `whatsapp-bot-xyz.up.railway.app`
7. اختبر: افتح `https://whatsapp-bot-xyz.up.railway.app/health` يجب أن ترى:
   ```json
   { "ok": true, "store": "اسم المتجر", "time": "..." }
   ```

---

## 🟡 الخطوة 4 — ربط Webhook مع Meta

1. **developers.facebook.com** → تطبيقك → **WhatsApp** → **Configuration**
2. **Webhook** → **Edit**:
   - **Callback URL**: `https://whatsapp-bot-xyz.up.railway.app/webhook`
   - **Verify token**: نفس `VERIFY_TOKEN` من خطوة 3.2
3. **Verify and save** — يجب أن ترى ✅ أخضر
4. **Webhook fields** → اضغط **Manage** → فعّل:
   - ✅ `messages`
5. **Save**

---

## 🧪 الخطوة 5 — الاختبار الحقيقي

1. أرسل رسالة من رقمك (أي رقم) إلى رقم واتساب العميل المرتبط
   > ⚠️ في وضع Test، Meta تسمح فقط لـ 5 أرقام مُسجّلة. أضف رقمك في **API Setup → To**
2. يجب أن يرد البوت برسالة الترحيب فوراً
3. جرّب الـ flow كاملاً: قائمة → منتج → كمية → سلة → فاتورة → تأكيد
4. تحقق من وصول إشعار الطلب الجديد على رقم `OWNER_PHONE`
5. افتح `https://your-domain/orders?token=OWNER_PHONE` لرؤية سجل الطلبات

---

## 🚦 الانتقال من Test إلى Production

عندما تريد البوت يعمل لأي عميل بدون قيود الـ 5 أرقام:

1. **developers.facebook.com** → تطبيقك → **App Review** → **Permissions and Features**
2. اطلب: `whatsapp_business_messaging` → **Request**
3. ارفع تحقق Business (سجل تجاري للعميل)
4. بعد الموافقة (24-72 ساعة عادة) — البوت يخدم أي رقم

---

## 🔧 حل المشاكل الشائعة

| المشكلة | السبب | الحل |
|---------|-------|------|
| Webhook verification فشل | `VERIFY_TOKEN` مختلف بين Meta و Railway | تطابقها حرفياً |
| البوت لا يرد | Phone ID خطأ أو Token منتهي | تحقق من API Setup |
| "رسالة لم تُرسَل" في log | الرقم غير مُسجّل في وضع Test | أضفه في To list |
| لا تظهر منتجات | رابط CSV غير منشور | أعد النشر من Publish to web |
| الصور لا تظهر | الرابط محمي/مؤقت | استخدم Imgur أو Cloudinary |

---

## 📞 الدعم بعد التسليم

اطلب من العميل توثيق هذه المعلومات لديه ليرجع لها لاحقاً:
- ✏️ Phone Number ID
- ✏️ App ID
- ✏️ Business Manager URL
- ✏️ Railway dashboard link
- ✏️ Google Sheet link

> 💡 احتفظ بنسخة من `.env` في مكان آمن (1Password / Bitwarden).
