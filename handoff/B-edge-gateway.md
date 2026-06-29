<div dir="rtl" lang="ar">

# Handoff B — Edge Gateway Bundle

> **المهمة:** Docker bundle يعيش داخل المستشفى، يستقبل DICOM، يضغط، يبث للسحاب.

---

## 1. Goal
بناء حزمة Docker Compose موحّدة `midcine-edge-bundle` تُنصَّب على Intel NUC داخل مركز الأشعة، تستقبل DICOM من الأجهزة وتبثّها لـ Cloud Ingestion API بكفاءة.

## 2. Scope

### داخل النطاق
- Orthanc 1.12+ مع plugins: PostgreSQL، S3/MinIO، Authorization
- Edge Pusher service (FastAPI + Python 3.12):
  - يستقبل webhook من Orthanc عند وصول study جديد
  - يضغط Pixel Data بـ HTJ2K
  - يبثّ الـ chunks لـ Cloud عبر WebSocket mTLS
- MinIO instance محلي
- Redis 7 للـ buffer queue
- Traefik 3 كـ reverse proxy + mTLS termination
- Docker Compose ملف واحد + `.env.example`
- `install.sh` script لتنصيب bundle من الصفر على Ubuntu 24.04
- `update.sh` للتحديث الآمن (lossless)

### خارج النطاق
- ❌ AI inference على Edge (هذا في الحزمة F، يبقى في السحاب)
- ❌ Web UI على Edge (الإدارة عبر Cloud only)
- ❌ Hardware procurement (نحن نوثّق BOM فقط)

## 3. Tech Spec

```yaml
# Stack:
Orthanc: 1.12.4+ (orthancteam/orthanc:24.x)
Orthanc plugins:
  - postgresql: latest
  - s3-object-storage: latest (compile from source)
  - authorization: latest

Python: 3.12
FastAPI: 0.115+
pydicom: 2.4+
pylibjpeg: 2.0+ (with libjpeg + openjpeg)
pylibjpeg-libjpeg: للـ HTJ2K
websockets: 13+
redis-py: 5+

MinIO: latest stable (LTS)
Redis: 7.4-alpine
Traefik: 3.2+
```

## 4. APIs / Interfaces

### Orthanc DICOM Endpoint (Inbound)
- DICOM C-STORE على `port 11112`
- AET whitelist مفعّل (يُقرأ من `orthanc.json`)

### Edge Pusher API (Internal)
```http
POST /webhook/study-stable
Authorization: Bearer {ORTHANC_WEBHOOK_TOKEN}
Body: { "StudyInstanceUID": "..." }

GET /healthz
GET /metrics  (Prometheus format)
```

### Outbound to Cloud Ingestion (WebSocket)
```
wss://ingest.midcine.io/edge/{tenant_id}
Authentication: mTLS client certificate
Protocol:
  - First frame: { "type": "manifest", "study_uid": "...", "tenant_id": "...", "chunks": 42 }
  - Subsequent frames: binary chunks (HTJ2K-compressed pixel data + metadata JSON)
  - Final frame: { "type": "complete", "checksum": "sha256:..." }
```

## 5. Inputs Provided

```
من midcine (Doppler config: edge-template):
  TENANT_ID=mcr_alex_01
  TENANT_NAME="مركز الأشعة المتقدم - الإسكندرية"
  CLOUD_INGESTION_URL=wss://ingest.midcine.io
  MTLS_CERT_PEM (per tenant، يولّد من step-ca)
  MTLS_KEY_PEM
  ORTHANC_AUTH_PASSWORD
  POSTGRES_PASSWORD
  MINIO_ACCESS_KEY
  MINIO_SECRET_KEY
```

### Sample Data للاختبار
- 5 DICOM studies حقيقية (anonymized)، متاحة في `dev-data/sample-dicoms/`

## 6. Acceptance Criteria

- [ ] `docker compose up` يشغّل كل الـ services في <60 ثانية على NUC
- [ ] إرسال DICOM C-STORE بـ `dcmsend` يُحفظ في MinIO المحلي وينتقل لـ Cloud في <60s (P95) عند 5Mbps
- [ ] HTJ2K compression يخفّض الحجم بـ ≥65% بدون فقد
- [ ] Pusher يستأنف تلقائياً عند انقطاع الاتصال (resumable upload)
- [ ] Health endpoint يبلّغ status كل services في Cloud Monitoring
- [ ] `install.sh` ينصّب bundle على Ubuntu 24.04 fresh في <15 دقيقة
- [ ] استهلاك RAM إجمالي ≤4GB في idle، ≤8GB تحت ضغط
- [ ] Backup يومي تلقائي للـ MinIO إلى cloud R2

## 7. Definition of Done

- ✅ كود في `apps/edge-pusher/` + `infra/docker/edge/`
- ✅ tests: integration test يرسل DICOM ويتحقق وصوله للـ Cloud (mock)
- ✅ Dockerfile محسّن (multi-stage، image ≤300MB)
- ✅ `README.md` فيه: install, update, troubleshoot, BOM
- ✅ BOM hardware recommendation في `docs/edge-bom.md`
- ✅ CI ينجح: lint، type-check، unit tests، docker build

## 8. Timeline
**2 أسابيع.**

| Sprint | Output |
|--------|--------|
| W1 | Orthanc + MinIO + Postgres يعمل، DICOM يُستقبل ويُحفظ |
| W2 | Pusher يضغط ويبثّ، WebSocket mTLS، resumability، install.sh |

## 9. Risks

| الخطر | تخفيف |
|------|--------|
| Orthanc S3 plugin compile معقّد | استخدام image مبنية مسبقاً من `orthancteam/orthanc-s3` أو fallback FUSE mount |
| HTJ2K في pylibjpeg غير مستقر | fallback لـ JPEG 2000 Lossless العادي |
| WebSocket reconnect storm | exponential backoff + jitter |

</div>
