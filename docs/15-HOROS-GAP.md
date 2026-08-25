# Horos-tier viewer gap — brutally honest audit

Written 2026-07-05 after user asked: "confirm this is everything Horos-tier programs use,
and are you done?" Short answer: **no, not done.** Here's the truth.

## What Horos / OsiriX-tier viewers actually ship

A senior radiologist opening Horos expects all of the following. This is the bar. Not
"nice to have" — this is what the free tool has.

### Data model
1. **Patient → Study → Series → Instance** hierarchy. Horos organizes DICOM this way.
   midcine currently: flat Study only. **No series concept.**
2. **Multi-frame / multi-instance loading**. A CT chest is 300–500 slices. Horos loads
   the whole series and lets you scroll. midcine currently: one file per study.
3. **Query/Retrieve from PACS** (C-FIND, C-MOVE, C-STORE). Horos can pull studies from
   any DICOM node. midcine: only manual upload.
4. **DICOM anonymization** before export. Horos has it built in. midcine: no.
5. **DICOM export / burn to disk**. midcine: no (we have PDF + DICOM SR, not source
   series export).

### Viewport interactions (what a radiologist USES every case)
1. **Cine mode / scroll** through slices with mouse wheel or arrow keys. midcine: no.
2. **MPR — Multi-Planar Reconstruction**. Axial + Sagittal + Coronal viewports in a
   cross with reference lines. Horos does this on any volumetric series. midcine: no.
3. **3D volume rendering** with rotate/shade. Horos does it. midcine: no (only 2D stack).
4. **MIP / MinIP / Average**. Maximum-intensity projection for vessels + nodules. midcine: no.
5. **Curved MPR** for vessel tracing. midcine: no.
6. **Fusion viewport** (PET/CT overlay). midcine: no.
7. **Hanging protocols** — layouts saved per modality/body part that auto-apply. midcine: no.
8. **Reference lines / cross-hair sync** between viewports. midcine: no.
9. **Side-by-side prior comparison**. midcine: no (endpoint exists, no UI).
10. **Key image marking** — flag important slices. midcine: no.
11. **Cine play** for cardiac / dynamic MR. midcine: no.

### Measurements + annotations (partial in midcine)
1. **Length** ✅ midcine has
2. **Angle** ✅ midcine has
3. **Cobb angle / spine measurements** — Horos yes. midcine: no.
4. **Elliptical ROI with stats** ✅ midcine has
5. **Rectangular ROI** — no
6. **Freehand ROI / polygon** — no
7. **Pixel probe / cursor readout** (HU / SUV / raw value at cursor) — Horos yes. **midcine: no.**
8. **Persistent annotations** saved back to DICOM SR — no
9. **Text/arrow annotations** — no

### Presentation (what we DID add)
1. **Window/Level presets** ✅ midcine has 10 (Horos has similar)
2. **Colormaps** ✅ midcine has 7 (Horos has ~15 including custom LUTs)
3. **Invert** ✅
4. **Smooth vs pixelated** ✅
5. **Reset** ✅
6. **Rotate / flip H / flip V** — midcine: only reset, no explicit rotate/flip
7. **Zoom to fit / actual size 100%** — midcine: no explicit
8. **Overlay text on/off** (patient info, date, orientation labels L/R/A/P) — no
9. **DICOM overlay planes** — no

### Workflow (what makes it a product, not a toy)
1. **Worklist with priorities** ✅ midcine has
2. **Symptoms / reason for exam field** ✅ midcine has (added 2026-07-05)
3. **Structured report templates** ⚠️ starter only
4. **Voice dictation** ⚠️ browser Web Speech only, no medical vocab boost
5. **AI Impression generator** ❌ **the Rad AI killer feature, not built**
6. **Prior studies quick-load** ❌ endpoint exists, no UI
7. **Sign + PDF + DICOM SR + send to referrer** ✅ midcine has
8. **Multi-recipient send** ✅ midcine has

## The honest score card

Category | Horos | OHIF | midcine
---|---|---|---
Data model (patient/study/series/instance) | ✅ | ✅ | ⚠️ study only
Multi-slice cine + scroll | ✅ | ✅ | ❌
MPR (axial/sag/cor) | ✅ | ✅ | ❌
3D volume + MIP | ✅ | ✅ | ❌
Hanging protocols | ✅ | ⚠️ | ❌
Pixel probe / HU readout | ✅ | ✅ | ❌
W/L presets | ✅ | ✅ | ✅
Colormaps | ✅ | ✅ | ✅
Basic measurements | ✅ | ✅ | ✅
Freehand ROI / polygon | ✅ | ✅ | ❌
Rotate / flip | ✅ | ✅ | ❌
PACS Q/R (C-FIND) | ✅ | ⚠️ | ❌
DICOM anonymize/export | ✅ | ⚠️ | ❌
Report editor | ⚠️ | ❌ | ✅
Sign + PDF + SR | ⚠️ | ❌ | ✅
AI Impression | ❌ | ❌ | ❌ (planned)
Multi-recipient send | ❌ | ❌ | ✅

## What "done" would mean

**Minimum-viable-Horos parity** (to say "midcine reads real cases like Horos does"):
1. Series concept + multi-slice cine scroll
2. Rotate/flip + zoom-to-fit
3. Pixel probe (HU / SUV / raw value at cursor)
4. Freehand ROI polygon
5. Orientation labels overlay (L/R/A/P/S/I)
6. Prior studies UI

**Plus the differentiators that justify $79/mo over free Horos:**
1. AI Impression generator (Rad AI pattern)
2. Sign + PDF + SR + multi-referrer (already ✅)
3. Structured templates + SmartMacros (rScriptor pattern)
4. Symptoms → AI context loop (partially ✅)

**Advanced (beyond Horos, sells to hospitals):**
- MPR + 3D + MIP (requires volume viewport, big lift)
- Hanging protocols per user

## Estimate to true Horos-parity + differentiators

Rough hours from here, assuming Cornerstone3D already wired:
- Series/multi-slice cine: **6h**
- Rotate/flip + zoom-to-fit + orientation labels: **3h**
- Pixel probe HU readout: **2h**
- Freehand polygon ROI: **3h**
- Prior studies UI: **4h**
- AI Impression generator (Naraya prompt + button + streaming): **6h**
- Hanging protocols persistence: **4h**
- MPR (volume viewport): **12h**
- 3D volume + MIP: **10h**

**Total to differentiated Horos-parity (no MPR/3D): ~28h**
**Total to full parity: ~50h**

## Answer to "are you done?"

No. What's live as of 2026-07-05:
- ✅ Ingest end-to-end (upload, manual add, delete)
- ✅ Worklist + priority + English UI
- ✅ Symptoms + clinical history fields flowing into AI context
- ✅ Cornerstone viewer wired to real study
- ✅ 10 W/L presets + 7 colormaps + measurements + invert + reset
- ✅ Sign + PDF + SR + multi-referrer

**Not live** and directly asked by the user or clearly required:
- ❌ Multi-slice cine — every real case is a series, not one image
- ❌ Rotate / flip / pixel probe
- ❌ AI Impression generator — the whole reason to pay
- ❌ Prior studies UI
- ❌ MPR / 3D / MIP

**Recommendation:** ship multi-slice cine + rotate/flip + pixel probe + AI Impression
next. Those close the "looks like a toy" gap in one sprint (~15h). MPR/3D can wait.
