# 🚨 RUNBOOK — منصة ثواني

> دليل التعامل مع الحوادث (Incidents). لكل سيناريو: **الأعراض → التشخيص → الإصلاح → ما بعد الحادث**.
> **اطبع هذا واحفظه قريباً منك. لو شيء فشل في 3am ستحتاجه.**

---

## 📞 جهات الاتصال السريعة

| الدور | الاتصال |
|------|---------|
| المسؤول التقني الأول | `+966508572902` (أبو حاتم) |
| المطور | `m76yitf@gmail.com` |
| VPS Provider | Vultr Dashboard |
| Domain | Tailscale Dashboard |
| Stripe Support | dashboard.stripe.com → Support |

---

## 🎯 جدول قرار سريع

| الأعراض | السيناريو |
|---------|----------|
| موقع لا يفتح إطلاقاً | **#1 السيرفر مات** |
| موقع يفتح لكن البوت لا يرد | **#2 Baileys session مقطوعة** |
| رسائل OWNER لا تصل | **#3 جلسة platform/lead مقطوعة** |
| disk usage > 90% | **#4 disk ممتلئ** |
| كل المتاجر offline فجأة | **#5 احتمال حظر WhatsApp** |
| استعادة بيانات بعد كارثة | **#6 Backup restore** |
| تأخر شديد في الاستجابة | **#7 Performance degradation** |
| فقدان MASTER_PASSWORD | **#8 إعادة تعيين الـ Master** |

---

## #1 السيرفر مات (Process not running)

### الأعراض
- `curl https://bothatim-vps.tail19ddab.ts.net/health` → connection refused / timeout
- لوحة الإدارة لا تفتح
- شكاوى من عدة متاجر

### التشخيص (60 ثانية)
```bash
ssh root@<vps-ip>
pm2 list                    # هل whatsapp-bot يعمل؟
pm2 logs whatsapp-bot --lines 50  # آخر errors
systemctl status pm2-root   # هل PM2 نفسها تعمل؟
df -h /                     # disk هل ممتلئ؟ (إذا كان، اقفز للسيناريو #4)
free -h                     # memory
```

### الإصلاح

**الحالة A: PM2 يعمل لكن whatsapp-bot stopped/errored**
```bash
pm2 restart whatsapp-bot
pm2 logs whatsapp-bot --lines 20    # تحقق من الـ boot logs
# إذا [FATAL] JWT_SECRET → نقص في .env
grep "^JWT_SECRET=" /opt/bothatim/.env
# إذا فارغ، أضفه:
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(64).toString('hex'))" >> /opt/bothatim/.env
pm2 restart whatsapp-bot
```

**الحالة B: PM2 ميت (rebooted vps أو crashed)**
```bash
pm2 resurrect            # يستعيد saved process list
# إذا لم يفلح:
cd /opt/bothatim
pm2 start ecosystem.config.js
pm2 save
pm2 startup              # لتشغيل تلقائي عند reboot
```

**الحالة C: السيرفر boot loop (يموت بعد كل restart)**
```bash
pm2 logs whatsapp-bot --lines 100 > /tmp/boot-err.log
# ابحث عن السبب:
grep -E "FATAL|Error|EADDRINUSE" /tmp/boot-err.log
# الأسباب الشائعة:
#   - EADDRINUSE: port 3003 مستخدم → kill -9 $(lsof -ti:3003)
#   - ENOSPC: disk ممتلئ → سيناريو #4
#   - corrupt JSON: استعد آخر backup → سيناريو #6
```

### ما بعد الحادث
- `tail -200 /opt/bothatim/logs/app.log > /tmp/incident-$(date +%Y%m%d).log` للأرشيف
- إذا تكرر السيناريو، فعّل alert في `health-monitor.js` cron
- ضع في الـ runbook ملخص السبب الجذري

---

## #2 Baileys session مقطوعة لمتجر واحد

### الأعراض
- متجر معيّن: العملاء يرسلون والبوت لا يرد
- باقي المتاجر تعمل
- `wa-status` يرجع `disconnected` أو `qr`

### التشخيص
```bash
# في master.html → المتجر → WA Status
# أو:
curl -H "x-master-token: $MASTER_PASSWORD" \
  https://bothatim-vps.tail19ddab.ts.net/health | jq '.sessions'
```

### الإصلاح

**أولاً: انتظر دقيقتين** — `whatsapp-manager.js` فيه exponential backoff (5s → 5min)، قد يعيد الاتصال تلقائياً.

**إذا بقي مقطوعاً:**
```bash
# Option 1: reset عبر اللوحة
# master.html → المتجر → ⚡ توليد QR جديد → امسح من واتساب صاحب المتجر

# Option 2: من السيرفر
ssh root@<vps-ip>
cd /opt/bothatim
# امسح session files (سيُطلب QR جديد):
rm -rf data/sessions/<storeId>
pm2 restart whatsapp-bot
# ثم master.html → المتجر → wa-start-qr
```

**إذا الـ session تتقطع متكرراً (كل ساعة):**
- محتمل أن صاحب المتجر يستخدم نفس واتساب على هاتفين
- اطلب منه إغلاق "Linked Devices" غير المُعرَّفة من هاتفه
- أو رقم البوت محظور (انظر سيناريو #5)

---

## #3 جلسة platform/lead مقطوعة (الـ master لا يستلم تنبيهات)

### الأعراض
- تنبيهات الـ master (طلبات اشتراك جديدة) لا تصل
- مالك المتجر يستلم تأكيد الطلب، لكن أنت لا
- health-alerts لا تأتيك

### الإصلاح
```bash
# الـ platform session هي رقم منفصل للـ bot الترويجي
# من master.html → بوت المنصة → Connect / QR
# أو SSH:
rm -rf data/sessions/platform
pm2 restart whatsapp-bot
# ثم منصة admin: ربط واتساب جديد لرقم الـ marketing
```

---

## #4 Disk full (ENOSPC)

### الأعراض
- `df -h /` يُظهر > 90%
- writes تفشل بـ ENOSPC
- backups لا تُنشأ

### التشخيص + إصلاح فوري
```bash
ssh root@<vps-ip>
df -h /
# المعتاد: backups + logs + audit/ يأكلون مساحة

du -sh /opt/bothatim/* | sort -h | tail -10

# 1. حذف backups قديمة (تأكد رفع copy لـ offsite أولاً)
cd /opt/bothatim/backups
ls -t thawani-*.tar.gz.gpg | tail -n +8 | xargs -r rm
# (يحتفظ آخر 7 يوم محلياً)

# 2. حذف logs قديمة
pm2 flush                          # يفرّغ PM2 logs
find /opt/bothatim/logs -name "*.log" -mtime +30 -delete
journalctl --vacuum-time=7d

# 3. حذف invoice PNGs قديمة (تُعاد توليدها لو لزم)
find /opt/bothatim/data/invoices -name "*.png" -mtime +60 -delete

# 4. حذف audit files أقدم من 6 شهور
find /opt/bothatim/data/audit -name "*.jsonl" -mtime +180 -delete

df -h /
```

### إجراء طويل الأمد
- ارفع plan الـ VPS لمساحة أكبر
- أو فعّل `BACKUP_RCLONE_REMOTE` (انظر `SECURITY.md`) لـ offsite ثم احذف محلياً أسرع

---

## #5 احتمال حظر WhatsApp (كل المتاجر offline فجأة)

### الأعراض
- 5+ متاجر تفقد session معاً
- إعادة الاتصال تستمر بالفشل
- error: "401 unauthorized" أو "device removed"

### التشخيص
```bash
pm2 logs whatsapp-bot | grep -E "401|loggedOut|banned" | tail -20
```

### الإصلاح فوري

**هذا أخطر سيناريو** — Baileys غير رسمي و WhatsApp قد يكتشفه. إذا حدث:

1. **توقف فوراً عن أي broadcast نشط:**
   ```bash
   curl -X POST -H "x-store-token: ..." https://.../store/broadcast/cancel
   ```

2. **افحص أرقام البوت:** افتحها على هاتفك الفعلي. إذا يقول "محظور":
   - الرقم مات. **لا يمكن استرداده**.
   - أبلغ صاحب المتجر يستخدم رقم آخر للبوت.

3. **إذا الأرقام تعمل لكن sessions تفشل:** قد يكون تحديث في Baileys/WA Web:
   ```bash
   npm install @whiskeysockets/baileys@latest
   pm2 restart whatsapp-bot
   ```

### الوقاية
- **انخفض broadcast cap** من 50 إلى 30 رسالة
- **زد cooldown** من 6 إلى 12 ساعة
- لا تربط أكثر من session واحدة لنفس الرقم
- إذا متجر يبث بكثرة، حذّره

---

## #6 Backup restore (استعادة بعد كارثة)

### السيناريو
- VPS تالف / مسروق
- بيانات مفقودة
- migration كسرت stores.json

### الإصلاح خطوة بخطوة

```bash
# 0. أوقف السيرفر لئلا يكتب فوق الـ restore
pm2 stop whatsapp-bot

# 1. اختر backup صالح
ls -t /opt/bothatim/backups/thawani-*.tar.gz.gpg | head -5

# 2. اختبر أنه صالح قبل الـ overwrite
/opt/bothatim/scripts/restore-drill.sh /opt/bothatim/backups/thawani-YYYYMMDD-HHMMSS.tar.gz.gpg
# إذا فشل، جرّب backup أقدم. لا تستعد backup مكسور!

# 3. خذ نسخة من الـ data الحالي (للسلامة)
mv /opt/bothatim/data /opt/bothatim/data.before-restore-$(date +%s)

# 4. استعد الـ archive
cd /opt/bothatim
gpg --batch --yes --pinentry-mode loopback \
    --passphrase "$BACKUP_PASSPHRASE" \
    --decrypt backups/thawani-YYYYMMDD-HHMMSS.tar.gz.gpg | tar -xzf -

# 5. تحقق
ls -la data/
node -e "console.log('stores:', JSON.parse(require('fs').readFileSync('data/stores.json')).stores.length)"

# 6. أعد التشغيل
pm2 restart whatsapp-bot
pm2 logs --lines 30

# 7. اختبر:
curl https://.../health
# سجل دخول من master.html تأكد من المتاجر موجودة
```

### إذا الـ VPS كلياً ميت
1. أنشئ Vultr instance جديد (Ubuntu 22.04)
2. ثبّت Node 20 + PM2 + Tailscale
3. `git clone https://github.com/61465/cafe.git /opt/bothatim`
4. حمّل أحدث backup من offsite (B2/R2): `rclone copy r2:thawani-backups/latest.tar.gz.gpg .`
5. تابع من الخطوة 4 أعلاه

---

## #7 Performance degradation (تأخر شديد)

### الأعراض
- `/health` يأخذ > 2s
- المتاجر تشتكي من بطء
- memory > 80%

### التشخيص
```bash
pm2 monit                         # CPU + memory live
curl https://.../health/deep | jq # تشخيص شامل
```

### الإصلاح

**إذا memory > 80%:**
```bash
pm2 restart whatsapp-bot          # يفرّغ memory leak
# في ecosystem.config.js: max_memory_restart=500M موجود — يفعل تلقائياً
```

**إذا disk I/O عالية:**
```bash
iotop -ao                         # ابحث عن العملية المُلتهمة
# المعتاد: orders_*.jsonl ضخمة جداً → فعّل monthly archive
```

**إذا CPU عالية:**
```bash
top -p $(pgrep -f whatsapp-bot)
# إذا قراءة JSONL كبيرة، اختر sample:
ls -laSh data/orders_*.jsonl | head
# لو ملف واحد > 10MB، شغّل archive:
# في master.html → كل متجر → archive
```

---

## #8 فقدان MASTER_PASSWORD

### السيناريو
- نسيت `MASTER_PASSWORD`
- ضاع جهاز فيه backup codes الـ 2FA

### الإصلاح

```bash
ssh root@<vps-ip>
cd /opt/bothatim

# 1. ولّد كلمة مرور جديدة
NEW=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")
echo "كلمة المرور الجديدة: $NEW"

# 2. ضعها في .env
sed -i "s/^MASTER_PASSWORD=.*$/MASTER_PASSWORD=$NEW/" .env
# تحقق:
grep "^MASTER_PASSWORD=" .env

# 3. احذف الـ master-credentials.json (سينشأ هاش جديد عند الـ login)
rm -f data/master-credentials.json

# 4. إذا 2FA مفعّل وفقدت backup codes، اضطر لإطفائه:
node -e "
const fs = require('fs');
const f = 'data/twofa.json';
const d = JSON.parse(fs.readFileSync(f));
delete d.master;
fs.writeFileSync(f, JSON.stringify(d, null, 2));
console.log('2FA معطّل للماستر');
"

# 5. أعد التشغيل
pm2 restart whatsapp-bot

# 6. سجّل دخول بالكلمة الجديدة وفعّل 2FA من جديد
```

### وقاية
- اكتب MASTER_PASSWORD في خزنة فيزيائية (ورق) عند صديق ثقة
- صور backup codes الـ 2FA واحفظها في 1Password/Bitwarden

---

## 📊 سيناريوهات أقل خطورة

### كلمة مرور متجر معيّن مفقودة
master.html → المتجر → Edit → كلمة مرور جديدة → احفظ (يـbcrypt تلقائياً) → أرسل الكلمة الجديدة عبر واتساب

### Stripe webhook events مكدّسة
```bash
# تحقق من stripe dashboard → developers → webhooks → events
# إذا في events failed، تأكد:
grep "STRIPE_WEBHOOK_SECRET" .env  # موجود؟
# أعد تشغيل replay من Stripe dashboard
```

### بوت يرسل رسائل مكررة
```bash
# تحقق من duplicate detection في server.js (_seenMsgIds Map)
# إذا حدث، restart:
pm2 restart whatsapp-bot
```

---

## 📝 سجل الحوادث

| التاريخ | السيناريو | المدة | الإجراء | السبب الجذري |
|--------|-----------|------|---------|---------------|
| 2026-06-12 | Sprint Hardening | - | تطبيق Sprint 1-4 | تحسينات استباقية |
| _اكتب هنا كل حادث جديد_ | | | | |

---

> **مبدأ:** كل حادث = درس. حدّث هذا الملف بعد كل حادث.
