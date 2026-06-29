# whatsapp-bridge

خدمة إرسال WhatsApp عبر Baileys (web protocol).

## أول تشغيل
1. `docker compose up -d whatsapp-bridge`
2. افتح http://localhost:8500/qr
3. امسح الـ QR بـ WhatsApp على هاتفك (Linked devices)
4. الخدمة الآن تستهلك Redis Stream `doctor:notify`

## وضع المحاكاة (dev بدون WhatsApp حقيقي)
```yaml
environment:
  WA_SIMULATE: "true"
```
الرسائل تُسجَّل فقط — لا إرسال فعلي.

## ملاحظات أمان
- Baileys غير رسمي — استخدمه للـ MVP/dev فقط
- للإنتاج: انتقل لـ WhatsApp Cloud API بعد تأكيد الـ business profile
- مفتاح الجلسة في `/app/auth_state` — لا تشاركه
