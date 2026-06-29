# midcine — Architecture Notes

> Sanitized excerpt of the internal architecture document. Full document private.

## Edge / Cloud Split

```
                       ┌──────────────────────────────────────────┐
                       │            EDGE (in-clinic)              │
                       │                                          │
   CT/MRI/X-Ray ────▶  │  Orthanc 1.12 (DICOM C-STORE :11112)    │
   (DICOM C-STORE)     │     │                                    │
                       │     ├──▶ Local MinIO (S3) — raw images   │
                       │     │                                    │
                       │     └──▶ Edge Gateway (FastAPI)          │
                       │           │                              │
                       └───────────┼──────────────────────────────┘
                                   │
                                   │  HTJ2K compressed
                                   │  WebSocket / mTLS
                                   ▼
                       ┌──────────────────────────────────────────┐
                       │             CLOUD (midcine.io)           │
                       │                                          │
                       │  Ingestion API (FastAPI)                 │
                       │     │                                    │
                       │     ├──▶ PostgreSQL + pgvector           │
                       │     ├──▶ Redis Streams (task queue)      │
                       │     └──▶ S3 (AI inference cache)         │
                       │                                          │
                       │  AI Workers (Python + MONAI Deploy)      │
                       │     ├──▶ AI Triage (CT brain, chest)     │
                       │     ├──▶ Measurement extraction          │
                       │     └──▶ Clinical LLM (AceGPT / qwen2.5) │
                       │                                          │
                       │  Web Viewer (OHIF v3.10 + Cornerstone3D) │
                       │     served via CDN                       │
                       └──────────────────────────────────────────┘
```

## Why Hybrid (not full cloud)

- **Compliance** — patient data stays in clinic. AI inferences send only de-identified study tiles.
- **Bandwidth** — typical CT study is 200–800 MB. Full upload is impractical for many clinics.
- **Trust** — radiologists are reluctant to give scanner data to third parties.
- **Speed** — local viewer reads from local MinIO; cloud only for AI batching.

## Why Not Build From Scratch

| Layer | Reused | Reason |
|---|---|---|
| DICOM core | Orthanc 1.12 | 5,000-page standard — no point re-implementing |
| Web viewer | OHIF v3 + Cornerstone3D | 18 months saved |
| LLM | Ollama qwen2.5 / AceGPT-13B | Open-weight Arabic models exist |
| Segmentation | MONAI | Curated medical model zoo |

What is **custom**:

- AI dispatcher + aggregator (multi-model ensemble routing)
- Arabic report generation pipeline
- WhatsApp delivery bridge for low-tech referring physicians
- QR-based external-doctor flow
- FHIR R4 mapping layer for legacy HIS/EMR

## Modular Suite (ADR-010)

midcine is shipped as 7 composable apps so a small clinic can adopt only what it needs:

`console` · `worklist` · `viewer` · `reader` · `patient` · `mobile` · `connect`

Each app talks to the same backend microservices but ships as an independent SPA. This avoids the "all-or-nothing" pricing trap of legacy PACS vendors.
