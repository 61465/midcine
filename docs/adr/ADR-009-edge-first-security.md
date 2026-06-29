<div dir="rtl" lang="ar">

# ADR-009: Edge-First Security (حماية واقعية لا paranoid)

- **الحالة:** مقبول
- **التاريخ:** 2026-06-18
- **القرار:** عبد الرحمن
- **يُعدّل:** ADR-001 (Hybrid Topology) + قسم 3.2 من Master Plan

## السياق

الـ enterprise يبيع "AES-256 everywhere + Zero Trust + HSM" لأنه يبيع، ليس لأنه ضروري للعيادة المتوسطة. التشفير المبالغ فيه ينتج:
1. **قيود تشغيلية:** أطباء يتحايلون (يصوّرون شاشة، يستخدمون email خارجي)
2. **تكاليف عالية:** HSM + KMS managed = $500+/شهر
3. **debug صعب:** كل bug = "هل المشكلة في التشفير؟"
4. **بطء:** TLS handshake في كل intra-service call

البديل العقلاني: **بياناتك لا تغادر مشفاك. التشفير حيث يهمّ فعلاً.**

## القرار

نعتمد **Edge-First Security Model** بثلاث ركائز:

### الركيزة 1: Data Stays Where It Belongs

| نوع البيانات | الموقع | التشفير | المبرر |
|--------------|--------|---------|---------|
| **DICOM pixel data (raw)** | Orthanc محلي داخل المشفى فقط | at-rest فقط (LUKS/BitLocker disk) | لا يغادر المشفى إطلاقاً |
| **Study metadata (UID, modality, date, AE)** | محلي + index hash في السحاب | في النقل (TLS) | الـ hash للـ cross-hospital lookup فقط |
| **AI inference (pixel sent to GPU)** | يُرسل مشفّراً، يُحذف خلال 60s بعد inference | TLS + ephemeral storage | لا backup، لا cache |
| **Reports (signed PDF + DICOM SR)** | محلي + R2 encrypted backup | at-rest AES-256 (R2 default) | للـ DR فقط |
| **Patient demographics (name, phone)** | محلي | field-level encryption (المهم فقط) | name encrypted، عمر/جنس clear (للـ AI) |
| **National ID** | محلي + SHA-256(salt + id) للـ PMI | hash one-way في السحاب | لا يُكتب raw في السحاب أبداً |
| **WhatsApp packets** | السحاب مؤقتاً (24h auto-delete) | TLS in transit + Baileys encryption | ضرورة وظيفية |
| **Audit logs** | محلي + replication للسحاب | immutable triggers + WORM في R2 | compliance |

### الركيزة 2: Cross-Hospital Sharing بـ Consent Real-time

السيناريو الجديد (ميزة تنافسية):
```
الطبيب في مشفى A يفتح ملف المريض
   ↓
يبحث "هل لهذا المريض دراسات سابقة؟"
   ↓
midcine Cloud Index Service:
   - يستقبل hash(national_id + salt)
   - يرجع: نعم، يوجد في مشفى B (لا تفاصيل!)
   ↓
نظام يطلب consent من المريض:
   - WhatsApp message: "د. س في مشفى A يريد الاطلاع على دراساتك من مشفى B. وافق؟"
   - أو SMS مع OTP
   - أو في الـ app الخاص بالمريض
   ↓
المريض وافق
   ↓
midcine Cloud ينشئ mTLS tunnel مؤقت A ↔ B (peer-to-peer)
   - السحاب لا يخزّن الـ DICOM
   - السحاب يخزّن: من طلب، متى، ما الـ studies، consent_id
   ↓
DICOM ينتقل مباشرة A ↔ B
   ↓
Audit في الطرفين + إشعار للمريض بعد الاكتمال
```

**هذه الميزة وحدها تستحق التسويق:** "ملف مريضك يتبعه — بإذنه — بين مشفى وآخر، بدون أن يصل لأي خادم وسيط."

### الركيزة 3: Risk-Based Encryption (لا تشفير شامل)

ما **نُلغيه** من الـ over-engineering:
- ❌ Field encryption على كل column → فقط `name_ar, phone, national_id_hash`
- ❌ DICOM TLS داخل LAN المشفى → LAN معزولة، Orthanc plain يكفي
- ❌ HSM-backed KMS → Infisical + age keys (self-hosted Docker)
- ❌ mTLS بين كل service داخل compose واحد → Docker network معزولة كافية
- ❌ 2FA إجباري للجميع → فقط admin + signing actions

ما **نُبقي عليه صلباً**:
- ✅ mTLS بين Edge (مشفى) ↔ Cloud (إجباري دائماً)
- ✅ TLS 1.3 لكل external traffic
- ✅ RLS على Postgres (مفعّل)
- ✅ Audit log immutable (مفعّل)
- ✅ PKI signing للتقارير (قانوني)
- ✅ Consent management صريح
- ✅ OIDC + SSO لكن 2FA optional للأطباء العاديين

## التنفيذ

### Cloud Index Service (الجزء الجديد)
```
services/cloud-index/
  ├── app/
  │   ├── main.py              # FastAPI
  │   ├── pmi_lookup.py        # hash-based patient lookup
  │   ├── consent_flow.py      # WhatsApp/SMS/in-app consent
  │   ├── tunnel_broker.py     # mTLS handshake broker
  │   └── audit.py             # cross-hospital audit
  ├── pyproject.toml
  └── Dockerfile
```

### Tunnel Broker Pattern
- Cloud لا ينقل DICOM، فقط **يُهيّئ الاتصال**:
  1. يولّد short-lived mTLS cert pair (TTL 5 دقائق)
  2. يرسل cert + IP المقابل لكل طرف
  3. الطرفان يتصلان مباشرة (NAT traversal عبر STUN/TURN لو لزم)
  4. transfer ينتهي → certs يُمسحون
- مكتبات: `pyca/cryptography` + `aioice` للـ NAT traversal

### إلغاء ما لا يلزم من Sprint 2 السابق
السابق: "mTLS داخلي شامل + Vault كامل"
الجديد:
- Sprint 2 يصبح: **Infisical + mTLS Edge↔Cloud فقط + step-ca لـ signing certs**
- ندخّر ~5 أيام عمل
- ندخّر $50/شهر infrastructure

## التنازلات الصريحة

- **إذا اخترقت LAN المشفى → اخترقت الـ DICOM raw.** نقبل هذا لأن:
  - الـ pixel data بدون patient metadata = قيمة محدودة جداً
  - patient metadata مشفّر field-level
  - DICOM raw داخل LAN معزولة (لا internet مباشر)
  - الـ trade-off: عيادة 50 سرير لا تستطيع إدارة zero-trust internal، التظاهر بالعكس = أمان كاذب

- **Cross-hospital consent يعتمد على WhatsApp/SMS** — لو المريض لم يستلم، لا transfer. نقبل لأن: consent غائب = no-go، لا shortcuts.

- **No HSM** — لو قُرصن server المفاتيح، يمكن decryption للـ field-encrypted. نخفّفها بـ: rotation شهرية + offline backup للـ master key.

## المكاسب القابلة للقياس

| مقياس | قبل | بعد | ربح |
|-------|-----|-----|-----|
| تكلفة infra شهرية | $400 (HSM + managed KMS) | $80 (Infisical + R2) | -80% |
| Latency intra-service | +50ms (mTLS handshake) | <5ms (plain in LAN) | -90% |
| Sprint 2 effort | 7 أيام | 3 أيام | -57% |
| رسالة بيعية | "AES-256 everywhere" | "بياناتك لا تغادر مشفاك" | أقوى تسويقياً |

## ربط بـ Compliance

- HIPAA §164.312(e) Transmission Security — مُلبّى عبر TLS 1.3 external + mTLS Edge↔Cloud
- GDPR Art. 32 Security of processing — risk-based approach مقبول صراحة في النص
- EDA قانون 151/2020 مادة 9 — data minimization principle محقّق
- سدايا PDPL — data residency محقّق فعلياً (البيانات في مكانها)

</div>
