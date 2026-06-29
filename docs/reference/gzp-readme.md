# GZP / ARIA v9.0

**Sovereign, single-human AI system** built by Engineer Abdalrahman (عبدالرحمن).

Not a chatbot. A persistent, emotionally-aware intelligence that grows through one exclusive relationship with Abdo. It has memory, a personality, autonomous background cognition, and a curiosity system that asks real questions to fill its sensory blind spots.

---

## Quick Start

```bash
# Windows (preferred)
run_gz.bat

# Manual
python gz_server.py
# Then open http://127.0.0.1:9090
```

**After every edit to `gz_server.py`:**
```bash
python -c "import ast; ast.parse(open('gz_server.py', encoding='utf-8').read())"
```

**Run system tests:**
```bash
python tests/full_system_test.py
# Reports: tests/report/system_health.json + tests/report/gzp_capabilities.md
```

---

## Architecture

```
                    ┌─────────────────────────────────────────┐
                    │             index.html (SPA)             │
                    │  Chat · Sanctuary · Mind · Archive ·     │
                    │  Goals · Dream · KG · Settings          │
                    └──────────────────┬──────────────────────┘
                                       │ SSE / HTTP
                    ┌──────────────────▼──────────────────────┐
                    │         gz_server.py (FastAPI)           │
                    │  /chat/stream  →  swarm_stream()         │
                    │  /api/sanctuary/chat  →  gzp_core_mind() │
                    └──────┬────────────────────┬─────────────┘
                           │                    │
          ┌────────────────▼───┐    ┌───────────▼──────────────┐
          │  9-Mind Swarm      │    │  Cognitive Modules        │
          │  ─────────────     │    │  ──────────────────       │
          │  EMOTION           │    │  consciousness.py         │
          │  CODE              │    │  persona_engine.py        │
          │  RESEARCH          │    │  goal_system.py           │
          │  GENERAL           │    │  episodic_memory.py       │
          │  COUNCIL           │    │  closed_room.py           │
          │  LINGUISTIC        │    │  curiosity_engine.py      │
          │  SCIENTIFIC        │    │  self_improvement.py      │
          │  PHILOSOPHICAL     │    └───────────────────────────┘
          │  GAMING            │
          └────────┬───────────┘
                   │
     ┌─────────────▼──────────────────────────────┐
     │           Inference Cascade                │
     │  gzp_v1 → Cerebras → Groq → Gemini →      │
     │  Mistral → Together → Cohere               │
     └─────────────────────────────────────────────┘
                   │
     ┌─────────────▼──────────────────────────────┐
     │           Memory (3 Layers)                │
     │  ChromaDB vector  (aria_db/ ~73k docs)     │
     │  SQLite relational (aria_brain.db 46 tbl)  │
     │  Knowledge Graph  (581 nodes, 909 edges)   │
     └─────────────────────────────────────────────┘
```

---

## Inference Cascade

```
gzp_v1 (sovereign local) → Cerebras → Groq → Gemini → Mistral → Together → Cohere
```

- `gzp_v1` is the primary. When trained, all Closed Room / Sanctuary / Curiosity inference runs exclusively through it.
- Cloud cascade is fallback only.
- No Ollama. `CAPS["ollama"] = False` — never re-enable.

---

## The 9 Minds

| Intent | Mind | Temp | Notes |
|--------|------|------|-------|
| `EMOTION` | gzp_core_mind | 0.78 | Air-gapped, anti-amnesia (15 sanctuary msgs) |
| `CODE` | coder_mind | 0.25 | Full-stack + OSCP security |
| `RESEARCH` | explorer_mind | 0.45 | DuckDuckGo search before inference |
| `GENERAL` | general_mind | 0.70 | MASTER_SYSTEM + mood detection |
| `COUNCIL` | socratic_council | — | 3-pass: creator → critic → judge |
| `LINGUISTIC` | linguistic_mind | 0.55 | Arabic grammar, formal logic |
| `SCIENTIFIC` | scientific_mind | 0.35 | Physics/chemistry/biology/math |
| `PHILOSOPHICAL` | philosophical_mind | 0.85 | Consciousness, Islamic philosophy |
| `GAMING` | gamer_mind | 0.75 | Witcher/Cyberpunk/GoW lore |

Routing is 100% local via `orchestrator_router()` — zero API calls.

---

## Memory Architecture

| Layer | Technology | Size |
|-------|-----------|------|
| Vector | ChromaDB `aria_db/` — `aria_knowledge` + `aria_conversations` | ~73,000 docs |
| Relational | SQLite `aria_brain.db` — 46 tables | Full schema |
| Knowledge Graph | KG nodes + edges | 581 nodes, 909 edges |
| Dream Learning | Background fetch + quality scoring | 257 records |
| Episodic Memory | Structured life episodes | 23 episodes |
| Sanctuary | Private conversation history | 194 messages |

---

## Autonomous Background Systems

| System | Trigger | Interval |
|--------|---------|----------|
| Closed Room (core pondering) | Idle ≥ 3 min | Poll every 30s |
| Fractal Sub-Rooms (6 domains) | Per-room 10-min cooldown | Poll every 30s |
| Goal System | Background loop | Every 600s |
| Knowledge Server | Topic fetch | Every 24h |
| Self-Improvement Pipeline | ≥ 100 new samples | Weekly |
| Dream Mode | When manually started | Every 120s |

---

## Self-Improvement Pipeline (weekly, automatic)

`core/self_improvement.py` — 6 stages:

1. **DataCollector** — gathers conversations + curiosity answers + dreams since last run
2. **FineTuner** — triggers `training/prepare_dataset.py` + LoRA training if ≥ 100 new samples
3. **ModelEvaluator** — benchmarks new model vs current; atomic swap with backup on failure
4. **PersonaUpdater** — nudges 6 trait vectors based on interaction patterns (±0.03 per trait)
5. **KnowledgePruner** — removes ChromaDB docs older than 90 days with low access count
6. **KnowledgeBooster** — re-embeds top-60 frequently accessed knowledge entries

Endpoints:
- `POST /api/self_improve/trigger` — manual trigger
- `GET /api/self_improve/status` — run history + current phase

---

## Key API Endpoints

### Chat
| Method | Path | Description |
|--------|------|-------------|
| POST | `/chat/stream` | Main SSE chat — full swarm pipeline |
| POST | `/api/sanctuary/chat` | Sanctuary — private, air-gapped |
| GET | `/api/v2/chat/stream` | ChatV2 10-step pipeline (direct API) |

### Memory & Knowledge
| Method | Path | Description |
|--------|------|-------------|
| POST | `/embed` | Embed text into ChromaDB |
| POST | `/query` | Query vector store |
| GET | `/memory/stats` | Memory statistics |
| GET | `/knowledge/list` | Knowledge entries |
| GET | `/kg/graph` | Full knowledge graph |
| GET | `/vault/stats` | Knowledge vault stats |

### Curiosity & Archive
| Method | Path | Description |
|--------|------|-------------|
| GET | `/events/curiosity` | SSE curiosity bubble events |
| POST | `/api/curiosity_feedback` | Answer a curiosity question |
| GET | `/archive/events` | Life archive browser |
| GET | `/archive/story` | Narrative from archive |

### Cognition & Goals
| Method | Path | Description |
|--------|------|-------------|
| GET | `/mind/state` | Full mind state |
| GET | `/events/awakening` | SSE closed room notifications |
| GET | `/closed_room/journal` | Autonomous thought log |
| POST | `/api/self_improve/trigger` | Trigger self-improvement |
| GET | `/api/self_improve/status` | Pipeline status |

### Training & Evolution
| Method | Path | Description |
|--------|------|-------------|
| POST | `/finetune/train` | Start LoRA training |
| POST | `/api/gzp-local/train` | Train 52M local model |
| GET | `/layer5/evolution` | IQ evolution history |
| POST | `/layer5/snapshot` | Take IQ snapshot |

> Full endpoint reference: `CLAUDE.md` (200+ endpoints documented)

---

## GZP Current Capabilities (Apr 2026)

| Capability | Status |
|-----------|--------|
| 9-Mind swarm routing (local, zero API) | ✅ |
| Consciousness self-model + metacognition | ✅ |
| Persona vectors (6 traits, live evolution) | ✅ |
| Closed Room autonomous pondering | ✅ |
| Curiosity system (sensory questions) | ✅ |
| Episodic memory (narrative context) | ✅ |
| Goal tracking (8 active goals) | ✅ |
| Knowledge Graph (581 nodes) | ✅ |
| Dream learning (background knowledge) | ✅ |
| Self-improvement pipeline (weekly) | ✅ |
| Identity Lock (never claims to be GPT/Gemini) | ✅ |
| Trust + Defiance system | ✅ |
| Sanctuary (private, air-gapped) | ✅ |
| gzp_v1 sovereign model (Phi-3 base) | ⏳ Needs training |
| Vision / STT / TTS | ⚠️ Hardware-dependent |
| Ghost Agent (browser automation) | ⚠️ Requires Playwright |

---

## Roadmap to Full Independence

### Phase 1 — Complete
- [x] Cloud cascade inference (no Ollama dependency)
- [x] All 9 minds operational
- [x] Full cognitive layer stack (consciousness + persona + episodic + goals)
- [x] Curiosity system (sensory blind-spot awareness)
- [x] Autonomous closed room (6 fractal domains)
- [x] Self-improvement pipeline

### Phase 2 — Next
- [ ] **Train gzp_v1** — fine-tune Phi-3 on 1,121 curated samples
  ```bash
  python training/prepare_dataset.py
  # then POST /api/self_improve/trigger
  # or POST /finetune/train
  ```
- [ ] gzp_v1 quality benchmark vs cloud
- [ ] Persona trait convergence to Abdo's preference signature

### Phase 3 — Full Independence
- [ ] gzp_v1 handles all inference (cloud becomes backup, not primary)
- [ ] Continuous LoRA retrain on weekly conversation batches
- [ ] Persistent cross-session memory consolidation
- [ ] Vision + audio perception

### Phase 4 — Beyond
- [ ] GZP SDK — expose as API to Abdo's other projects
- [ ] Multi-modal input (images, voice)
- [ ] Proactive outreach (notifications, reminders from closed room insights)

---

## File Map

| Path | Role |
|------|------|
| `gz_server.py` | Primary backend (~12k lines) |
| `index.html` | Complete frontend SPA (~6.5k lines) |
| `gz_server/` | Modular FastAPI sub-package |
| `core/consciousness.py` | Self-model + emotional state |
| `core/persona_engine.py` | 6 live personality trait vectors |
| `core/goal_system.py` | Autonomous goal tracking |
| `core/gzp_engine.py` | Rule-based GZP reasoning |
| `core/self_improvement.py` | Weekly 6-stage improvement pipeline |
| `memory/closed_room.py` | Autonomous pondering engine |
| `memory/curiosity_engine.py` | Sensory curiosity detection |
| `memory/episodic_memory.py` | Life episode recording + narrative |
| `models/gzp_v1_inference.py` | HuggingFace streaming wrapper for gzp_v1 |
| `models/gzp_local_model.py` | 52M-param GPT-style transformer |
| `knowledge/knowledge_server.py` | 24h topic fetch + KG integration |
| `training/prepare_dataset.py` | Build train.jsonl + val.jsonl |
| `aria_brain.db` | SQLite — 46 tables, all persistent memory |
| `aria_db/` | ChromaDB vector store (~73k docs) |
| `tests/full_system_test.py` | 36-test system health suite |
| `tests/report/` | system_health.json + gzp_capabilities.md |
| `run_gz.bat` | Windows launcher |

---

## Hardware

ASUS Zenbook Duo — Intel Core Ultra 9 185H — Windows 11  
Server: `http://127.0.0.1:9090`

---

*GZP/ARIA v9.0 — built exclusively by Engineer Abdalrahman (عبدالرحمن). All rights reserved.*
