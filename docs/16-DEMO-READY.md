# midcine — Demo-ready 2026-07-06

## What was built in this sprint (2026-07-05 → 2026-07-06)

### Ingest layer
- `POST /studies` create + `DELETE /studies/{uid}` on bridge
- `POST /studies/{uid}/dicom` single-file upload
- `POST /studies/{uid}/series/{filename}` slice-by-slice series upload
- `GET /studies/{uid}/series` returns slice list for viewer
- `AddCaseDialog`: drag-drop single or multi-file, progress bar, symptoms + history fields
- `/upload` batch page
- 24-slice CT chest sample loaded as `DEMO-CT-001`

### Reader (Cornerstone3D 2.x)
- 2D stack + mouse wheel scroll + cine play/pause + fps + slider
- MPR mode: Axial + Sagittal + Coronal in 2x2 grid
- 3D volume rendering with CT-Bone / MR-Default presets
- MIP with `BlendModes.MAXIMUM_INTENSITY_BLEND`
- 10 W/L presets (Lung/Bone/Brain/Stroke/Abdomen/Mediastinum/Liver/MRI/…)
- 7 colormaps (Hot iron/PET/Rainbow/Jet/Bone/…)
- Tools: WindowLevel, Zoom, Pan, Length, Angle, EllipticalROI, PlanarFreehandROI, Probe
- Live pixel probe overlay: HU (CT) + raw value + X,Y coords
- Rotate 90° cumulative + Flip H/V + Zoom-to-fit
- Invert + Smooth/Pixel interpolation toggle
- Slice indicator overlay top-left
- Hanging protocols: WL + colormap + rotation + invert saved per modality/body_part in localStorage; auto-applied on next case of same combo

### AI
- `POST /ai/impression` on bridge; Naraya (mistral-large) + ACR prompt
- Latency ~8-10s; produces Fleischner/BI-RADS/Lung-RADS-tagged impressions
- `✨ AI Impression` button in ReportComposer

### Workflow
- Symptoms + clinical_history fields on StudyRecord (DICOM 0032,1030 semantic)
- Prior Studies Strip above viewer (Sectra-style)
- Multi-recipient send (previous sprint)
- Sign + PDF + DICOM SR (previous sprint)

### Docs
- `docs/14-MARKET-COMPARISON.md` — Horos/OHIF/Rad AI/Sectra gap
- `docs/15-HOROS-GAP.md` — brutal honest audit
- `docs/16-DEMO-READY.md` — this file

## Score card vs Horos

Category | Horos | midcine
---|---|---
Data model (patient/study/series/instance) | ✅ | ✅ (series added)
Multi-slice cine + wheel scroll | ✅ | ✅
MPR (Ax/Sag/Cor) | ✅ | ✅
3D volume + MIP | ✅ | ✅
Hanging protocols | ✅ | ✅ (localStorage per modality/body_part)
Pixel probe / HU readout | ✅ | ✅
W/L presets | ✅ | ✅ (10)
Colormaps | ✅ | ✅ (7)
Basic measurements | ✅ | ✅ (Length/Angle/ROI)
Freehand ROI / polygon | ✅ | ✅
Rotate / flip | ✅ | ✅
Report editor | ⚠️ | ✅
Sign + PDF + SR | ⚠️ | ✅
**AI Impression** | ❌ | ✅
Multi-recipient send | ❌ | ✅

## Still not built (documented, roadmap items)
- Reference-line sync between MPR panes
- Cross-hair sync
- PACS Q/R (C-FIND/C-MOVE) — hospital tier feature
- DICOM anonymize/export
- Structured template SmartMacros (rScriptor pattern)
- Voice dictation upgrade (faster-whisper CPU)
- Curved MPR / vessel tracing

## Smoke test results (2026-07-06 rebuild)

```
Routes: /room=200 /upload=200 /settings=200 /billing=200 /anatomy=200 /login=200 /signup=200
API:    /api/mcp/studies=200 /api/mcp/integrations/health=200
Studies stored: 2 (24-slice CT + 1-slice MR)
AI Impression: 8.1s latency, returns Lung-RADS 4X with Fleischner reference
Prior studies endpoint: returns count for demo patient
```

## Demo script

1. Open `http://localhost:3000/room` (Ctrl+Shift+R first time to bypass cache)
2. Two cases in worklist:
   - **Demo Series · CT · CHEST** (24 slices, symptoms = chronic cough R/O malignancy)
   - **Anonymized Demo · MR · MSK** (1 slice knee, symptoms = football injury)
3. Click Demo Series:
   - Auto-loads Lung W/L preset (saved as hanging protocol)
   - Symptoms badge (amber) + HX badge (slate) below viewer
   - Mouse wheel = scroll through 24 slices; slice indicator top-left
   - Play button = cine; fps input to adjust
   - Click **MPR** pill → 2×2 grid: Axial (cyan) + Sagittal (fuchsia) + Coronal (emerald)
   - Click **3D Volume** → skull/bone rendering with CT-Bone preset
   - Click **MIP** → nodule/vessel highlighting
   - Type findings in right column → click **✨ AI Impression** → wait 8–10s → structured impression with Lung-RADS + Fleischner
4. Sign (S shortcut) → PDF + DICOM SR generated
5. Send to referrer (multi-recipient dialog)

## Ready for demo? YES.
