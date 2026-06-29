# mcp-bridge

**Replaces:** `services/ai-dispatcher` + `services/ai-aggregator` from v12 scaffolding.

**Purpose:** Bridge midcine pipeline to NEXUS-AI's 46 agents over MCP. When a new study arrives, this service:
1. Resolves `(modality, body_part)` to a list of NEXUS agent names via `config/dispatch_rules.yaml`
2. Invokes them in parallel through MCP transport (with pybreaker circuit-breakers — pattern from `docs/reference/v12-extracts/specialists_pattern.py`)
3. Aggregates results via consensus rule (pattern from `docs/reference/v12-extracts/aggregator_pattern.py`)
4. Returns a unified `AggregateResponse` with findings, confidence, disagreements, and `requires_human_review` flag

**Why bridge instead of native dispatcher:** Philosophy principle #1 — "NEXUS-AI is the brain of midcine". We do not duplicate the AI orchestration logic.

## File map (planned in Phase 2)

| File | Purpose |
|---|---|
| `app/main.py` | FastAPI entrypoint, 3 endpoints (`/dispatch`, `/aggregate`, `/health`) |
| `app/agents_client.py` | MCP client wrapper + pybreaker circuit-breakers |
| `app/dispatcher.py` | reads `dispatch_rules.yaml`, returns agent list for a study |
| `app/aggregator.py` | adapted from `v12-extracts/aggregator_pattern.py` |
| `app/schemas.py` | pydantic — adapted from `v12-extracts/aggregator_schemas.py` |
| `config/dispatch_rules.yaml` | `(modality, body_part) → [agent_name, ...]` mapping |

## Status

🚧 **Scaffold only (2026-06-29).** Implementation lands in Sprint 1 of `docs/13-BUILD-PLAN-v3.md`.
