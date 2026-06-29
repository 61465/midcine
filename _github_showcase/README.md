<div align="center">

# midcine

**Arabic Cloud-Native RIS/PACS — Next-Generation Radiology Platform**
**نظام معلومات إشعاعي وأرشفة صور طبية مصمم خصيصاً للسوق العربي**

![Status](https://img.shields.io/badge/status-prototype--E2E-blue) ![Stack](https://img.shields.io/badge/stack-FastAPI%20%2B%20Next.js%2015-success) ![Domain](https://img.shields.io/badge/domain-Healthcare%20AI-red)

</div>

> ⚠️ This folder contains a **public showcase** of the project. The full source code, models, datasets, and clinical fixtures remain private.

---

## Overview · نظرة عامة

**midcine** is a hybrid-cloud RIS (Radiology Information System) and PACS (Picture Archiving and Communication System) built for Arabic-speaking healthcare providers — with privacy-by-design at its core.

- **Hybrid Cloud** — raw imaging data stays inside the clinic; only AI workloads use the cloud
- **Zero-Footprint Viewer** — OHIF v3 + Cornerstone3D 3D MPR/Volume rendering, no install
- **AI Triage** — auto-prioritizes critical cases (hemorrhage, fractures) at the top of the worklist
- **Arabic Clinical LLM** — drafts structured Arabic radiology reports (Jinja2 / Ollama qwen2.5)
- **Segmentation** — 2D overlay + 3D snapshot on affected organs
- **External Doctor Access** — QR scan → view case → upload findings; no account creation
- **WhatsApp Delivery** — report PDF + segmentation images sent to referring physician via Baileys

## Architecture · المعمارية

```
CT/MRI Scanner ─► dicom-receiver (pynetdicom) ─► Ingestion API ─► MinIO + Postgres
                                                       │
                                                       ├─► Redis Streams ─► AI Worker
                                                       │                       ├─► Triage
                                                       │                       ├─► Segmentation
                                                       │                       └─► 3D snapshot
                                                       │
                                                       ├─► LLM Service ─► Arabic report draft
                                                       │
                                                       └─► Next.js 15 RTL + OHIF v3 (3D MPR + Volume)
                                                                       │
                                                                       ├─► Doctor signs ─► DICOM SR (highdicom)
                                                                       └─► WhatsApp Bridge (Baileys) ─► Physician

FHIR Gateway R4 ──► HIS/EMR        QR Public ──► External doctor
```

## 12 Backend Microservices

| Service | Purpose |
|---|---|
| `dicom-receiver` | DICOM C-STORE listener via pynetdicom |
| `ingestion-api` | Pipeline entry point, study/series creation |
| `ai-dispatcher` | Routes studies to specialized AI workers |
| `ai-aggregator` | Combines outputs across multiple AI models |
| `ai-worker` | Triage + segmentation + 3D snapshot generation |
| `vision-ai` | Specialized imaging inference workers |
| `llm-service` | Arabic clinical report drafting (Ollama qwen2.5) |
| `fhir-gateway` | FHIR R4 bridge to HIS/EMR systems |
| `cloud-index` | Cross-clinic case indexing |
| `consent` | Patient consent management |
| `tunnel-broker` | Secure edge-to-cloud channel |
| `whatsapp-bridge` | Baileys-based physician notifications |

## 10 Frontend Apps

`console` · `worklist` · `viewer` (OHIF v3 + Cornerstone3D) · `reader` · `patient` · `mobile` · `connect` · `insights` · `edge-pusher` · `web`

## Tech Stack

- **Backend:** Python 3.11 + FastAPI · pynetdicom · highdicom · MONAI Deploy
- **Frontend:** Next.js 15 (RTL) · React · Tailwind · OHIF v3 · Cornerstone3D
- **Data:** PostgreSQL (+ pgvector) · MinIO (S3) · Redis Streams · Orthanc 1.12
- **AI:** Ollama (qwen2.5) · custom segmentation models · MONAI
- **Standards:** DICOM · DICOM SR (signed reports) · FHIR R4 · HL7 mapping
- **DevOps:** Docker Compose · Traefik · mTLS · HTJ2K compression over WebSocket

## Key Engineering Decisions

| Decision | Why |
|---|---|
| Orthanc over DCM4CHEE | Lightweight (<200MB RAM), C++, rich plugins |
| OHIF v3 over custom viewer | 18 months saved vs. rebuilding |
| Hybrid cloud (raw stays local) | Compliance + bandwidth + clinic trust |
| HTJ2K WebSocket transport | Streaming-friendly, smaller than DICOM-WS |
| DICOM SR signing | Legally defensible report integrity |
| FHIR R4 (not HL7 v2) | Future-proof EMR/HIS integration |

All decisions documented in 12 ADR-level docs (private).

## Status

- ✅ Prototype E2E — all 12 services wired, full pipeline tested with synthetic DICOM
- ✅ Bootstrap script seeds demo user, 200 ICD-11 codes, 40 CT brain slices + chest XR
- 🔄 Production hardening (Edge-First Security ADR-009, Modular Suite ADR-010)
- 📋 Next: pilot deployment with a real radiology center

## Documentation Map (private)

`00-STRATEGY` · `01-ARCHITECTURE` · `02-ROADMAP` · `03-COMPLIANCE` · `04-AI` · `05-BUSINESS` · `06-BRAND` · `07-DATA-MODEL` · `08-API-CONTRACTS` · `09-PROTOTYPE-SPEC` · `10-MEDICAL-LIBS` · `11-MASTER-ENGINEERING-PLAN` · `12-BUILD-PLAN`

## Author

**Abd Alrahman Mohamed** — solo architecture, implementation, and clinical-pipeline design.
abdarahman10555@gmail.com · github.com/61465

---

*Full source available under NDA. Contact for code review or pilot inquiries.*
