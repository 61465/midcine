# 🔒 دليل الأمان — منصة ثواني

> هذا الدليل لمسؤول النظام (أبو حاتم) ولكل من ينشر/يطوّر النسخة الإنتاجية.

---

## 🚨 إجراءات حرجة قبل الإقلاع

### 1. ضبط `.env` بالحد الأدنى الآمن
```env
# مطلوب — السيرفر يرفض الإقلاع بدون هذه:
JWT_SECRET=<128 hex chars عشوائي>   # node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
MASTER_PASSWORD=<≥8 حرف قوية>        # لا يقبل default، يرفض إن كان أقل من 8

# مطلوب على الإنتاج:
BACKUP_PASSPHRASE=<≥24 حرف>          # للنسخ المشفّرة GPG
```

### 2. نقل Firebase Service Account Key خارج workspace
الملف `*firebase-adminsdk*.json` **لا يجب أن يكون** في `D:\project\mostqlworkwatssap\` أبداً.

**الإصلاح:**
- **محلياً (Windows):** انقله إلى `%USERPROFILE%\.config\thawani\firebase-key.json`
- **على VPS Linux:** انقله إلى `/etc/secrets/thawani/firebase-key.json` بـ `chmod 600` وملكية مستخدم البوت فقط
- **بدلاً منه:** استخدم متغيرات بيئة:
  ```env
  FIREBASE_PROJECT_ID=botwats-fae4e
  FIREBASE_CLIENT_EMAIL=firebase-adminsdk-...@botwats-fae4e.iam.gserviceaccount.com
  FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
  ```
- بعد النقل، أزل أي نسخة قديمة: `git rm --cached *firebase-adminsdk*.json` ثم احذف من القرص.

### 3. تشغيل migration كلمات المرور
```bash
# على الإنتاج (مرة واحدة فقط):
node scripts/migrate-plaintext-passwords.js
```
سيُنشئ نسخة احتياطية تلقائياً + يطبع الكلمات الأصلية على الـ terminal لإرسالها لأصحاب المتاجر.
**بعد الإرسال:** امسح output الـ terminal، لا تحفظه في أي مكان.

### 4. تفعيل 2FA للماستر
- افتح `master.html → الأمان → 2FA → Setup`
- امسح QR في Google Authenticator أو Authy
- احفظ الـ 8 backup codes (أصبحت 64-bit الآن) في مكان آمن (1Password/Bitwarden)

### 5. تشغيل nightly backup
أضف cron job:
```cron
30 3 * * * /opt/bothatim/scripts/backup-encrypted.sh
```

---

## 🛡️ الإصلاحات الأمنية المُطبّقة (Sprint 1+2 — 2026-06-12)

| # | الإصلاح | الملف |
|---|----------|------|
| C1 | حذف Firebase login bypass (clientUid بدون verification) | `store-router.js` |
| C2 | XSS protection عبر `_safeJSON` + `_safeCssColor` | `server.js` |
| C3 | Stripe endpoints محمية بـ `storeAuth` + paymentsLimiter | `payments-router.js` |
| C4 | حذف default password `gzmaster2026` — السيرفر يرفض الإقلاع | `master-router.js` |
| C5 | كلمات مرور المتاجر bcrypt من أول لحظة + migration script | `master-router.js`, `firestore-auth.js`, `scripts/` |
| C6 | Magic-byte verification + path-traversal block للـ uploads | `upload-safety.js` |
| H1+H2 | Stripe webhook idempotency + حفظ `subscriptionPeriod` | `payments-router.js` |
| H3 | إزالة Meta Cloud API — Baileys فقط | `payments-router.js` |
| H4 | CSS injection protection (validate colors) | `server.js` |
| H5 | SSRF protection — whitelist لـ image domains | `invoice-image.js` |
| H6 | `archiveMonth` يحترم عزل المتاجر (storeId-scoped) | `customers.js` |
| H7 | Mass-assignment whitelist في `PUT /master/stores/:id` | `master-router.js` |
| H8 | Edit-mode-link بـ short-lived token (لا session token في URL) | `store-router.js`, `preview-edit.html` |
| H9 | Master impersonation: TTL 30 دقيقة absolute + audit | `store-router.js`, `master-router.js` |
| H10 | TOTP replay prevention (lastUsedCounter) + 64-bit backup codes | `two-fa.js` |
| H11 | Rate limiting على `/c/` `/o/` `/do/` `/try/` | `server.js` |
| H12+H13 | `.gitignore` شامل + توثيق نقل firebase key | `.gitignore`, `SECURITY.md` |

---

## 📡 ما يجب مراقبته

### Logs الحساسة
```bash
# محاولات login فاشلة (brute-force محتمل)
jq 'select(.action=="login.fail")' data/audit/$(date +%Y-%m).jsonl

# محاولات SSRF
grep "blocked SSRF" /opt/bothatim/logs/app.log

# انتحال master
jq 'select(.action=="store.impersonate")' data/audit/*.jsonl
```

### إشارات تحذير
- `[FATAL]` في logs → السيرفر رفض الإقلاع (انظر سبب)
- `[stripe-webhook] event ... already processed` → idempotency يعمل ✓
- `[firestore-auth] migrated sha256→bcrypt` → migration تلقائي يحدث

---

## 🔄 الصيانة الدورية

| التكرار | المهمة |
|---------|--------|
| **يومي** | تأكد من `backups/` يحوي ملف جديد |
| **أسبوعي** | راجع `data/audit/*.jsonl` للنشاط الغريب |
| **شهري** | تحقق من restore backup فعلياً (drill) |
| **كل 3 أشهر** | تغيير `JWT_SECRET` (يلغي كل sessions) |
| **سنوي** | rotate `MASTER_PASSWORD` |

---

## 🚨 الإبلاغ عن ثغرات

أرسل تقرير مفصّل لـ `m76yitf@gmail.com` أو WhatsApp `+966508572902` — لا تنشر علناً قبل الإصلاح.
