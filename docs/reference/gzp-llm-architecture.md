# GZP-LLM Architecture Decision

## القرار النهائي: Qwen2.5-7B-Instruct

### لماذا Qwen2.5-7B وليس غيره؟

| المعيار | Qwen2.5-7B | Llama-3.1-8B | Gemma-2-9B | Mistral-7B |
|---------|-----------|--------------|------------|------------|
| دعم العربية (أصلي) | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ |
| جودة الكود | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| Arabic MMLU | ~62% | ~45% | ~40% | ~38% |
| حجم Vocabulary عربي | 150k tokens | 128k | 256k | 32k |
| ترخيص | Apache 2.0 | Llama lic. | Gemma lic. | Apache 2.0 |
| يعمل على Kaggle T4 | ✅ بـ 4-bit | ✅ | ✅ | ✅ |

**Qwen2.5 هو الأفضل للعربية** لأن Alibaba دربه على بيانات عربية ضخمة منذ البداية.

## خطة الإصدارات:

### GZP-LLM v0.1 (MVP — أسبوع واحد على Kaggle)
- Base: `Qwen/Qwen2.5-1.5B-Instruct`
- Training: SFT فقط (لا DPO بعد)
- Data: 10,020 sample من aria_brain.db
- Goal: نموذج يعرّف نفسه بالعربية ويجيب بشكل معقول
- حجم GGUF: ~1.2GB (يعمل على أي جهاز)

### GZP-LLM v0.5 (الإصدار الحقيقي — أسبوعان)
- Base: `Qwen/Qwen2.5-7B-Instruct`
- Training: SFT (10k+ sample) + DPO (487 زوج) + identity anchoring
- Data: aria_brain.db + 50k synthetic Arabic
- Goal: يضرب في Arabic MMLU >45%, يكتب كوداً صحيحاً, يعرف هويته
- حجم GGUF: ~4.5GB (يعمل على أجهزة 8GB+)

### GZP-LLM v1.0 (الإطلاق الرسمي — شهر)
- Base: Qwen2.5-7B مع continual pre-training على corpus عربي
- Data: 500k+ عربي (CC100-ar + synthetic + aria_brain)
- Evaluation: Arabic MMLU, ArabicMT, code benchmarks
- نشر على HuggingFace: `GameZone/GZP-LLM-7B`

## التفاصيل التقنية:

```
GZP-LLM Architecture:
├── Base: Qwen2.5-7B-Instruct (transformer decoder)
│   ├── Layers: 28
│   ├── Hidden: 3584
│   ├── Heads: 28 (GQA: 4 KV heads)
│   ├── Context: 128k tokens
│   └── Vocab: 152,064 (يشمل عربي كامل)
├── Fine-tuning: LoRA
│   ├── rank: 64
│   ├── alpha: 128
│   ├── target: all linear layers (7 modules)
│   └── dropout: 0.05
├── Training stages:
│   ├── Stage 1: SFT على 50k+ عربي (5 epochs)
│   └── Stage 2: DPO على 500+ pair (3 epochs)
└── Export: GGUF q4_k_m (~4.5GB)
```

## المبدأ الأساسي:
> نحن لا نعيد تدريب نموذج — نحن **نعلّمه أن يكون مصرياً**
> نعلّمه كيف يفكر بالعربية، يبرمج بدقة، ويفخر بهويته.
