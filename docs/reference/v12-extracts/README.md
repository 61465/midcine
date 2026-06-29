<div dir="rtl" lang="ar">

# v12 Extracts — أنماط محفوظة قبل حذف v12 scaffolding

**التاريخ:** 2026-06-29
**السبب:** حُذِفت `services/{ai-dispatcher, ai-aggregator, cloud-index, consent, tunnel-broker}` و `apps/{worklist, reader, patient, insights, connect, console, mobile}` كجزء من refactor v3. الأنماط أدناه يُعاد استعمالها في `services/mcp-bridge/` الجديد.

## الملفات

| الملف | المصدر | يُستعمل في | الفكرة المحفوظة |
|------|--------|-----------|----------------|
| `dispatch_rules.yaml` | `services/ai-dispatcher/config/` | `services/mcp-bridge/config/dispatch_rules.yaml` | مطابقة `modality + body_part → list of agents`، مع fallback `{}` |
| `specialists_pattern.py` | `services/ai-dispatcher/app/specialists.py` | `services/mcp-bridge/app/agents_client.py` | **pybreaker** circuit breaker (fail_max=3, reset 30s) + `asyncio.gather` fan-out — يُكيَّف لاستدعاء NEXUS-AI MCP بدل HTTP URLs |
| `aggregator_pattern.py` | `services/ai-aggregator/app/aggregator.py` | `services/mcp-bridge/app/aggregator.py` | consensus نمط: confidence avg + spread → `requires_human_review` flag + disagreement detection |
| `aggregator_schemas.py` | `services/ai-aggregator/app/schemas.py` | `services/mcp-bridge/app/schemas.py` | pydantic schemas: AggregateRequest/Response, Finding, Impression, Disagreement |

## ما لا يُحفَظ (حُذِف بالكامل)

- `services/cloud-index/` — cross-hospital PMI hash lookup (Phase 2)
- `services/consent/` — WhatsApp/SMS consent flow (Phase 2)
- `services/tunnel-broker/` — P2P mTLS broker (Phase 2)
- `apps/{worklist,reader,patient,insights,connect,console,mobile,viewer}/` — استبدلتها `apps/web/` بـ 7 routes

## git tag للاسترجاع
- `pre-v3-refactor-2026-06-29` — قبل أي حذف

</div>
