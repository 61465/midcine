<div dir="rtl" lang="ar">

# Handoff F — AI Worker (MONAI Triage)

> **المهمة:** خدمة Python تستهلك studies من Redis، تشغّل MONAI، تنتج overlays + قياسات.

---

## 1. Goal
بناء خدمة AI Triage تستهلك events من Redis Stream، تنزّل DICOMs، تشغّل نماذج MONAI، وتنتج DICOM GSPS overlays + JSON قياسات لتخزينها في R2 و PostgreSQL.

## 2. Scope

### داخل النطاق
- AI Worker service (Python 3.12 + asyncio)
- يستهلك stream `studies:new` من Redis
- ينزّل DICOMs من R2، يفك ضغط (مع pylibjpeg)
- يشغّل نموذجين:
  - **MONAI Bundle: brain_hemorrhage_ct** للـ CT brain
  - **TorchXRayVision** للـ Chest X-ray
- ينتج:
  - DICOM GSPS (Grayscale Softcopy Presentation State) overlay
  - JSON قياسات (`measurements_v1.json`)
  - Confidence scores + heatmap PNG
- يرفع النتائج لـ R2 + يحدّث PostgreSQL
- ينشر event `studies:ai_complete` للـ Ingestion
- Model registry: signed checkpoints in R2، hot reload عند update

### خارج النطاق
- ❌ Training نماذج جديدة (مشروع منفصل)
- ❌ LLM (Handoff G)
- ❌ MONAI Deploy MAP packaging (Phase 2)

## 3. Tech Spec

```yaml
Python: 3.12
PyTorch: 2.4+ (CUDA 12.x)
MONAI: 1.4+
TorchXRayVision: latest
pydicom: 2.4+
pylibjpeg: 2.0+
numpy: 2.0+
boto3: 1.35+
redis: 5+ (async)
prometheus-client: للـ metrics
dvc: 3+ (model versioning)
```

### Hardware Target (Hetzner)
- Production: GPU server مع NVIDIA RTX 6000 Ada (48GB) — مشاركة مع LLM (Handoff G)
- Dev: RTX 4000 SFF (20GB)

## 4. APIs / Interfaces

### Inbound (Redis Stream)
```json
Stream: studies:new
Message: {
  "study_uid": "1.2.840.113619...",
  "tenant_id": "mcr_alex_01",
  "modality": "CT",
  "body_part": "brain",
  "priority_hint": "normal",
  "received_at": "2026-06-07T10:23:00Z"
}
```

### Outbound (Redis Stream)
```json
Stream: studies:ai_complete
Message: {
  "study_uid": "1.2.840.113619...",
  "tenant_id": "mcr_alex_01",
  "models_run": ["brain_hemorrhage_ct"],
  "results": {
    "brain_hemorrhage_ct": {
      "detected": true,
      "confidence": 0.94,
      "hemorrhage_type": "parenchymal",
      "location": "right_frontal",
      "volume_cc": 14.2,
      "midline_shift_mm": 4.1,
      "overlay_s3_key": "ai/.../gsps_overlay.dcm",
      "heatmap_s3_key": "ai/.../heatmap.png",
      "model_version": "v1.2.3",
      "inference_time_ms": 8400
    }
  },
  "priority_assigned": "critical"
}
```

### Internal HTTP (لـ health + metrics)
```http
GET /healthz
GET /metrics  (Prometheus)
GET /models/loaded  (debugging)
```

## 5. Inputs Provided

```
REDIS_URL=...
S3_ENDPOINT=...
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_MODEL_BUCKET=midcine-models
S3_DATA_BUCKET=midcine-dicoms-prod
CUDA_VISIBLE_DEVICES=0
MODEL_REGISTRY_URL=https://models.midcine.io  # signed pull
MONAI_BUNDLE_BRAIN=brain_hemorrhage_ct@v1.2.3
TORCHXRAYVISION_MODEL=densenet121-res224-all
```

### Model Sources
- MONAI Bundle: `brain_hemorrhage_ct` (تحميل من MONAI Model Zoo، مؤرشف في R2)
- TorchXRayVision: `densenet121-res224-all` checkpoint (مؤرشف في R2)
- Sample test DICOMs: 20 CT brain (10 normal, 10 hemorrhage) + 20 chest X-ray

## 6. Acceptance Criteria

- [ ] CT brain inference: latency P95 ≤15s على RTX 6000 Ada
- [ ] Chest X-ray inference: P95 ≤4s
- [ ] DICOM GSPS overlay يُعرَض صحيحاً في OHIF v3
- [ ] Sensitivity ≥85% على عينة test 20 CT brain
- [ ] Specificity ≥75%
- [ ] Resumable عند failure (idempotent processing)
- [ ] Auto-recovery من OOM (شرّح dimensions أو fall to CPU)
- [ ] Model hot reload بدون downtime
- [ ] Audit log لكل inference مع model_version

## 7. Definition of Done

- ✅ كود في `services/ai-worker/`
- ✅ Dockerfile مع CUDA base image (≤4GB)
- ✅ Helm chart للـ K8s deployment (للمستقبل)
- ✅ tests: unit (≥70%)، integration على sample data
- ✅ Benchmark report موثّق (latency، throughput، VRAM)
- ✅ Model card لكل نموذج (input/output، limitations، biases)
- ✅ Runbook لـ "ماذا أفعل لو" — model fails، GPU OOM، queue backlog

## 8. Timeline
**2 أسابيع.**

| Sprint | Output |
|--------|--------|
| W1 | Worker framework + MONAI brain_hemorrhage يعمل end-to-end |
| W2 | Chest X-ray + GSPS overlay generation + benchmarks + hardening |

## 9. Risks

| الخطر | تخفيف |
|------|--------|
| MONAI bundle لا يدقّق على CT data للسوق المصري | benchmark على Pilot data في W2، تخطّط fine-tune لاحقاً |
| VRAM contention مع LLM | MIG (Multi-Instance GPU) أو time-slicing |
| pylibjpeg-libjpeg performance | تجربة DICOM-decoder بـ Rust كـ fallback |

</div>
