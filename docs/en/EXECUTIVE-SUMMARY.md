# midcine — Executive Summary (English)

> **Arabic Cloud-Native RIS/PACS for the MENA radiology market**
> Last updated: 2026-06-07 | Status: Pre-MVP, 90-day plan in motion

---

## TL;DR

**midcine** is a next-generation Radiology Information System and Picture Archiving and Communication System (RIS/PACS), purpose-built for the Arabic-speaking healthcare market. We leapfrog the dominant local legacy systems (Horus, Orzeix, Modular — built on 15-year-old on-premise monolithic architectures) by matching the architectural sophistication of Rad AI, Aidoc, and deepc — **with one decisive linguistic advantage no global competitor can match**: an Arabic Clinical LLM trained on medical reports from Egyptian and Gulf radiologists.

---

## 1. The Opportunity

### 1.1 Market reality
- **Egypt:** ~2,500 independent radiology centers + ~600 private hospitals running legacy on-premise systems
- **Gulf:** ~1,500 centers, more receptive to SaaS but starved for true Arabic AI
- **Pain points (real, not hypothetical):**
  1. Remote reading is broken — VPN + thick clients = 5–20 minutes to open a single CT
  2. Nuance Dragon Medical licenses cost $3,000+ each — most centers cannot afford them
  3. Modern AI tools (Aidoc, Annalise.ai) don't integrate with Horus/Orzeix

### 1.2 Why now
- WebGPU + WebAssembly are mature enough for diagnostic-grade web viewers (2026)
- AceGPT-13B and similar Arabic-capable LLMs are open-source and self-hostable
- MONAI Deploy provides production-ready medical AI orchestration
- Healthcare SaaS adoption in MENA is at the inflection point seen in US 2018

### 1.3 Realistic market sizing (bottom-up)
- Egypt TAM: ~$30M/year
- Egypt SAM (SaaS-ready): ~$10M/year
- 3-year SOM target: $1–2M ARR (5–10% of SAM)

---

## 2. Product

### 2.1 Architecture (one-liner)
**Hybrid Cloud:** Raw imaging stays in the hospital (local MinIO); cloud handles AI inference only. Zero-footprint web viewer over WebGPU/WebAssembly. Arabic Clinical LLM drafts reports from AI measurements.

```
Modality → Orthanc Edge → MinIO local
              ↓
         Edge Pusher → Cloud Ingestion (mTLS)
              ↓
    PostgreSQL + R2 → AI Workers (MONAI) → Clinical LLM (AceGPT) → OHIF Arabic Viewer
```

### 2.2 The Arabic edge (defensible moat)
- **Clinical LLM** fine-tuned on real Arabic radiology reports — Aidoc/deepc cannot ship this in <3 years
- **RTL-native UI** built on OHIF v3 + 3 custom extensions
- **ICD-11 Arabic** integrated into the report generation pipeline
- **Egyptian Universal Healthcare Insurance** integration (local-only feature)

### 2.3 Tech decisions (made, not "options")
| Component | Choice | Rejected alternative |
|---|---|---|
| DICOM core | Orthanc 1.12+ | DCM4CHEE (Java, heavy) |
| Web viewer | OHIF v3.10 + Cornerstone3D | Custom build (18-month timesink) |
| Database | PostgreSQL 16 + pgvector + pg_search | MongoDB, MSSQL |
| Local storage | MinIO | AWS S3 direct (privacy) |
| Cloud storage | Cloudflare R2 | AWS S3 (egress fees) |
| Queue | Redis Streams | Kafka (overkill at MVP) |
| AI framework | MONAI Deploy Express | Custom orchestration |
| Clinical LLM | AceGPT-13B + LoRA + AWQ-4bit | Jais-30B (too heavy), Llama-Arabic (weaker), GPT-4 API (PHI risk) |
| Serving | vLLM 0.6+ | TGI, llama.cpp, Ollama |
| Frontend | Next.js 15 + Tailwind 4 + shadcn/ui | Vue, Svelte |
| Infrastructure | Hetzner + Cloudflare R2 | AWS (80% more expensive at our scale) |
| PaaS | Coolify (self-hosted) | Vercel + Render |

---

## 3. Business Model

### 3.1 Pricing tiers (Egyptian Pound)
| Tier | Audience | EGP/month | Includes |
|---|---|---|---|
| **Solo** | Individual radiologist | 800 | Web viewer, manual Arabic reports, basic worklist |
| **Center** | Radiology center | 4,500 | + AI Triage (CT brain, Chest X-ray), Clinical LLM (limited) |
| **Chain** | 3+ branches | 12,000+ | + Full Clinical LLM, HIS integration, multi-branch dashboard |
| **Enterprise** | Hospital / government | Custom | + On-prem option, 99.9% SLA, customization |

### 3.2 Unit economics (Center tier example, 3-year TCO)
- **Horus legacy:** 329,000 EGP (licenses + Nuance + downtime + remote reading inefficiency)
- **midcine Center:** 227,000 EGP (SaaS + hardware + onboarding)
- **Net savings:** 102,000 EGP (31%) — before factoring AI productivity gains

### 3.3 Year-1 conservative targets
- 25 active customers
- 130,000 EGP MRR
- ~1.5M EGP ARR

---

## 4. Go-to-Market

### 4.1 Strategy (in priority order)
1. **Champion Doctors Program** — 50 radiologists across 3 tiers, mix of equity-style benefits and modest cash incentives (~75,000 EGP year-1 budget)
2. **Pilot partner** — One radiology center in Cairo/Alexandria, free in exchange for testimonial + training data (Sprint 6)
3. **EgyRad Annual Conference** booth (Feb 2027) — primary conference for the Egyptian Society of Radiology
4. **LinkedIn + closed Facebook groups** for Arab radiologists — content marketing led by founder
5. **Direct sales** — cold outreach playbook with 10 documented objection/response pairs

### 4.2 Customer acquisition reality
- Cold email → 8% positive reply → 4–6 demos → 1–2 trials → 0–1 deal per 100 attempts
- Realistic Year-1 CAC: 15,000–25,000 EGP per Center deal
- Decision cycle for Center: 4–8 weeks; for Chain: 3–6 months; for Hospital: 12–18 months

### 4.3 Geographic expansion
- Year 1: Egypt only
- Year 2: Saudi Arabia (via partner, SDAIA-compliant)
- Year 3: UAE + government tenders in Egypt

---

## 5. Roadmap (90-day MVP)

| Sprint | Weeks | Deliverable shown to a real doctor |
|---|---|---|
| 0 | 1 | Local docker-compose runs full stack |
| 1 | 2–3 | Real DICOM enters Orthanc and renders in OHIF |
| 2 | 4–5 | Full RTL Arabic OHIF + worklist |
| 3 | 6–7 | Edge Gateway streams to cloud, viewer loads <40s |
| 4 | 8–9 | AI Triage detects brain hemorrhage in 50-case test |
| 5 | 10–11 | Clinical LLM drafts Arabic report from AI measurements |
| 6 | 12 | Pilot partner uses the system daily |
| 7 | 13 | First case study + signed testimonial |

### Success criteria (MVP)
- One pilot partner using daily (≥20 scans/day)
- AI Triage sensitivity ≥80% on hemorrhage detection
- Clinical LLM acceptance: ≥70% of drafts need <3 edits
- Time from scan upload to doctor's worklist: P95 <60s
- 30-day uptime ≥99%

If 5/6 met → MVP success, commercial phase begins.
If ≤3/6 → stop, re-architect.

---

## 6. Compliance & Security

| Framework | Status | Critical controls |
|---|---|---|
| **HIPAA** (reference) | Self-attested | RBAC, audit log, mTLS, AES-256-GCM at-rest |
| **GDPR** | Self-attested | DPO appointed before EU customer, DPIA template |
| **Egyptian Law 151/2020** | Direct application | Patient consent flow, 72-hour breach notice |
| **SDAIA PDPL** | Year-2 priority | Data localization via AWS Bahrain or Oracle Riyadh |

### Security stack (decisions)
- mTLS: Smallstep step-ca self-hosted
- Secrets: HashiCorp Vault + Shamir 5-of-3 unseal
- RBAC: Casbin (5 roles: super_admin → owner → doctor → technician → read_only)
- Audit: PostgreSQL + Loki + R2 Object Lock (WORM, 7-year retention)
- Service mesh: Linkerd
- Edge OS: Talos Linux (immutable)
- CI security: Semgrep + Trivy + Checkov + gitleaks (SBOM via syft)

---

## 7. AI Strategy

### 7.1 Triage models (production from MVP)
- **MONAI Bundle: brain_hemorrhage_ct** + **DeepBleed** (dual model for confidence)
- **TorchXRayVision** (14-condition chest X-ray screening)
- **MONAI Lung Nodule Detection** (Sprint 9)

### 7.2 Clinical LLM pipeline
- Base: **AceGPT-13B-chat** (Apache 2.0, self-hosted)
- Fine-tune: LoRA r=64 on 5,000 Arabic reports + 54,000 ICD-11 entries + DPO on 500 doctor-preferred pairs
- Quantization: **AWQ 4-bit** (11GB VRAM)
- Serving: **vLLM 0.6+** (continuous batching, PagedAttention)
- RAG: pgvector + ParadeDB pg_search hybrid, bge-m3 embeddings, bge-reranker-v2-m3, top-K=5

### 7.3 Performance (real benchmarks on RTX 6000 Ada 48GB)
- LLM single-stream: ~75 tokens/sec
- LLM concurrent-8 throughput: ~280 tokens/sec
- LLM P95 latency (300 tokens): ~4.5s
- CT brain hemorrhage inference P95: <12s

### 7.4 Red lines (explicit)
- No diagnostic final without doctor signature
- No online learning from production (quarterly batch DPO only)
- No PHI sent to external APIs (no OpenAI/Claude/Gemini)
- No continuous learning without Medical Advisory Board review

---

## 8. Brand

### 8.1 Identity
- **Name:** midcine (retained), with Arabic tagline "الأشعة تتحدث العربية" (Radiology speaks Arabic)
- **Mark:** Two curved CT slices + diamond center point (Edge ↔ AI ↔ Cloud bridge)
- **Primary color:** #0F62FE (IBM Plex Blue) — WCAG AAA on white
- **Typography:** IBM Plex Sans Arabic (primary) + JetBrains Mono (numerics)
- **Tone:** Professional + direct + proudly Arabic. We don't claim "best" — we let data speak.

### 8.2 Design principles
1. Arabic-first, not Arabic-last
2. Doctor leads, AI assists
3. Speed everywhere (<100ms reactions)
4. Transparency of intelligence (confidence + sources always shown)
5. High density, zero clutter

---

## 9. Team & Execution

### 9.1 Founders / leadership
- **Abd Alrahman Mohamed** — Founder, Full-Stack Developer & AI Systems Architect (Egypt)
- **NEXUS-AI** — 46-agent AI digital company providing parallel R&D, code review, security analysis, and strategic input

### 9.2 Delivery model
- 7 independent handoff packages (A–G), each 1–3 weeks, deliverable to OpenCode/Kiro/freelance specialists
- Founder coordinates, reviews, integrates — does not build everything alone
- Critical path: Infrastructure (A) → Cloud Ingestion (C) → Edge Gateway (B) + OHIF Arabic (D) parallel → AI Worker (F) → Clinical LLM (G)

### 9.3 Risks (top 3)
1. **Trust barrier in medical sector** — mitigated via Champion Doctors program and pilot case study before commercial push
2. **Horus releases cloud version** — 12-month lead time + Clinical LLM moat as defense
3. **AceGPT Arabic medical performance gap** — heavy reliance on RAG in MVP, planned fine-tune sprint after pilot data collection

---

## 10. Documents (full detail)

The full strategic and technical documentation is written in Arabic, by design — it's the primary language of the target market and team. Translations available on request for international partners.

| Document | Purpose |
|---|---|
| [00-STRATEGY](../00-STRATEGY.md) | Market analysis, segments, pricing rationale, GTM |
| [01-ARCHITECTURE](../01-ARCHITECTURE.md) | Complete technical architecture with X vs Y decisions |
| [02-ROADMAP](../02-ROADMAP.md) | Week-by-week MVP plan |
| [03-COMPLIANCE](../03-COMPLIANCE.md) | HIPAA/GDPR/EDA/SDAIA matrix + threat model + CI/CD security |
| [04-AI](../04-AI.md) | Triage models + Clinical LLM + RAG + evaluation |
| [05-BUSINESS](../05-BUSINESS.md) | Pricing, positioning, value proposition canvas, growth tactics |
| [06-BRAND](../06-BRAND.md) | Logo, colors, typography, tone of voice |
| [handoff/](../../handoff/README.md) | 7 self-contained work packages for delivery partners |

---

## Contact

**Abd Alrahman Mohamed**
m76yitf@gmail.com
GitHub: [abdalrahmanmohamed3](https://github.com/abdalrahmanmohamed3)
Cairo, Egypt
