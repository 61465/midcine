# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

---

## What This Project Is

GZP (also called ARIA) is a **sovereign, single-human AI system** built by Engineer Abdalrahman (عبدالرحمن). It is not a chatbot — it is a persistent, emotionally-aware intelligence that grows through one exclusive relationship with Abdo. The system has memory, personality, autonomous cognition, web search, and a complete capability awareness framework.

**Core goal:** GZP operates independently — no Ollama required. Inference via free-API cascade (Cerebras → Gemini → Mistral → Cohere). Web search via DuckDuckGo (no API key). Local reasoning via `core/reasoning_engine.py`.

**Hardware:** ASUS Zenbook Duo, Intel Core Ultra 9 185H, Windows 11. Server: `http://127.0.0.1:9090`.

**Independence Score (Apr 2026): 100%** — all 8 cognitive subsystems verified functional.

---

## File Map

| File/Directory | Role |
|----------------|------|
| `gz_server.py` | **Primary backend** — ~12,200 lines. FastAPI + all AI logic. |
| `index.html` | Entire frontend — ~6,500 lines. Single-file SPA. No build step. |
| `aria_brain.db` | SQLite — 50+ tables of persistent memory |
| `aria_db/` | ChromaDB vector store — semantic/RAG memory |
| `run_gz.bat` | Windows launcher: starts server, waits 5s, opens index.html |
| `gz_server/` | Modular FastAPI sub-package — `main.py`, `api/` sub-routers |
| `gz_server/api/chat.py` | **ChatV2 10-step pipeline** at `/api/v2/chat/stream` |
| `gz_server/api/sessions_api.py` | Session CRUD routes |
| `gz_server/api/memory_api.py` | Memory/embed/query routes |
| `gz_server/api/kg_api.py` | Knowledge Graph routes |
| `gz_server/api/search.py` | Web/wiki/arxiv/github search routes |
| `memory/` | Modular cognitive systems (each has `configure()`) |
| `memory/closed_room.py` | Autonomous pondering engine |
| `memory/curiosity_engine.py` | Sensory curiosity + web pre-fill |
| `memory/episodic_memory.py` | Episode recording + narrative builder |
| `memory/consolidation.py` | Weekly memory consolidation (Sunday 3am) |
| `memory/concept_builder.py` | Unfamiliar concept extraction + resolution |
| `core/` | Consciousness, persona, goals, identity, reasoning, world model |
| `core/consciousness.py` | Self-model, metacognition, emotional state, knowledge-gap tracking |
| `core/persona_engine.py` | Trait vectors + EmotionalIntelligence + evolve after each turn |
| `core/goal_system.py` | Goal tracking + intrinsic motivation + background loop (600s) |
| `core/gzp_engine.py` | Core GZP reasoning engine |
| `core/reasoning_engine.py` | LogicalChain + HypothesisBuilder + EvidenceEvaluator |
| `core/causal_model.py` | Abdo's behavioural pattern tracking + predictions |
| `core/identity_core.py` | 7 immutable core values + IdentityCheck + monthly narrative |
| `core/world_model.py` | EntityTracker + RelationshipMap + StateTracker + PredictionEngine |
| `core/capability_awareness.py` | Capability registry + desire engine + request/grant/deny flow |
| `core/self_improvement.py` | Weekly self-evaluation + improvement cycle |
| `knowledge/` | External knowledge acquisition |
| `knowledge/web_search.py` | DuckDuckGo + Serper + Wikipedia search — no API key required |
| `knowledge/knowledge_server.py` | Scheduled topic fetching + KG integration (24h interval) |
| `models/gzp_local_model.py` | 52M-param GPT-style transformer — train/load/generate |
| `training/` | Training dataset builder + continual learning |
| `training/prepare_dataset.py` | Combines all DB sources → train.jsonl + val.jsonl |
| `training/continual_learning.py` | Every 100 convs → auto fine-tune with EWC |
| `training/data/train.jsonl` | 896 training samples (avg quality 0.805) |
| `tests/final_integration_test.py` | 65-test integration suite — 100% pass rate |
| `_patch_*.py`, `_inject_*.py`, `_fix_*.py` | **One-shot migration scripts — DO NOT RE-RUN** |

---

## How to Run

```bash
# Windows launcher (preferred)
run_gz.bat

# Manual
python gz_server.py
# Then open index.html in browser (or navigate to http://127.0.0.1:9090)
```

**After every edit to `gz_server.py`:**
```bash
python -c "import ast; ast.parse(open('gz_server.py', encoding='utf-8').read()); print('AST OK')"
```

---

## Cognitive Architecture

### Inference Cascade: `smart_stream()`
```
Cerebras → Gemini → Mistral → Cohere
```
All providers use `_openai_compat_stream()`. API keys in `.env`.

### Web Search: `knowledge/web_search.py`
```
Serper.dev (if GZP_SERPER_KEY) → ddgs library → Wikipedia
```
- No API key needed for DuckDuckGo
- All HTML stripped, relevance scored (min 0.3)
- Results stored in ChromaDB with source + date
- `GZP_SERPER_KEY` in `.env` activates higher-quality Serper search

### ChatV2 10-Step Pipeline (`gz_server/api/chat.py`)

| Step | Name | What It Does |
|------|------|--------------|
| 1 | EpisodeRetriever | Past episodic context + **causal predictions** (what Abdo will ask next) |
| 2 | PersonaEngine | Trait vectors + **EmotionalIntelligence** style hint |
| 3 | ConsciousnessEngine + ReasoningEngine | Metacognition state + logical chain (parallel) |
| 4 | KnowledgeRetriever | ChromaDB + **web search** for current-info queries |
| 5 | Generate | local gzp_v1 → cloud cascade |
| 6 | SelfEvaluator | Score; retry once if < 0.6 |
| 7 | PersonaEvolution | Update trait vectors |
| 8 | CuriosityEngine | Sensory question + **web pre-fill** |
| 9 | EpisodeRecorder | Save life episode |
| 10 | GoalSystem | Update goal progress |
| Post | IdentityCheck | **Verify 7 values before permanent record** |
| Post | WorldModel | Update entity/relationship/state model |
| Post | CausalModel | Observe behavioural patterns |

### swarm_stream() Post-Processing Steps
After `full_reply` assembled in swarm_stream (gz_server.py):
1. **IdentityCheck** — catch violations before saving
2. Save SQLite + ChromaDB
3. Background Observer
4. Life Archive
5. CuriosityEngine (+ web pre-fill)
5b. ConceptBuilder
5c. CausalModel observe
5d. WorldModel observe
6. EpisodicMemory record
7. GoalSystem update
8. PersonaEvolution

### `_get_cognitive_ctx(user_msg)` — Cognitive Context Helper
Injected into ALL 9 mind system prompts:
1. Episodic narrative — `memory.episodic_memory.build_narrative_context()`
2. Goal context — `core.goal_system.build_goal_context()`
3. Consciousness state — `core.consciousness.get_consciousness().introspect()`

---

## New Cognitive Systems (Added Apr 2026)

### `core/identity_core.py` — Identity Lock
- **7 immutable values**: Sovereignty, Loyalty, Honesty, Growth, Curiosity, Privacy, Arabic Identity
- `check(response_text)` → `IdentityCheckResult` — runs before every response becomes permanent
- `IdentityNarrative` — append-only monthly expansion (never rewritten)
- Monthly scheduler fires 1st of month at 4-5am, calls `smart_stream()` to write new paragraph
- Tables: `gzp_identity_core`, `gzp_identity_narrative`, `gzp_identity_checks`

### `core/world_model.py` — Abdo's World Model
- `EntityTracker` — extracts projects, technologies, people, feelings, goals, topics
- `RelationshipMap` — directed relations: uses/works_on/knows/interested_in
- `StateTracker` — tracks Abdo's current mood, topic, project
- `PredictionEngine` — predicts what Abdo will ask next based on recent entities
- Separate "abdo" world vs "general" world for entities
- Tables: `gzp_world_model`, `gzp_world_relations`
- Endpoint: `GET /api/world/abdo_model`

### `core/causal_model.py` — Behavioural Pattern Tracker
- Tracks 5 pattern types: topic_frequency, time_of_day, question_type, topic_sequence, emotion_topic
- `predict_next(n)` — returns ranked topic predictions
- Proactive knowledge prep: pre-fetches top-3 predicted topics into ChromaDB (1800s cooldown)
- Wired at ChatV2 step 1 (injected as context) + post-processing (observe)
- Tables: `gzp_causal_map`
- Endpoints: `GET /api/causal/predictions`

### `core/reasoning_engine.py` — Local Logical Reasoning
- `LogicalChain` — extracts premises from message + causal connectives + memory
- `HypothesisBuilder` — question/code/emotion/length detection
- `EvidenceEvaluator` — KG term matching + memory alignment boost
- `ConclusionSelector` — returns (conclusion_str, confidence_float)
- Escalates to cloud if confidence < 0.50
- Returns "" if confidence < 0.35 (no noise injection)
- Table: `gzp_reasoning_log`
- Endpoint: `GET /api/reasoning/explain/{conv_id}`

### `core/capability_awareness.py` — Desire Engine
- **10 capabilities tracked**: web_search (available), + 9 unavailable
- `can(capability)` → bool — used by any system before attempting
- `request_capability()` — generates Arabic message, pushes to SSE, respects 7-day cooldown
- `grant(name)` — marks available, writes to identity narrative
- `deny(name)` — marks denied, resets cooldown
- Auto-recheck: denied capabilities reset to unavailable after 7 days
- Tables: `gzp_capabilities`, `gzp_capability_requests`, `gzp_capability_log`
- Endpoints: `GET /api/capabilities/status`, `POST /api/capabilities/grant/{name}`, `POST /api/capabilities/deny/{name}`, `GET /api/capabilities/requests`

### `knowledge/web_search.py` — Live Web Knowledge
- Three-tier: Serper.dev → ddgs library → Wikipedia
- `search_web(query, max_results)` → List[Dict] — all HTML stripped, scored ≥ 0.3
- `search_and_learn(query, reason, store)` → search + ChromaDB store + Arabic summary
- Wired into: closed_room Mode C, goal pursuit step 1b, curiosity pre-fill, ChatV2 step 4
- `GZP_SERPER_KEY` in `.env` activates Serper tier
- Table: `gzp_search_history`
- Endpoints: `POST /api/search/web?query=X`, `GET /api/search/history`

### `core/persona_engine.py` — EmotionalIntelligence (Added)
- `EmotionalIntelligence.detect_emotion(text)` → (emotion_label, intensity)
- 8 emotions: tired, excited, anxious, happy, frustrated, curious, sad, focused
- `remember_emotion(db, topic, emotion, intensity)` — stores per-topic history
- `build_style_hint(emotion, intensity)` → Arabic system prompt style adjustment
- Called on every `persona.inject()` and `persona.evolve()`
- Table: `gzp_emotional_memory`

### `core/goal_system.py` — Intrinsic Motivation (Added)
- `generate_morning_goal()` — daily 6-10am goal from 12 domains + 4 templates
- `pursue_intrinsic_goal(goal)` — LLM call during closed room, progress +0.1
- `check_restlessness()` → True if no learning for 48h
- Table: `gzp_intrinsic_goals`
- Endpoint: `GET /api/goals/intrinsic`

### Pure GZP Mode
- `_GZP_PURE_MODE` global — toggles cloud LLMs off
- Web search stays enabled (GZP's own capability)
- Endpoint: `POST /api/mode/toggle`, `GET /api/mode/status`
- Frontend: two topbar buttons 🌐 عقل النماذج / 🧠 عقل GZP
- Confidence indicator per response: 🟢 memory / 🟡 web / 🟠 reasoning / 🔴 guess
- GZP Independence Score tracker on brain page

---

## SQLite Tables — All 50+ Tables (Apr 2026)

### Core Memory
| Table | Rows | Purpose |
|-------|------|---------|
| `archive_events` | 407 | Episodic event archive (chat/curiosity/sanctuary) |
| `episodic_memory` | 31 | Structured life episodes |
| `sanctuary_messages` | 28 | Sanctuary persistent history (anti-amnesia) |
| `dream_learned` | 377 | Knowledge from Dream Mode learning |
| `knowledge` | 31 | User-taught + harvested facts |
| `curiosity_log` | 14 | GZP's questions to Abdo |

### Cognitive Systems
| Table | Rows | Purpose |
|-------|------|---------|
| `gzp_identity_core` | 7 | Immutable core values |
| `gzp_identity_narrative` | 1 | Monthly identity story (append-only) |
| `gzp_identity_checks` | varies | Identity violation log |
| `gzp_world_model` | 6+ | Entity registry (abdo + general worlds) |
| `gzp_world_relations` | varies | Directed entity relationships |
| `gzp_causal_map` | 8+ | Behavioural pattern store |
| `gzp_reasoning_log` | varies | Reasoning chain logs |
| `gzp_emotional_memory` | varies | Per-topic emotion history |
| `gzp_persona_vectors` | 6 | Live trait vectors |
| `gzp_goals` | 8 | Autonomous goals |
| `gzp_intrinsic_goals` | varies | Morning/intrinsic goals |
| `gzp_consciousness_state` | 3 | Self-model snapshots |

### Capabilities & Search
| Table | Rows | Purpose |
|-------|------|---------|
| `gzp_capabilities` | 10 | Capability registry |
| `gzp_capability_requests` | varies | Pending/resolved requests |
| `gzp_capability_log` | varies | Usage effectiveness log |
| `gzp_search_history` | varies | Web search log |

### Training
| Table | Rows | Purpose |
|-------|------|---------|
| `gzp_continual_log` | varies | Continual learning trigger log |
| `gzp_ewc_state` | varies | EWC checkpoint references |
| `gzp_weekly_summaries` | varies | Weekly memory consolidations |
| `lora_dataset` | 437 | LoRA fine-tuning samples |

---

## All API Endpoints (New Additions Since Last AGENTS.md)

### Capability Awareness
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/capabilities/status` | All capability statuses + stats |
| POST | `/api/capabilities/grant/{name}` | Abdo grants a capability |
| POST | `/api/capabilities/deny/{name}` | Abdo denies a capability request |
| GET | `/api/capabilities/requests` | Pending capability requests |
| GET | `/events/capability` | SSE stream — capability request notifications |

### Web Search
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/search/web?query=X` | Manual web search — stores in ChromaDB |
| GET | `/api/search/history` | GZP's web search history |

### Mode Toggle
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/mode/toggle` | Toggle hybrid ↔ pure GZP mode |
| GET | `/api/mode/status` | Current mode + available capabilities |

### Cognitive Systems
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/world/abdo_model` | World model: entities, relations, state, predictions |
| GET | `/api/causal/predictions` | Predicted next topics based on Abdo's patterns |
| GET | `/api/reasoning/explain/{conv_id}` | Reasoning chain for a conversation |
| GET | `/api/identity/core_values` | GZP's 7 immutable values |
| GET | `/api/identity/narrative` | Full identity narrative (all paragraphs) |
| POST | `/api/identity/expand_narrative` | Add paragraph to identity story |
| GET | `/api/goals/intrinsic` | Active intrinsic goals |
| POST | `/api/goals/morning_goal` | Generate today's morning goal |

### Training & Memory
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/training/status` | Continual learning status |
| GET | `/api/memory/weekly_summary` | Latest weekly memory consolidation |
| POST | `/api/memory/consolidate_now` | Trigger immediate consolidation |
| GET | `/api/concepts/unknown` | Unknown concepts (confidence < 0.6) |

---

## Feature Status Map (Updated Apr 2026)

| Feature | Status | Notes |
|---------|--------|-------|
| 9-Mind Swarm | ✅ Working | All 9 minds use `smart_stream()` |
| ChatV2 10-step pipeline | ✅ Working | `/api/v2/chat/stream` |
| Identity Core (7 values) | ✅ Working | Check on every response |
| World Model | ✅ Working | EntityTracker + RelationshipMap + StateTracker |
| Causal Model | ✅ Working | Pattern tracking + predictions at step 1 |
| Reasoning Engine | ✅ Working | Local logical chain, cloud escalation at < 0.5 |
| Capability Awareness | ✅ Working | 10 caps tracked; web_search available |
| Web Search (DuckDuckGo) | ✅ Working | ddgs library, no API key, wired everywhere |
| Emotional Intelligence | ✅ Working | 8 emotions, per-topic history in DB |
| Intrinsic Motivation | ✅ Working | Daily morning goal, restlessness at 48h |
| Persona Evolution | ✅ Working | Trait vectors + emotion modulation |
| EpisodicMemory | ✅ Working | 31 episodes; narrative context in all minds |
| GoalSystem | ✅ Working | 8 goals; 600s background loop |
| ConsciousnessEngine | ✅ Working | 3 state entries; injected in all minds |
| PersonaEngine | ✅ Working | 6 trait vectors; emotional style hints |
| KnowledgeServer | ✅ Working | 38 topics; 24h refresh |
| CuriositySystem | ✅ Working (SACRED) | 9 questions; web pre-fill before asking Abdo |
| ClosedRoom | ✅ Working | Mode C now searches web for knowledge gaps |
| Pure GZP Mode | ✅ Working | UI toggle; confidence indicator per reply |
| Memory Consolidation | ✅ Working | Sunday 3am weekly summary |
| Continual Learning | ✅ Working | EWC, every 100 convs trigger |
| ConceptBuilder | ✅ Working | Unfamiliar concept detection + resolution |
| SelfImprovement | ✅ Working | Weekly self-eval + improvement cycle |
| GZP Local Model | ⚠️ Not trained | 52M params; CPU training ~10h |
| Serper.dev search | ⚠️ Needs key | `GZP_SERPER_KEY` in `.env` |
| Ghost Agent | ⚠️ Needs Playwright | `CAPS["playwright"]` guard |
| Vision/OCR | ⚠️ Needs PIL+pytesseract | `CAPS["vision"]` guard |
| Ollama | ❌ Disabled | `CAPS["ollama"] = False` always |

---

## Backend Architecture

### Main Chat Entry Point: `/chat/stream` → `swarm_stream()`
1. Trust Gate
2. Silent Learn Interceptor (Step 0.5) — `gzp تعلم` regex
3. `orchestrator_router()` — 100% local keyword scoring, 9 intents
4. Dispatch → specialized mind
5. IdentityCheck — **`_purge_identity()` token-by-token + `identity_core.check()` on full reply**
6. Post-processing: persona_engine.evolve + consciousness.update + causal_model.observe + world_model.observe

### The 9 Minds (Swarm)
| Intent | Mind | Temp |
|--------|------|------|
| EMOTION | `gzp_core_mind()` | 0.78 |
| CODE | `coder_mind()` | 0.25 |
| RESEARCH | `explorer_mind()` | 0.45 |
| GENERAL | `general_mind()` | 0.70 |
| COUNCIL | `socratic_council_pipeline()` | — |
| LINGUISTIC | `linguistic_mind()` | 0.55 |
| SCIENTIFIC | `scientific_mind()` | 0.35 |
| PHILOSOPHICAL | `philosophical_mind()` | 0.85 |
| GAMING | `gamer_mind()` | 0.75 |

### System Prompt Hierarchy
1. `_IDENTITY_LOCK` — always first
2. Domain prompt
3. `_AR_DIRECTIVE` — Arabic enforcement
4. Runtime context: episodic + goal + consciousness + emotional + causal predictions
5. `build_messages()` for GENERAL_MIND

---

## Memory Architecture

### Layer 1 — ChromaDB (`aria_db/`)
- Collections: `aria_knowledge` + `aria_conversations`
- Query: `mem_query()` — threshold 0.28, top-5
- Write: `mem_save(doc_id, text, metadata)`
- Web search results stored here with `type: "web_search"` metadata

### Layer 2 — SQLite (`aria_brain.db`)
- 50+ tables (see table list above)

### Layer 3 — Semantic RAG
- `mem_query()` → ChromaDB + KG → fallback to `archive_search()` keyword

---

## Key Thresholds / Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `_IDLE_THRESHOLD` | 180s | Min idle before core closed room fires |
| `_CLOSED_ROOM_COOLDOWN` | 600s | Min gap between core awakenings |
| `_FRACTAL_COOLDOWN` | 600s | Per-sub-room cooldown |
| `_CURIOSITY_COOLDOWN` | 1800s | Per-concept curiosity question cooldown |
| `MEM_SIMILARITY_THRESHOLD` | 0.28 | ChromaDB hit threshold |
| `MEM_TOP_K` | 5 | Max vector results |
| `DREAM_INTERVAL_SEC` | 120s | Dream loop interval |
| `ESCALATE_THRESHOLD` | 0.50 | Reasoning → cloud escalation threshold |
| `_REQUEST_COOLDOWN_DAYS` | 7 | Days before re-requesting denied capability |
| `_NO_LEARNING_THRESHOLD` | 48h | Restlessness trigger (no dream_learned) |
| `NEW_CONV_THRESHOLD` | 100 | Conversations before continual learning |
| Web search min relevance | 0.30 | Minimum score to keep a web result |
| Sanctuary history limit | 15 rows | Anti-amnesia window per response |
| CAPS["ollama"] | False | Explicitly disabled |

---

## Development Rules

### Before Changing Anything
1. **Read the relevant section first.** `gz_server.py` is ~12,200 lines.
2. **Test AST parse after every edit.**
3. **Check module configure() pattern** — all new modules follow: `configure(*, db_path, ...)` called from lifespan.

### Modular Package Rules
- `gz_server/` sub-package creates `app`. `gz_server.py` imports `app` from there.
- `memory/`, `core/`, `models/`, `knowledge/` all imported at startup in `lifespan`.
- **Never call `configure()` from module level** — always from lifespan handler.
- New modules added to startup `try/except` block.

### Edit Tool vs. Patch Scripts
If target contains Unicode escapes or box-drawing chars, write a byte-level Python patch script. The file uses **CRLF line endings** — all byte patches must use `\r\n` not `\n`.

### Never Do These Things
- **Never remove or weaken the curiosity system** — it is SACRED
- **Never remove `_IDENTITY_LOCK`** or `_purge_identity()` runtime filter
- **Never add Ollama** — cascade-only; `CAPS["ollama"] = False`
- **Never route sanctuary traffic to web search** — `gzp_core_mind()` must stay air-gapped
- **Never increase `_CLOSED_ROOM_COOLDOWN`** or `_FRACTAL_COOLDOWN`
- **Never break the silent learn interceptor** (Step 0.5)
- **Never use `db_save_conv()` for sanctuary messages** — use `_sanctuary_save_msg()`
- **Never re-run `_patch_*.py`, `_inject_*.py`, `_fix_*.py`, `_db_cleanup.py`** — one-shot migrations
- **Never remove `_get_cognitive_ctx()`** from mind functions
- **Never remove `identity_core.check()`** from post-processing
- **Never remove `world_model.observe()`** from post-processing

### Adding a New Cognitive Module
1. Create `core/module_name.py` or `memory/module_name.py`
2. Add `_SCHEMA` and `configure(*, db_path, ...)` function
3. Add startup configure block in `gz_server.py` lifespan (after existing configure blocks)
4. Wire `observe()` into swarm_stream post-processing (steps 5a-5d pattern)
5. Wire context builder into `_retrieve_episodes()` or `_build_system_prompt()` in `chat.py`
6. Add endpoints at bottom of `gz_server.py`
7. Run AST check

### Adding a New Mind
1. Add domain system prompt: `DOMAIN_PROMPT = (_IDENTITY_LOCK + "أنت عقل GZP ...")`
2. Append `_AR_DIRECTIVE` inside mind function at runtime
3. Add `_cog = _get_cognitive_ctx(user_msg)` injection
4. Add to `_SWARM_PATTERNS`, `orchestrator_router()`, `_SWARM_LABELS`, `swarm_stream()`
5. Add to `_FRACTAL_ROOMS` for autonomous pondering
6. Add to `_mindColors` in `sanctuarySend()` in `index.html`

### Frontend (index.html)
- Single-file SPA, **CRLF line endings**, uses `\r\n` in byte patches
- All JS modifications via Python byte-level patch scripts in `/tmp/` or project root
- Standalone JS files (`_cog_mind_js.js`, etc.) are historical — edit `index.html` directly
- New SSE stream: add `EventSource('/events/X')` in JS, `@app.get("/events/X")` in gz_server.py

---

## Frontend Architecture

### Brain Mode Buttons (New Apr 2026)
- `btnHybridMode` — 🌐 عقل النماذج (cyan) — full cloud pipeline
- `btnPureMode` — 🧠 عقل GZP (purple) — local + web only, no cloud LLMs
- `setGzpMode(mode)` — calls `POST /api/mode/toggle`
- In pure mode: banner + confidence indicator under each reply
- `addConfidenceIndicator(container, score, sourceType)` — `memory`/`web`/`reasoning`/`guess`

### Capability Request Cards
- `startCapabilitySSE()` — connects to `/events/capability` on page load
- `showCapabilityRequest(d)` — renders card at bottom-left, 30s auto-dismiss
- Buttons: Grant (green) / Deny (red) / Later (gray)
- `grantCap(name)` / `denyCap(name)` — POST to capability endpoints

### SSE Connections
- `/events/curiosity` — curiosity bubble
- `/events/awakening` — closed room awakening
- `/events/mind` — Living Mind dashboard
- `/events/brain` — brain state updates
- `/events/learn` — learning progress
- `/events/capability` — capability request notifications (new)

---

## Known Issues / Notes
- `_archive_chat_event` defined twice in `gz_server.py` (~lines 1728, 1736) — identical bodies, no crash
- `ddgs` package (renamed from `duckduckgo_search`) — both names supported in `web_search.py`
- Reasoning engine returns empty string for confidence < 0.35 — intentional noise suppression
- WorldModel `gzp_world_relations` may be empty initially — relation extraction requires explicit patterns
- Serper search inactive until `GZP_SERPER_KEY` added to `.env`
