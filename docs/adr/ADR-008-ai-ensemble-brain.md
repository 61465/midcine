<div dir="rtl" lang="ar">

# ADR-008: AI Ensemble Brain (عقل واحد متعدد النماذج)

- **الحالة:** مقبول
- **التاريخ:** 2026-06-18
- **القرار:** عبد الرحمن
- **يُلغي:** الجزء المتعلّق بـ "نموذج Triage واحد" في ADR-007

## السياق

الأنظمة المنافسة (Aidoc، Rapid AI، Viz.ai) تبيع نماذج AI كـ منتجات منفصلة. الطبيب يشتري 5 نماذج → 5 dashboards → 5 reports يدمجها يدوياً. لا أحد يقدّم **عقلاً واحداً موحّداً** للأشعة.

ندينا فرصة وميزة تنافسية جوهرية: بناء dispatcher + aggregator يجعل الـ ensemble يبدو للطبيب كعقل واحد يفكّر.

## القرار

نبني **AI Ensemble Brain** بثلاث طبقات:

```
                   ┌─────────────────────────────────┐
                   │  Dispatcher (Router Service)    │
                   │  Rules: modality + body_part +  │
                   │  patient_age + indication       │
                   └────────────┬────────────────────┘
                                │
        ┌───────────┬───────────┼───────────┬───────────┐
        ▼           ▼           ▼           ▼           ▼
   Vision       Detection   Segmenta-   Vision-      Clinical
   Classifier   (lesions,   tion        Language     LLM
   (TorchXRay)  nodules)    (HU/MONAI)  (Qwen-VL)    (qwen2.5
                                                      +RAG)
        │           │           │           │           │
        └───────────┴───────────┴───────────┴───────────┘
                                │
                   ┌────────────▼────────────────────┐
                   │  Aggregator (LLM Orchestrator)  │
                   │  - Consensus check              │
                   │  - Conflict flagging            │
                   │  - Uncertainty propagation      │
                   │  - Citation tracking            │
                   └────────────┬────────────────────┘
                                │
                                ▼
                       تقرير موحّد مع:
                       • النتائج لكل نموذج (شفافية)
                       • Confidence aggregate
                       • Disagreements مرفوعة للطبيب
                       • Citations [ICD-11] + [model_v]
```

## القرارات الفرعية

### 8.1 Dispatcher Implementation
- **خدمة FastAPI صغيرة** في `services/ai-dispatcher/`
- routing rules في `config/dispatch_rules.yaml`:
  ```yaml
  - match: { modality: "CR", body_part: "CHEST" }
    models: [torchxrayvision, segmentation_lung, vlm_describe, clinical_llm]
  - match: { modality: "CT", body_part: "BRAIN" }
    models: [monai_hemorrhage, segmentation_brain, vlm_describe, clinical_llm]
  ```
- parallel inference عبر `asyncio.gather()` + `httpx.AsyncClient`
- timeout per model: 30s، failure isolation (نموذج يفشل لا يوقف الباقي)

### 8.2 Specialist Models (Sprint 4-12)
| النموذج | Sprint | Hardware | Modality |
|---------|--------|----------|----------|
| TorchXRayVision densenet121 | 4 | CPU | Chest X-ray |
| Segmentation (HU + SAM2) | 5 | CPU | الكل |
| Qwen2-VL 7B (vision-language) | 6 | GPU rental | الكل |
| Clinical LLM (qwen2.5:14b + RAG) | 7 | GPU rental | الكل |
| MONAI Brain Hemorrhage | 12 | GPU | Brain CT |
| Mammography (mod-future) | post-MVP | GPU | Mammo |

### 8.3 Aggregator Logic
- Aggregator = LLM call مع system prompt مهيكل
- Input: JSON منظّم بـ outputs كل نموذج + confidences + uncertainties
- Output schema (Pydantic):
  ```python
  class EnsembleReport(BaseModel):
      findings: list[Finding]
      impressions: list[Impression]
      recommendations: list[str]
      model_consensus: dict[str, float]  # 0-1 per model
      disagreements: list[Disagreement]
      overall_confidence: float
      requires_human_review: bool  # True لو disagreement عالي
      citations: list[Citation]
  ```
- Disagreement threshold: لو نموذجان يختلفان > 0.3 في confidence → flag صريح للطبيب

### 8.4 Cost Control
- نماذج CPU (TorchXRayVision، segmentation HU) تعمل دائماً
- نماذج GPU (VLM، Clinical LLM) تعمل **بـ batch مجدولة** كل 15 دقيقة، ليس realtime
- realtime path للحالات P1 (critical) فقط
- routing rule: لو `priority=P1` → استدعاء GPU فوراً، لو `P3-P5` → batch queue

### 8.5 Shadow Mode + A/B
- نموذج جديد يعمل في **shadow mode** 14 يوماً (نتيجته لا تُعرض، فقط تُسجّل)
- لو agreement مع النماذج القديمة > 85% → promote للـ canary 10%
- لو > 90% × 14 يوم → promote للـ production

### 8.6 Transparency للطبيب
في الـ UI:
```
┌─────────────────────────────────────────┐
│ تقرير الذكاء الاصطناعي                  │
├─────────────────────────────────────────┤
│ النتيجة: التهاب رئوي محتمل (78%)        │
│                                          │
│ التفصيل:                                 │
│ ◉ TorchXRayVision: 0.82 (consolidation) │
│ ◉ VLM (Qwen2-VL): يصف "كثافة في الفص"  │
│ ⚠ Segmentation: لم يحدد منطقة واضحة    │
│                                          │
│ ⚠ تنبيه: عدم اتفاق بين النماذج —       │
│   راجع الشرائح يدوياً                   │
│                                          │
│ المراجع:                                 │
│ • ICD-11: CA40.0 (Pneumonia)            │
│ • Model versions: txrv-1.2, vlm-0.4     │
└─────────────────────────────────────────┘
```

## النتائج المتوقعة

### إيجابي
- **شفافية:** الطبيب يثق لأنه يرى كل نموذج قال ماذا
- **توسعية:** إضافة نموذج جديد = config + service، لا re-architecture
- **Fallback:** نموذج فشل → الباقي يكمل (uptime أعلى)
- **Cost-aware:** GPU للضرورة فقط
- **ميزة بيع:** "عقل واحد بدلاً من 5 dashboards" — لا منافس عربي

### سلبي
- **زمن استجابة أعلى** من نموذج واحد (+3-5s للـ aggregation)
- **تعقيد debugging:** structured logging per-model إجباري
- **Aggregator hallucination risk:** نخفّفها بـ schema strict + citations forced

## البدائل المرفوضة

- **نموذج واحد كبير (MedGemini-like):** غير متاح open، تكلفة GPU عالية، صندوق أسود
- **Pipeline تسلسلي:** أبطأ + فشل نموذج يوقف الكل
- **MoE في نموذج واحد:** يتطلب pre-training من الصفر، خارج النطاق

## التنفيذ — ربط بالـ Sprints

- **Sprint 4:** Dispatcher + TorchXRayVision + Segmentation HU + Aggregator stub
- **Sprint 5:** RAG integration في Clinical LLM
- **Sprint 6:** Qwen2-VL على GPU rental
- **Sprint 7:** Full ensemble + Shadow mode framework
- **Sprint 12:** MONAI Brain Hemorrhage إضافة
- **post-MVP:** نموذج Mammography + Continuous Learning Loop

</div>
