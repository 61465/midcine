# Market Comparison — midcine vs the field

Written 2026-07-05. Based on 2026 web research of Horos, OHIF, Rad AI, Sectra, rScriptor.
This drives the priority list. Not a marketing doc — a gap audit.

## The reality check

The user's complaint on 2026-07-05: "cases page is empty, can't add anything, no DICOM
upload, no AI explanation." That is stage-0 broken. Real products cross that bar in the
first two minutes of a demo. This document forces us to build against the standard the
market has already set, not against what we imagine radiologists want.

## What real systems actually do

### Horos (open source, Mac-only, free)
- Import DICOM by drag-drop, from CD, from PACS via C-STORE
- Studies auto-organize by patient + date + modality
- Cornerstone-equivalent 2D/3D viewer with hanging protocols
- Plugin architecture; used by Royal College of Radiologists for FRCR
- Weakness: Mac only, dead upstream, no cloud, no AI

### OHIF Viewer (open source, browser, free)
- Zero-footprint browser viewer with **drag-drop upload built in**
- DICOMweb server (works with Orthanc)
- 2D/3D/MPR/MIP, measurement tools, annotations
- Extension framework for task-based workflow modes
- Multimodality fusion, RT Dose, DICOM Labelmap, ultrasound mode
- Weakness: viewer only, no reporting, no AI, no worklist logic

### Rad AI (commercial, closed, subscription)
- **The killer product**: auto-generated Impressions in 0.5–3s after findings dictated
- Reduces dictation time by 50%, words dictated by 90%
- Auto-inserts consensus guideline recommendations
- Saves 60+ minutes per shift — the number that sells the subscription

### rScriptor / RadRocket (commercial, structured reporting)
- Adaptive Structured Reporting — templates adjust per case
- SmartMacros: dictate only positive findings; negatives auto-inserted
- Voice recognition tightly integrated with template navigation

### Sectra (enterprise PACS/RIS)
- Reporting orchestrated inside the PACS, not bolted on
- AI-assisted impressions, prior context, quality checks embedded
- Measurements + image links + AI results flow directly into the report
- Enterprise-only, hospital procurement, six-figure deals

## Where midcine stands today (honest table)

| Capability | Horos | OHIF | Rad AI | Sectra | midcine |
|---|---|---|---|---|---|
| Drag-drop DICOM ingest | ✅ | ✅ | n/a | ✅ | **✅ (2026-07-05)** |
| Manual case entry (demo) | ➖ | ➖ | n/a | ➖ | **✅ (2026-07-05)** |
| Worklist with priority | ✅ | ➖ | n/a | ✅ | ✅ |
| Prior studies auto-linked | ✅ | ➖ | n/a | ✅ | ⚠️ endpoint only, no UI |
| Hanging protocols | ✅ | ⚠️ | n/a | ✅ | ❌ |
| Cornerstone viewer | ✅ | ✅ | n/a | ✅ | ⚠️ loader wired |
| Measurement / annotation | ✅ | ✅ | n/a | ✅ | ⚠️ partial |
| Structured templates | ➖ | ❌ | ✅ | ✅ | ⚠️ starter templates |
| SmartMacros (positive-only dictation) | ❌ | ❌ | ✅ | ✅ | ❌ |
| **AI Impression generator** | ❌ | ❌ | ✅ | ✅ | ❌ |
| Voice dictation | ➖ | ❌ | ✅ | ✅ | ⚠️ browser speech only |
| DICOM SR export | ✅ | ⚠️ | ✅ | ✅ | ✅ |
| PDF to referrer | ⚠️ | ❌ | ✅ | ✅ | ✅ |
| Multi-recipient send | ❌ | ❌ | ✅ | ✅ | **✅ (2026-07-04)** |

## The one feature that justifies $79/mo

**AI Impression generator** on the Rad AI pattern. This is the whole reason a private
radiologist would pay a subscription instead of using free Horos + a PACS viewer. Rad AI's
own marketing quantifies it at 60 min/shift saved. That is our killer feature. Everything
else — viewer, worklist, sending — is table stakes.

## Prioritized backlog (post-2026-07-05)

1. **Impression generator** (task #83). Naraya prompt tuned to output only an Impression
   paragraph from a Findings block. One button. Sub-second target with mistral-large-latest.
2. **Prior studies UI** (task #84). Real product screen; we already have the endpoint.
3. **Structured templates + SmartMacros**. Extend `templates.ts` from stubs to real
   ACR-aligned bodies (CT chest, CT abd/pelvis, MR brain, US abd, MG screening). Dictating
   a positive finding auto-removes the matching negative. This is the rScriptor pattern.
4. **Cornerstone hanging protocols**. Per modality + body-part, viewport layout preset.
5. **Voice dictation upgrade**. faster-whisper local CPU already scoped; wire it end-to-end.
6. **Prior comparison overlay** (Sectra pattern). Side-by-side prior vs current in viewer.

## What we explicitly are NOT building

- Full enterprise RIS. midcine is prosumer.
- Native Windows/Mac app. Browser only.
- Multi-tenant hospital admin console beyond what one radiologist + trainees need.
- HL7 v2 gateway on the prosumer plan (kept for hospital tier later).

## Sources
- [Horos Project](https://horosproject.org/)
- [OHIF Viewer docs](https://docs.ohif.org/)
- [Rad AI Reporting](https://www.radai.com/reporting)
- [rScriptor](https://scriptorsoftware.com/)
- [Sectra Radiology](https://medical.sectra.com/solutionarea/radiology-imaging/)
- [Radiology 2026 trends — Sirona Medical](https://sironamedical.com/blog/radiology-2026-trends/)
- [Intelerad — 8 workflow challenges](https://www.intelerad.com/en/2026/05/04/8-radiology-workflow-challenges-and-how-to-solve-them/)
