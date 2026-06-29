<div dir="rtl" lang="ar">

# Handoff G — Clinical LLM Service

> **المهمة:** خدمة AceGPT-13B fine-tuned تولّد مسودات تقارير عربية من قياسات MONAI + RAG.

---

## 1. Goal
بناء خدمة inference عربية: vLLM تخدم AceGPT-13B AWQ-quantized، مع RAG pipeline على ICD-11 + تقارير سابقة، تولّد مسودات تقارير عربية مهيكلة بناءً على قياسات AI Triage.

## 2. Scope

### داخل النطاق
- **LLM Inference Service** (vLLM 0.6+ + AceGPT-13B AWQ):
  - OpenAI-compatible API
  - Streaming responses
  - LoRA adapter management
- **RAG Pipeline** (Python + LangGraph أو custom):
  - Embedding: bge-m3 (self-hosted)
  - Vector search: pgvector HNSW
  - BM25: ParadeDB pg_search
  - Reranking: bge-reranker-v2-m3
  - Top-K=5
- **Report Drafting Service** (FastAPI):
  - يستهلك stream `reports:draft_request`
  - يجمع: قياسات + RAG context + system prompt
  - يستدعي vLLM
  - يخزن draft + sources used
  - ينشر event `reports:draft_ready`
- **Chat Endpoint** للـ Viewer LLM panel:
  - WebSocket streaming
  - Conversation history per study
- **Knowledge Indexing Pipeline**:
  - ICD-11 معرّب → 54,000 chunk
  - Past reports → continuous ingestion
  - Embedding generation
- **Evaluation Suite**:
  - RAGAS Arabic adapter
  - Golden dataset (100 reports) automated tests
  - Human-eval workflow integration

### خارج النطاق
- ❌ AI Triage (Handoff F)
- ❌ Fine-tuning runs (يحدث offline على cloud GPU rental)
- ❌ Continuous learning automation (Quarterly manual cycle بدلاً منه)

## 3. Tech Spec

```yaml
Python: 3.12
PyTorch: 2.4+
vLLM: 0.6+
transformers: 4.45+
peft: 0.13+ (LoRA loading)
sentence-transformers: 3+ (bge-m3)
FlagEmbedding: 1.3+ (bge-reranker)
FastAPI: 0.115+
asyncpg: 0.30+ (pgvector queries)
ragas: latest + custom Arabic adapter
prometheus-client: للـ metrics
```

### Hardware
- Production: RTX 6000 Ada (48GB) — مشتركة مع AI Worker via MIG
- VRAM budget: ~11GB للـ LLM AWQ-4bit، ~2GB للـ embedding model
- Dev: A10G أو RTX 4090 24GB

## 4. APIs / Interfaces

### Report Drafting (Stream Consumer)
```json
Stream: reports:draft_request
Input: {
  "study_uid": "...",
  "tenant_id": "...",
  "patient_context": {
    "age": 67,
    "sex": "M",
    "clinical_indication": "صداع مفاجئ شديد"
  },
  "ai_measurements": { ... },  // من AI Worker
  "prior_report_id": "..."  // optional
}

Stream: reports:draft_ready
Output: {
  "study_uid": "...",
  "draft_text_ar": "## التقنية المستخدمة\n...",
  "icd11_codes": ["8B00.0"],
  "confidence_overall": 0.87,
  "sources_used": [
    {"type": "icd11", "id": "8B00.0"},
    {"type": "template", "id": "egy_radio_template_v3"}
  ],
  "model_version": "midcine-llm-v1.0",
  "generation_time_ms": 6800
}
```

### Chat Endpoint (للـ Viewer LLM Panel)
```
POST /api/v1/llm/chat
Body: {
  "study_uid": "...",
  "messages": [
    {"role": "user", "content": "أعد صياغة هذه الجملة بشكل أقصر"},
    ...
  ]
}
Response: SSE stream of tokens
```

### Knowledge Indexing API
```http
POST /api/v1/knowledge/index
Body: {
  "source_type": "icd11" | "past_report" | "template",
  "documents": [...]
}
```

## 5. Inputs Provided

```
VLLM_MODEL=midcine/acegpt-13b-radiology-awq
LORA_ADAPTER_PATH=s3://midcine-models/lora/v1.0/
HF_TOKEN=...  (للـ base model download)
DATABASE_URL=postgresql+asyncpg://...
REDIS_URL=...
S3_ENDPOINT=...
CUDA_VISIBLE_DEVICES=0
GPU_MEMORY_FRACTION=0.4  (mShared with AI Worker)
```

### Datasets
- ICD-11 معرّب JSON (من midcine team — معالج مسبقاً)
- 5,000 anonymized تقرير أشعة عربي (من Pilot شركاء)
- 50 قالب تقرير معتمد من نقابة الأطباء (PDF → text)
- DPO preference pairs initial seed (200 زوج yدوي)

## 6. Acceptance Criteria

- [ ] Draft generation latency P95 ≤8s لتقرير 300 token
- [ ] Throughput ≥8 concurrent requests على RTX 6000 Ada (AWQ)
- [ ] BERTScore-Arabic vs golden ≥0.85 (test set 100 تقرير)
- [ ] Hallucination rate ≤5% (human-eval على عينة 50)
- [ ] ICD-11 code accuracy ≥90%
- [ ] RAG retrieval relevance (top-5 precision) ≥0.75
- [ ] OHIF LLM panel chat streaming يعمل بدون انقطاع
- [ ] LoRA hot-swap بدون GPU restart

## 7. Definition of Done

- ✅ كود في `services/llm-service/`
- ✅ vLLM deployment config + Triton يدعم MIG
- ✅ Evaluation suite يعمل في CI nightly
- ✅ Model card موثّق (limitations، biases، intended use)
- ✅ Runbook لـ OOM، slow inference، wrong outputs
- ✅ Audit log لكل LLM inference (prompt, response, sources, model_version)
- ✅ Disclaimer template جاهز لكل draft ("AI draft، يحتاج مراجعة طبيب")

## 8. Timeline
**3 أسابيع.**

| Sprint | Output |
|--------|--------|
| W1 | vLLM serving AceGPT-13B AWQ، basic prompt → response |
| W2 | RAG pipeline كامل + Knowledge indexing + Reports draft service |
| W3 | Chat endpoint + Evaluation suite + Hardening + Model card |

## 9. Risks

| الخطر | تخفيف |
|------|--------|
| AceGPT-13B عربيته الطبية ضعيفة بدون fine-tune | الاعتماد على RAG كثيف في MVP، fine-tune في Sprint منفصل |
| vLLM AWQ یحتاج build خاص لـ AceGPT | تجريب مبكر في W1، fallback لـ Q4_K_M (llama.cpp) لو فشل |
| Hallucinations في domain طبي | strict system prompt + RAG citations إلزامية + low temperature (0.3) |
| GPU sharing مع AI Worker conflicts | MIG configuration واضح + monitoring VRAM لكل service |

</div>
