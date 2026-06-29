# 🔧 حل المشاكل الشائعة

---

## 🌐 مشاكل الـ Webhook

### "Webhook verification failed" في Meta
**الأسباب الشائعة:**
- `VERIFY_TOKEN` في `.env` لا يطابق ما أدخلته في Meta
- الـ URL لا ينتهي بـ `/webhook`
- HTTPS غير مُفعّل (Meta يرفض HTTP)

**الحل:**
1. تحقق من `VERIFY_TOKEN` متطابق حرفياً
2. تأكد أن الـ URL: `https://your-domain.com/webhook`
3. اختبر: افتح `https://your-domain.com/health` يجب أن ترى JSON

---

### الـ Webhook مُتحقَّق لكن البوت لا يرد
**الأسباب:**
- لم تشترك في حقل `messages`
- `WHATSAPP_TOKEN` منتهي (Temporary tokens 24 ساعة فقط)
- Phone ID خاطئ

**الحل:**
1. Meta → WhatsApp → Configuration → Webhook fields → فعّل `messages`
2. اختبر Token: 
   ```bash
   curl -i -X POST "https://graph.facebook.com/v19.0/PHONE_ID/messages" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"messaging_product":"whatsapp","to":"YOUR_NUMBER","type":"text","text":{"body":"test"}}'
   ```
   إذا أخطأ → استخرج Permanent Token من System User

---

## 📱 مشاكل الرسائل

### البوت يرد لكن لا يصل لرقم محدد
**السبب:** في وضع Test، Meta تسمح فقط لـ 5 أرقام مُسجّلة.

**الحل:**
- Meta → WhatsApp → API Setup → **To** → Add Phone Number
- أو تقدّم لـ App Review للخروج من وضع Test

---

### الأزرار لا تظهر، فقط نص
**السبب:** WhatsApp Business app على الهاتف لا يعرض أزرار تفاعلية. يجب استخدام واتساب عادي.

---

### "Out of working hours" دائماً
**السبب:** فرق توقيت السيرفر.

**الحل:**
- Railway يستخدم UTC افتراضياً
- أضف `TZ=Asia/Riyadh` في Variables
- أو وسّع نطاق `WORKING_HOURS_START=0`, `WORKING_HOURS_END=24`

---

## 📊 مشاكل Google Sheets

### "SHEET_CSV_URL not configured" في الـ logs
**السبب:** الرابط في `.env` فيه `SHEET_ID` الافتراضي ولم تستبدله.

**الحل:** استبدل الرابط بـ CSV link الحقيقي من **Publish to web**.

---

### المنتجات لا تظهر رغم وجود الرابط
**التشخيص:**
```bash
curl "YOUR_SHEET_CSV_URL" | head -5
```
يجب أن ترى CSV بأعمدة `id,name,category,...`

**الأسباب:**
- الشيت غير منشور (Publish to web)
- نشرت Sheet خاطئة (`gid` خاطئ)
- الأعمدة بأسماء عربية → غيّرها لإنجليزي
- `category` فيه قيم غير `hot`/`cold`/`food`

---

### تعديلات الشيت لا تظهر فوراً
**السبب:** Cache مدته 5 دقائق.

**الحل:**
- انتظر 5 دقائق
- أو أعد deploy على Railway (يمسح cache)

---

## 🚂 مشاكل Railway

### Build فشل
**التشخيص:** افتح Logs في Railway dashboard.

**الأسباب الشائعة:**
- Node version قديم → أضف `engines.node >= 18` في `package.json` (موجود)
- `package-lock.json` مفقود → ارفعه

---

### السيرفر يعمل لكن `/webhook` يعطي 502
**السبب:** Railway لا يعرف على أي port يصغي السيرفر.

**الحل:**
- في `server.js`: `const PORT = process.env.PORT || 3000` ✅ موجود
- Railway يحقن `PORT` تلقائياً

---

### "Application failed to respond"
**التشخيص:**
- Variables → تحقق وجود كل المتغيرات المطلوبة
- Deployments → View Logs → ابحث عن أخطاء

---

## 💾 مشاكل تسجيل الطلبات

### `/orders` يعطي forbidden
**السبب:** `token` query param لا يطابق `OWNER_PHONE`.

**الاستخدام الصحيح:**
```
https://your-domain.com/orders?token=966500000000
```

---

### الطلبات لا تُحفظ
**التشخيص:**
- تحقق من permissions على مجلد `data/`
- في Railway، الـ filesystem ephemeral → الطلبات تُمسح عند إعادة deploy

**الحل للإنتاج:**
- استخدم Railway Volume (Settings → Volumes)
- أو ربط Google Sheet ثانية كـ orders log (تطوير لاحق)

---

## 🔐 مشاكل الأمان

### "Invalid webhook signature"
**السبب:** `META_APP_SECRET` مُعيّن لكن خطأ.

**الحل:**
- Meta → App Settings → Basic → **App Secret** → Show
- ضع القيمة الكاملة في `.env`
- أو اتركه فارغاً للتعطيل (مقبول في Test، ليس Production)

---

## 🐛 Debugging عام

### أين أرى الـ logs؟
- **محلياً:** في الـ terminal الذي شغّلت فيه `npm start`
- **Railway:** Dashboard → Project → Deployments → View Logs
- **Render:** Dashboard → Service → Logs tab

### تفعيل logs أكثر تفصيلاً
في `.env`:
```env
LOG_LEVEL=debug
```

### اختبار الشجرة محلياً قبل النشر
```bash
npm run simulate
```
هذا أسرع 100 مرة من debug على الإنتاج.

---

## 🆘 الدعم الأخير

لو جربت كل شيء ولم تنجح:
1. شغّل `npm test` — يجب أن ينجح كل الـ assertions
2. شغّل `npm run simulate` — يجب أن ترى الشجرة كاملة
3. تحقق من `/health` على دومين Railway
4. تحقق من log الـ Railway آخر رسالة قبل الخطأ

إذا الـ 4 سابقاً سليمة، المشكلة 99% في إعدادات Meta وليس في الكود.
