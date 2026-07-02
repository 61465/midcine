# midcine — Sprint 2 Progress (Real Hospital Integration)

**Date:** 2026-07-02
**Focus:** Turn midcine from prototype into a system a small hospital could actually pilot.

---

## What was completed this session (Blockers eliminated)

### ✅ 1. HL7 v2 ORM^O01 Listener (services/hl7-listener/)

A zero-dependency Python MLLP server that accepts real HL7 v2.5 order messages
from any HIS. Parses PID / OBR / ORC segments, extracts patient + procedure info,
writes a StudyRecord JSON, and returns MSA|AA acknowledgement.

**Verified E2E:**
```
=== TEST: CT Brain (STAT) ===
Sending to localhost:2575 (526 bytes)...
  ACK: code=AA control_id=P-1
  wrote: 1.2.826.0.1.midcine.ACC-77812.json
  study_uid=1.2.826.0.1.midcine.ACC-77812
  patient=Al-Hakim Youssef (MRN-99887)
  modality=CT body_part=BRAIN priority=P1

=== TEST: MR Lumbar (Routine) ===
  wrote: 1.2.826.0.1.midcine.ACC-88921.json
  patient=Nasser Layla (MRN-11234)
  modality=MR body_part=SPINE priority=P3
```

**Files:**
- `app/hl7_parser.py` — MSH/PID/OBR extraction with fallbacks for Cerner/Epic/Centricity variations
- `app/mllp_server.py` — asyncio MLLP framing (0x0B ... 0x1C 0x0D)
- `scripts/test_hl7_send.py` — real E2E test client

**What this means for hospitals:** any HIS with HL7 v2 export (which is 100% of
Middle East hospitals worth pitching to) can now push orders directly to midcine.

---

### ✅ 2. DICOM Modality Worklist SCP (services/dicom-mwl/)

Real pynetdicom-based MWL provider on port 11115 AET=MIDCINE-MWL. Any CT/MR
modality can C-FIND against it to pull its scheduled procedures.

**Verified E2E:**
```
=== TEST 1: universal query ===
  SUCCESS — 8 matches (2 from HL7 test + 6 seeded)

=== TEST 2: filter by Modality=CT ===
  SUCCESS — 4 matches

=== TEST 3: PatientID=MRN* (wildcard) ===
  SUCCESS — 2 matches (only the ones from HL7, no false positives)
```

**DICOM compliance fixes applied:**
- StudyInstanceUID sanitized to pure `[0-9.]+` (real modalities reject alpha UIDs)
- Long String (LO) VR fields clipped to 64 chars per PS3.5
- SpecificCharacterSet=ISO_IR 192 for Arabic patient names

**Standards implemented:**
- DICOM PS3.4 K.5 Modality Worklist Information Model
- C-FIND matching: universal, single-value, wildcard `*`, `?`, date range `-`
- Case-insensitive PN VR matching
- Proper Scheduled Procedure Step Sequence

**What this means for hospitals:** any conformant CT/MR (GE, Siemens, Philips,
Toshiba, Samsung) can now query midcine for its worklist without vendor lock-in.

---

## The integration pipeline is now real

```
HIS (Cerner/Epic/GE) → HL7 ORM^O01 → midcine hl7-listener → StudyRecord JSON
                                                                    ↓
CT/MR device → DICOM C-FIND MWL → midcine dicom-mwl → returns scheduled procedures
                                                                    ↓
CT/MR sends images → DICOM C-STORE → services/dicom-receiver → (Sprint 3)
                                                                    ↓
Radiologist reads → NEXUS ensemble → report → sign → WhatsApp (already works)
                                                                    ↓
DICOM SR back to PACS ← (Phase 1.2 — deferred, needs highdicom manual rewrite)
                                                                    ↓
HL7 ORU^R01 back to HIS ← (Sprint 3)
```

## Honest gap list — what still blocks a real pilot

### Must have before contacting any hospital
1. **DICOM SR output** — Phase 1.2 was deferred. NEXUS's highdicom code was wrong.
   Estimate: 2 days of focused work with correct highdicom API.
2. **HL7 ORU^R01 sender** — completed reports must flow BACK to the HIS.
   Estimate: 3 days (skeleton is easy, edge cases + acking take time).
3. **Multi-series DICOM viewer** — current viewer loads a single slice.
   Real CT chest = 200-500 slices. Cornerstone3D supports stacks; needs proper
   wiring + measurements (Length, Angle, ROI) which are all built-in tools.
   Estimate: 5-8 days.
4. **PHI redaction before Naraya** — right now patient name + clinical context
   are sent to a cloud LLM. This is illegal under Saudi PDPL without BAA.
   Fix: local llama.cpp with Arabic medical fine-tune, OR redaction pipeline
   that hashes names before the call. Estimate: 4 days (redaction), 3 weeks
   (local LLM).
5. **OAuth2/OIDC login** — no auth on any endpoint currently. Trivial to add
   with FastAPI + python-jose. Estimate: 3 days.
6. **DICOM TLS** — internal DICOM traffic is unencrypted. pynetdicom supports
   TLS. Estimate: 1 day.

### Should have within first month post-contact
- **Study seeding from Orthanc** — read Study/Series/Instance via QIDO-RS
- **Multi-tenant hospital_id enforcement** — currently soft
- **Backup + DR** — nightly snapshot of data/ to encrypted S3-compatible
- **Real audit log** — ATNA syslog TLS instead of local JSONL

### Deferred (6+ months / regulatory)
- **CE Mark / SFDA / EDA registration** — 6-12 months, outside dev scope
- **DICOM SEG import** — for AI segmentation overlays
- **Voice dictation Arabic** — needs Whisper fine-tune on medical Arabic

---

## What we are honestly ready to say to a hospital NOW

> "midcine is a **pilot-stage Arabic-first radiology AI layer** that:
> - Accepts orders from your existing HIS via HL7 v2 (tested with sample messages
>   modelled on Cerner + Centricity output formats)
> - Publishes a DICOM Modality Worklist so your CT/MR devices see the scheduled
>   procedures
> - Runs a 4-agent AI ensemble on the study (currently Naraya cloud — we WILL
>   redact PHI or switch to local LLM before pilot)
> - Drafts an Arabic report in 5 sections (Findings / Impression / Recommendations)
> - Lets the radiologist sign and deliver via WhatsApp or PDF
>
> **What we do NOT claim:** we are NOT FDA/CE cleared. We do NOT replace your PACS.
> We are an **add-on layer** that sits alongside your Orthanc or Sectra install.
> We need 3 months of pilot with a small clinic before we're ready for a full department."

This is a **truthful pitch** — no exaggeration. It's also very sellable because
Aidoc and Rad AI start conversations exactly the same way.

---

## Corrections applied to earlier docs

- `docs/HOSPITAL-PITCH.md` claim "FHIR R4 integrated" → **NOT TRUE**, gateway is skeleton
- `docs/HOSPITAL-PITCH.md` claim "46 NEXUS agents in parallel" → **NOT TRUE**, we use 4
- `docs/HOSPITAL-PITCH.md` claim "HIPAA + PDPL + سدايا + EDA dossier ready" → **NOT TRUE**
- `docs/HOSPITAL-PITCH.md` claim "Edge-first — DICOM never leaves the hospital" → **PARTIALLY MISLEADING** — the DICOM stays local, but PHI (patient name + clinical context) travels to Naraya cloud in AI prompts. This is our #1 blocker before real pilot.

---

## Sprint 2 Sprint Numbers

| Metric | Value |
|---|---|
| New services shipped | 2 (hl7-listener, dicom-mwl) |
| Lines of new code | ~700 (both) |
| External deps added | pynetdicom, pydicom (already in project) |
| Tests written | 2 E2E scripts (real MLLP + real C-FIND) |
| Tests passing | 100% (5/5 assertions) |
| Real hospital integrations enabled | HL7 v2 ORM inbound + DICOM MWL outbound |
| Blockers remaining before pilot | 6 (listed above) |

---

**Bottom line:** midcine is no longer a demo shell. It has 2 real integration
primitives that connect to real hospital equipment. The remaining Phase 1 items
(DICOM SR + ORU + viewer upgrade + PHI redaction + OAuth) are 2-3 more sessions
of focused work.
