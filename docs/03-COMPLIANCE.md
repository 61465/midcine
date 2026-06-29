<div dir="rtl" lang="ar">

# 03 — الامتثال والأمن

> **مبدأ:** نظام طبي بدون امتثال = شركة مغلقة في 6 أشهر. كل قرار هنا قابل للتدقيق.
> **مدخلات:** ردود DevSecOps Agent + Penetration Tester (NEXUS-AI) + معرفة المعايير الطبية الدولية
> آخر تحديث: 2026-06-07

---

## 1. مصفوفة الامتثال (Compliance Matrix)

> ضوابط ينطبق عليها midcine، وكيف نطبقها تقنياً، وما يحتاج اعتماداً قانونياً خارجياً.

### 1.1 HIPAA (الولايات المتحدة — مرجع عالمي)

> midcine لا يخدم السوق الأمريكي مباشرة، لكن HIPAA هو المعيار الذي يقيس به الأطباء العرب الجودة. التزامنا به = ميزة تسويقية.

| الضابط | المتطلب | تطبيق midcine |
|--------|----------|---------------|
| 164.308(a)(1) Security Mgmt | تقييم مخاطر مستمر | Vanta-style risk register في Notion + مراجعة ربع سنوية |
| 164.308(a)(3) Workforce Security | RBAC + إنهاء فوري | Casbin policies + JWT revocation list |
| 164.308(a)(5) Awareness Training | تدريب سنوي | كورس داخلي إلزامي + امتحان |
| 164.312(a)(1) Access Control | Unique user ID, auto-logoff | UUID per user + 15 min idle timeout |
| 164.312(b) Audit Controls | تسجيل كل وصول | Immutable audit log في PostgreSQL + شحن لـ Loki |
| 164.312(c)(1) Integrity | منع التعديل غير المصرّح | DICOM SR signature + WORM على R2 |
| 164.312(e)(1) Transmission Security | تشفير in-transit | mTLS 1.3 إلزامي |
| 164.404 Breach Notification | إخطار 60 يوم | playbook موثّق + قالب إشعار |

### 1.2 GDPR (الاتحاد الأوروبي)

> نلتزم به لأن (أ) Hetzner أوروبي، (ب) قد نخدم مرضى أوروبيين متنقلين، (ج) معيار خصوصية صلب.

| المادة | المتطلب | تطبيق midcine |
|--------|----------|---------------|
| المادة 5 | Data Minimization | لا نخزن أي بيانات لا يطلبها FHIR/DICOM |
| المادة 6 | Lawful Basis | عقد + موافقة المريض مكتوبة (نموذج جاهز) |
| المادة 17 | Right to Erasure | endpoint `/patient/{id}/erase` يحذف من DB + R2 + audit yet anonymized |
| المادة 25 | Privacy by Design | تشفير افتراضي، RBAC افتراضي |
| المادة 30 | Records of Processing | Diagram DPA + Data Flow في docs/dpa/ |
| المادة 32 | Security of Processing | كل ما في القسم 3 من هذه الوثيقة |
| المادة 33 | Breach Notification | 72 ساعة — playbook موثّق |
| المادة 35 | DPIA | تقييم أثر إلزامي قبل كل feature جديد يلمس بيانات حساسة |

### 1.3 هيئة الدواء المصرية (EDA) + قانون حماية البيانات المصري 151/2020

| الضابط | المتطلب | تطبيق midcine |
|--------|----------|---------------|
| المادة 3 (قانون 151) | الموافقة الصريحة | شاشة موافقة المريض قبل أول استخدام، توقيع رقمي |
| المادة 7 | حق الوصول والتصحيح | لوحة "بياناتي" للمريض |
| المادة 23 | إبلاغ الجهة المختصة | 72 ساعة لمركز حماية البيانات |
| EDA Software as Medical Device | تصنيف الجهاز | midcine MDR Class IIa (يساعد التشخيص لا يستبدله) |
| EDA Cybersecurity Guidance 2024 | إدارة تحديثات أمنية | كل CVE Critical يُرقَّع في ≤72 ساعة |

### 1.4 سدايا السعودية (Saudi Data & AI Authority)

| الضابط | المتطلب | تطبيق midcine |
|--------|----------|---------------|
| PDPL Article 5 | Data Localization | للعملاء السعوديين: نشر مرايا في AWS Bahrain أو Oracle Riyadh |
| PDPL Article 12 | DPO Mandatory | DPO معيّن قبل أول عميل سعودي |
| NCA Essential Cybersecurity Controls | 114 ضابط | gap analysis قبل دخول السعودية + closure plan |
| AI Ethics Principles 2023 | Transparency + Explainability | كل تشخيص AI يُرفق بـ confidence score + heatmap (XAI) |
| HCRP — Healthcare Cybersecurity Reg | تخزين سعودي، DPO، Audit | تأجيل دخول السعودية للسنة الثانية لتطبيق كامل |

> **ملاحظة:** الشهادات الرسمية (HIPAA BAA، GDPR DPA، EDA certificate) ليست شهادات تُمنح — هي توافقات يجب أن نوثّقها مع كل عميل. نوظّف **محامي صحة رقمية + DPO** قبل أول عقد بأكثر من 50,000 ج.م.

---

## 2. Threat Model — STRIDE الكامل

> مصدر مرجعي: NEXUS-AI Pen Tester + معرفة DICOM-specific attacks.

### 2.1 مصفوفة STRIDE لكل مكوّن

| المكوّن | Spoofing | Tampering | Repudiation | Info Disclosure | DoS | Elevation |
|---------|----------|-----------|--------------|------------------|-----|-----------|
| Orthanc Edge | DICOM Source verification (AET) | DICOM digital signature | Immutable audit | mTLS + AES at-rest | Rate limit + UPS | RBAC + sudo separation |
| MinIO محلي | IAM keys per service | Object versioning | Server access logs | Encryption + Object Lock | Bandwidth quota | Strict bucket policies |
| Edge Pusher | mTLS client cert | Hashed manifest per chunk | Send-receipt to cloud | E2E TLS | Backpressure queue | Read-only DICOM mount |
| Ingestion API | JWT + mTLS | Signed payloads | Request ID + 7y audit | TLS 1.3 only | WAF + rate limit | OPA policies |
| PostgreSQL | Strong auth, no `trust` | Row-level checksums | pgAudit extension | TLS + field encryption | Connection pool limits | Roles + RLS |
| AI Worker | Signed model artifacts | Model hash verification | Inference receipt | Sandbox container | GPU quota per job | gVisor sandbox |
| OHIF Viewer | OIDC SSO | CSP strict + SRI | User action audit | CORS strict | CDN protection | RBAC client + server |
| Clinical LLM | Signed inference | Prompt injection guard | Conversation log | No PII in prompt | Token budget | Separate inference VPC |

### 2.2 Top 10 سيناريوهات الهجوم على RIS/PACS (مع تخفيف محدد)

#### #1 — DICOM Injection (Patient Identity Switch)
**السيناريو:** مهاجم يرسل DICOM C-STORE من جهاز خبيث على شبكة المستشفى مع PatientID لمريض VIP، فيُربط فحص خبيث بسجله.
**التخفيف:**
- Orthanc whitelist للـ Application Entity Titles (AET) المسموحة فقط
- TLS DICOM (`DICOMTLSEnabled = true`) إلزامي
- Cross-validation بين PatientID في DICOM وقاعدة بيانات RIS
- تنبيه إذا تسلسل StudyInstanceUID شاذ

#### #2 — Edge Gateway Lateral Movement
**السيناريو:** هاكر يخترق جهاز مكتب فني، يصل لـ Edge Gateway على نفس LAN، يحاول SSH/RDP أو يستغل Orthanc admin panel.
**التخفيف:**
- Edge Gateway في **VLAN معزول** (RIS-VLAN فقط للأجهزة الطبية و Gateway)
- SSH معطّل، إدارة عبر Tailscale mesh VPN فقط
- Orthanc admin UI لا يُكشف؛ كل إدارة عبر Cloud → Edge tunnel

#### #3 — Pixel Data Steganography (Data Exfiltration)
**السيناريو:** موظف داخلي يخفي بيانات مريض في pixel values لصورة DICOM ويسحبها كـ "صورة طبيعية".
**التخفيف:**
- DLP على export endpoints — كل DICOM يُحلَّل قبل التصدير
- Watermarking على export (hash مرئي يحمل user_id + timestamp)
- مراقبة شذوذ حجم الملف عند التصدير

#### #4 — Model Poisoning (AI Triage)
**السيناريو:** مهاجم يدفع feedback خبيث للـ continuous learning loop (مثلاً يصنّف 1000 نزيف كـ "طبيعي" لتدريب النموذج على تجاهل النزيف).
**التخفيف:**
- لا continuous learning من production مباشرة — كل تحديث نموذج يمر بـ review board طبي
- Trusted reviewer pool (5+ أطباء معتمدين)
- DVC (Data Version Control) + signed checkpoints

#### #5 — SSRF على Orthanc REST API
**السيناريو:** Orthanc يقبل `Url` parameter في `/peers/store` — مهاجم يجبره على طلب metadata من AWS IMDS أو localhost services.
**التخفيف:**
- block egress من Orthanc container لـ 169.254.169.254 و RFC1918 (إلا Edge Pusher)
- whitelist للـ peers معروفة فقط
- Orthanc يعمل بـ network namespace مقيد

#### #6 — JWT Token Replay على Cloud Ingestion
**السيناريو:** هاكر يلتقط JWT صحيح ويعيد استخدامه من IP آخر.
**التخفيف:**
- JWT قصير العمر (15 دقيقة) + refresh token rotation
- Token binding على mTLS client cert hash
- DPoP (Demonstrating Proof-of-Possession) للحركات الحساسة

#### #7 — DICOM Zip Slip / Path Traversal
**السيناريو:** DICOM file بـ filename يحتوي `../../../etc/passwd` — Orthanc القديم كان عرضة.
**التخفيف:**
- Orthanc 1.12+ يحلّ هذا
- خط دفاع ثانٍ: AppArmor profile يحدّ Orthanc كتابة على `/var/lib/orthanc/` فقط

#### #8 — Ransomware على Edge Gateway
**السيناريو:** Ransomware يصيب الـ NUC في المركز، يشفّر كل DICOMs.
**التخفيف:**
- Backup تلقائي لـ Cloud كل ساعة (read-only snapshots)
- MinIO Object Lock في WORM mode
- Edge OS = Talos Linux أو Ubuntu Core (immutable)
- لا executable runtime على Gateway (Docker فقط)

#### #9 — Cross-Tenant Data Leak (SaaS Bug)
**السيناريو:** Bug في query يكشف فحص مريض من مستشفى A لمستخدم في مستشفى B.
**التخفيف:**
- Row-Level Security في PostgreSQL إلزامي على كل جدول يحوي PHI
- Tenant_id في كل JWT + automatic injection في كل query
- اختبار automated في CI: عميل tenant A لا يستطيع query بيانات tenant B

#### #10 — AI False Negative → Medical Liability
**السيناريو:** AI Triage يفوّت نزيف حاد، طبيب يثق به ويتأخر التشخيص، المريض يموت/يتضرر.
**التخفيف (مزيج تقني + قانوني):**
- AI **مساعد لا بديل** — كل واجهة تذكّر الطبيب صراحة
- Mandatory human sign-off — AI لا يمكنه إغلاق تقرير
- Audit log: "AI flagged ✗ / Doctor confirmed ✓" مع timestamp
- تأمين مسؤولية مهنية + Medical AI E&O insurance قبل أول عميل
- Confidence thresholds: حالات <85% confidence لا تُصنَّف "طبيعية" مطلقاً

---

## 3. التشفير على 3 طبقات

### 3.1 At-Rest (DICOM + Metadata)

| الطبقة | الخوارزمية | إدارة المفاتيح |
|--------|------------|----------------|
| DICOM في MinIO (Edge) | AES-256-GCM | مفتاح per-tenant مُشتق من master key محلي + KMS pull عند الإقلاع |
| DICOM في R2 (Cloud) | AES-256-GCM (R2 SSE-C) | مفتاح per-tenant في **HashiCorp Vault** (KMS-backed) |
| PostgreSQL TDE | AES-256 | Native PostgreSQL 16 + WAL encryption |
| Field-level (اسم/قومي) | AES-256-SIV | pgcrypto + key in Vault — deterministic لـ search-by-equality |

**لماذا Vault بدلاً من AWS KMS أو HSM:**
- يعمل multi-cloud (Hetzner + Oracle KSA + AWS Bahrain)
- مفتوح المصدر، نتحكم بالـ ops
- يدعم Transit secrets engine (encryption-as-a-service)

**KMS لـ MVP:** Vault على VM منفصلة + auto-unseal عبر Cloudflare Workers + Backup Splits (Shamir 5-of-3).

### 3.2 In-Transit

| القناة | البروتوكول | تفصيل |
|--------|------------|--------|
| Edge → Cloud | mTLS 1.3 | شهادات per-tenant من **Smallstep CA** (self-hosted) — Let's Encrypt لا يدعم client auth |
| Modality → Orthanc | DICOM TLS | TLS 1.2+ على Port 11112 (Orthanc يدعم منذ 1.6) |
| Browser → Cloud | TLS 1.3 + HSTS | Cloudflare يفرض + HPKP via security headers |
| Service-to-Service (داخل cluster) | mTLS via Linkerd | Service Mesh خفيف، أبسط من Istio |

**Smallstep step-ca لماذا:**
- مفتوح المصدر، خفيف
- يدعم ACME protocol → تجديد تلقائي
- يدعم mTLS برسائل قصيرة العمر (24 ساعة) — لا renvocation list ضخمة

### 3.3 Field-Level (Database)

| الحقل | الخوارزمية | مكتبة |
|-------|------------|--------|
| PatientName | AES-256-SIV (deterministic) | `pgcrypto` |
| NationalID | AES-256-SIV + HMAC-SHA256 lookup | `pgcrypto` + custom function |
| Phone | AES-256-GCM (random IV) | `pgcrypto` |
| ReportText (تقرير عربي) | AES-256-GCM | `pgcrypto` |

**ملاحظة:** البحث عن مريض بـ ID مشفر يحتاج deterministic encryption (SIV). للحقول التي لا نبحث فيها، نستخدم GCM (أقوى).

---

## 4. Audit Log المعمارية

### 4.1 المبدأ
كل **قراءة وكتابة لبيانات صحية محمية (PHI)** تُسجَّل. السجل **غير قابل للتعديل** ويُحتفظ به **7 سنوات** (HIPAA 164.316(b)(2)(i)).

### 4.2 شكل السجل (JSON Schema)

```json
{
  "$schema": "https://midcine.io/schemas/audit-v1.json",
  "type": "object",
  "required": ["ts", "request_id", "actor", "action", "resource", "outcome"],
  "properties": {
    "ts": {"type": "string", "format": "date-time"},
    "request_id": {"type": "string", "format": "uuid"},
    "tenant_id": {"type": "string"},
    "actor": {
      "type": "object",
      "properties": {
        "user_id": {"type": "string"},
        "role": {"enum": ["super_admin","owner","doctor","technician","read_only"]},
        "ip": {"type": "string"},
        "user_agent": {"type": "string"},
        "auth_method": {"enum": ["password","oidc","mtls"]}
      }
    },
    "action": {"enum": [
      "view_study","download_dicom","modify_report","sign_report",
      "delete_patient","grant_access","ai_inference","export_audit"
    ]},
    "resource": {
      "type": "object",
      "properties": {
        "type": {"enum": ["study","series","patient","report","model"]},
        "id": {"type": "string"},
        "patient_id_hash": {"type": "string"}
      }
    },
    "outcome": {"enum": ["success","denied","error"]},
    "extra": {"type": "object"}
  }
}
```

### 4.3 التخزين والـ Immutability

```
Application → PostgreSQL (audit table, RLS)
                   │
                   ▼
            Async ship → Loki (real-time observability)
                   │
                   ▼
            Daily snapshot → R2 with Object Lock (WORM, 7 years)
                   │
                   ▼
            Monthly Merkle tree hash → public S3 + Twitter (public attestation)
```

- PostgreSQL: استعلامات سريعة لآخر 90 يوم
- Loki: dashboards + alerting
- R2 WORM: الأرشيف القانوني (لا يُعدَّل)
- Merkle hash نشر عام: إثبات عدم التلاعب (transparency log أسلوب)

### 4.4 ما يجب تسجيله بالتفصيل

- ✅ كل وصول لـ DICOM (حتى مجرد thumbnail)
- ✅ كل تعديل على تقرير
- ✅ كل إصدار rRBAC grant/revoke
- ✅ كل AI inference (نموذج، إصدار، confidence)
- ✅ كل export/download/print
- ✅ كل فشل تسجيل دخول

---

## 5. RBAC تفصيلي

### 5.1 المكتبة: **Casbin**

| البديل | لماذا رُفض |
|--------|-----------|
| OPA (Open Policy Agent) | Overkill لـ MVP — يحتاج deployment منفصل + Rego learning curve |
| Custom code | يفقد ميزات Casbin: HRBAC, ABAC, audit ready |
| Cerbos | جيد لكن مجتمع أصغر |

**Casbin يدعم:** RBAC + HRBAC (مع تسلسل أدوار) + ABAC (attributes للسياق).

### 5.2 الأدوار الخمسة

```
SuperAdmin (midcine team)
   └── Owner (مدير المركز/المستشفى)
         └── Doctor (طبيب أشعة موقّع)
               └── Technician (فني)
                     └── ReadOnly (محاسب، تأمين)
```

### 5.3 مثال Policy (Casbin)

```python
# casbin model.conf
[request_definition]
r = sub, obj, act, ctx

[policy_definition]
p = sub, obj, act, eft

[role_definition]
g = _, _

[policy_effect]
e = some(where (p.eft == allow)) && !some(where (p.eft == deny))

[matchers]
m = g(r.sub.role, p.sub) && \
    r.obj.tenant == r.sub.tenant && \
    keyMatch(r.obj.type, p.obj) && \
    r.act == p.act && \
    (p.sub != "doctor" || r.ctx.hours == "work_hours")
```

```csv
# policy.csv
p, super_admin, /*,            *,         allow
p, owner,      /studies/*,    view,      allow
p, owner,      /reports/*,    sign,      deny
p, doctor,     /studies/*,    view,      allow
p, doctor,     /reports/*,    sign,      allow
p, doctor,     /patients/*,   delete,    deny
p, technician, /studies/*,    upload,    allow
p, technician, /reports/*,    view,      allow
p, read_only,  /reports/*,    view,      allow
p, read_only,  /studies/*,    download,  deny

g, dr_ahmed,   doctor
g, dr_sara,    doctor
g, mona_tech,  technician
```

### 5.4 طبقات إضافية (Defense in Depth)

- **Row-Level Security (PostgreSQL):** ضمان أن استعلام مباشر للـ DB يحترم tenant_id
- **API Gateway claims validation:** قبل وصول الطلب للسرفر
- **OHIF client-side hiding:** لا يكفي وحده، لكن يحسن UX

---

## 6. CI/CD الآمن (Secure Pipeline)

### 6.1 الأدوات المختارة

| المرحلة | الأداة | السبب |
|---------|--------|-------|
| SAST | **Semgrep** (community + custom rules) | أسرع من SonarQube، rules مخصصة لـ FastAPI/Python |
| DAST | **OWASP ZAP** (automated baseline) | مجاني، CI-friendly، Burp لاحقاً للتدقيق اليدوي |
| SCA (deps) | **Trivy** | يدعم Python/Node/Go/Rust + container image في أداة واحدة |
| Container scan | **Trivy** + **Grype** | Trivy للسرعة، Grype للـ deep policy |
| Secret scan | **gitleaks** + **trufflehog** | gitleaks للـ CI، trufflehog historical |
| IaC scan | **Checkov** | Terraform + Docker + K8s manifests |
| License compliance | **FOSSA Lite** أو **Licensee** | GPL على Orthanc يحتاج تتبع |
| SBOM | **syft** | معيار CycloneDX + SPDX |

### 6.2 GitHub Actions Workflow (نموذج كامل)

```yaml
# .github/workflows/security.yml
name: Security Pipeline

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main]

permissions:
  contents: read
  security-events: write
  pull-requests: write

jobs:
  secret-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITLEAKS_LICENSE: ${{ secrets.GITLEAKS_LICENSE }}

  sast:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: returntocorp/semgrep-action@v1
        with:
          config: >-
            p/owasp-top-ten
            p/python
            p/javascript
            p/dockerfile
            r/midcine.custom

  sca-deps:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          severity: 'CRITICAL,HIGH'
          ignore-unfixed: true
          format: 'sarif'
          output: 'trivy-fs.sarif'
      - uses: github/codeql-action/upload-sarif@v3
        with: { sarif_file: 'trivy-fs.sarif' }

  container-scan:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: aquasecurity/trivy-action@master
        with:
          image-ref: 'ghcr.io/midcine/edge-pusher:${{ github.sha }}'
          severity: 'CRITICAL,HIGH'
          exit-code: '1'

  iac-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: bridgecrewio/checkov-action@master
        with:
          directory: infra/
          framework: terraform,dockerfile,kubernetes

  sbom:
    runs-on: ubuntu-latest
    needs: build
    steps:
      - uses: anchore/sbom-action@v0
        with:
          image: 'ghcr.io/midcine/edge-pusher:${{ github.sha }}'
          format: 'cyclonedx-json'
          upload-artifact: true

  dast:
    if: github.event_name == 'push' && github.ref == 'refs/heads/develop'
    needs: deploy-staging
    runs-on: ubuntu-latest
    steps:
      - uses: zaproxy/action-baseline@v0.12.0
        with:
          target: 'https://staging.midcine.io'
          rules_file_name: '.zap/rules.tsv'
```

### 6.3 سياسة Gate (Blocking)
- ❌ أي CVE Critical = block merge
- ❌ Secret تم اكتشافه = block + auto-rotate
- ⚠️ High severity = يحتاج موافقة Security Reviewer
- ✅ Medium/Low = warning، يُسمح بالـ merge مع issue tracking

---

## 7. Incident Response Playbooks

### 7.1 تسريب بيانات مريض (PHI Breach)

**أول ساعة:**
1. عزل السبب (revoke tokens، disable user، block IP)
2. تأكيد النطاق (كم مريض؟ ما البيانات؟)
3. إخطار DPO + CTO + المحامي

**أول 24 ساعة:**
4. تجميد بكامل الـ container المتأثر للأدلة الجنائية الرقمية
5. تشغيل clean instance من backup سابق للحادث
6. صياغة بيان عام مبدئي

**أول 72 ساعة:**
7. إخطار المركز/المستشفى المتأثر رسمياً
8. إخطار مركز حماية البيانات المصري (إجباري قانوناً)
9. إخطار GDPR DPA إذا كان مواطن أوروبي
10. بدء تواصل مع المرضى المتأثرين

**خلال 30 يوم:**
11. Post-mortem كامل + RCA
12. تحديث threat model
13. إعادة تدقيق الـ CI/CD

### 7.2 Ransomware على Edge Gateway

**Immediate:**
- عزل Gateway عن الشبكة (Tailscale block)
- التحقق من backups الـ Cloud (آخر backup ≤ ساعة واحدة عادة)
- إبلاغ المركز بـ procedure manual (يقبلون DICOMs ورق/USB مؤقتاً)

**Recovery:**
- إعادة flash للجهاز من Talos Linux image نظيف
- استعادة الـ DICOMs من R2 (read-only WORM)
- التحقق من سلامة المفاتيح في Vault
- إعادة تشغيل خلال 4 ساعات (SLA الداخلي)

### 7.3 AI Triage يفوّت حالة نزيف

**Immediate:**
- توثيق الحالة (Anonymized)
- مراجعة فورية من Medical Advisory Board
- مراجعة confidence score والـ heatmap

**Investigation:**
- هل النموذج فشل أم الـ pipeline؟
- هل الـ pre-processing شوّه الصورة؟
- هل التحديث الأخير سبب regression؟

**Remediation:**
- إذا systematic: rollback لإصدار نموذج سابق فوراً
- تنبيه كل العملاء أن AI Triage في وضع human-only لمدة 48 ساعة
- إضافة الحالة لـ test suite منع تكرار

**Legal:**
- E&O insurance notification (24 ساعة)
- توثيق أن طبيب وقّع التقرير النهائي (responsibility transfer)

---

## 8. Bug Bounty Program (المرحلة 2)

> **نطلقه بعد 6 أشهر من production stable.**

### 8.1 المنصة: **Bugcrowd** (السبب: دعم عربي + medical experience)

### 8.2 النطاق
**In-Scope:**
- `*.midcine.io`
- Edge Gateway public surfaces (إذا وُجدت)
- Mobile app (لاحقاً)

**Out-of-Scope:**
- Social engineering لـ موظفي midcine أو الأطباء
- DoS testing
- الأنظمة الفرعية لشريك (HIS/EMR للمستشفى)

### 8.3 جدول المكافآت (USD)

| الفئة | Critical | High | Medium | Low |
|------|----------|------|--------|-----|
| RCE | $5,000 | — | — | — |
| Auth bypass | $3,000 | $1,500 | — | — |
| PHI exposure | $4,000 | $2,000 | $500 | — |
| XSS | — | $1,000 | $400 | $100 |
| CSRF | — | $800 | $300 | — |
| Info disclosure | — | $500 | $200 | $50 |

---

## 9. ملخص القرارات الأمنية في صف واحد

| القرار | الاختيار |
|--------|---------|
| TLS daemon | Caddy (تجديد تلقائي ACME) |
| mTLS CA | Smallstep step-ca self-hosted |
| Secrets manager | HashiCorp Vault |
| RBAC | Casbin |
| AppSec scanning | Semgrep + Trivy + Checkov |
| SBOM | syft (CycloneDX) |
| Audit storage | PostgreSQL + Loki + R2 WORM (7y) |
| Bug bounty | Bugcrowd (بعد 6 شهور) |
| Service mesh | Linkerd (أبسط من Istio) |
| Edge OS | Talos Linux (immutable) |
| Email/identity | SES + OIDC (Authentik) |
| Insurance | E&O Medical AI من شركة موصى بها |

</div>
