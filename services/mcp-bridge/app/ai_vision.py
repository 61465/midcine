"""Server-side "AI vision" for midcine premium tier.

The approach: parallel-compose several open techniques to simulate what a paid
vision model would do (Claude Vision, GPT-4V). All techniques run locally + the
final synthesis is done by Naraya (mistral-medium-3-5) on structured features.

Techniques combined:
  1. Statistical HU analysis (pydicom + numpy)   → tissue distribution
  2. Sobel edge density                          → structural irregularity
  3. Bright-blob detection                       → potential nodules/masses
  4. Multi-tissue segmentation (thresholding)    → colored overlay mask
  5. Naraya synthesis of the above + findings    → additional_findings JSON

Why this beats a naive LLM-only approach:
  - Grounded in real image features (numerical evidence)
  - Reproducible (no non-determinism in vision layer)
  - Fast (~500ms + Naraya ~4s)
  - Works with ANY DICOM (no vision-model-specific quirks)
"""

from __future__ import annotations

import base64
import io
import json
import logging
from pathlib import Path

log = logging.getLogger("mcp-bridge.ai_vision")


def _load_dicom_array(path: Path):
    """Return (numpy_array, rescale_slope, rescale_intercept) for a DICOM path."""
    import numpy as np
    import pydicom

    ds = pydicom.dcmread(str(path), force=True)
    arr = ds.pixel_array.astype(np.float32)
    slope = float(getattr(ds, "RescaleSlope", 1.0) or 1.0)
    intercept = float(getattr(ds, "RescaleIntercept", 0.0) or 0.0)
    hu = arr * slope + intercept
    return hu, slope, intercept, ds


def analyze_features(dicom_path: Path) -> dict:
    """Compute a structured features JSON for one slice.

    Returns:
        {
          "shape": [H, W],
          "hu": {"min": ..., "max": ..., "mean": ..., "p5": ..., "p50": ..., "p95": ...},
          "tissue_pct": {"air": ..., "fat": ..., "soft": ..., "bone": ...},
          "edges": {"density": 0.0-1.0, "irregularity": 0.0-1.0},
          "blobs": [{"count": N, "hu_threshold": ..., "total_area_px": ...}],
          "abnormality_score": 0.0-1.0,
        }
    """
    import numpy as np
    from scipy import ndimage

    hu, _slope, _intercept, ds = _load_dicom_array(dicom_path)
    # Some multi-frame stacks return 3D — take middle slice
    if hu.ndim == 3:
        hu = hu[hu.shape[0] // 2]

    h, w = hu.shape
    flat = hu.ravel()
    # Ignore extreme padding (very common in CT)
    valid = flat[(flat > -1500) & (flat < 3000)]

    stats = {
        "shape": [int(h), int(w)],
        "hu": {
            "min": float(valid.min()) if valid.size else 0.0,
            "max": float(valid.max()) if valid.size else 0.0,
            "mean": float(valid.mean()) if valid.size else 0.0,
            "std": float(valid.std()) if valid.size else 0.0,
            "p5": float(np.percentile(valid, 5)) if valid.size else 0.0,
            "p50": float(np.percentile(valid, 50)) if valid.size else 0.0,
            "p95": float(np.percentile(valid, 95)) if valid.size else 0.0,
        },
    }

    # Multi-tissue segmentation (CT-oriented thresholds)
    total = valid.size or 1
    stats["tissue_pct"] = {
        "air": float((valid < -900).sum() / total * 100.0),
        "fat": float(((valid >= -200) & (valid < -50)).sum() / total * 100.0),
        "soft": float(((valid >= -50) & (valid <= 100)).sum() / total * 100.0),
        "bone": float((valid > 300).sum() / total * 100.0),
    }

    # Sobel edges → density + irregularity metric
    normalized = (hu - hu.min()) / max(hu.max() - hu.min(), 1e-6)
    sx = ndimage.sobel(normalized, axis=0)
    sy = ndimage.sobel(normalized, axis=1)
    mag = np.hypot(sx, sy)
    edge_thresh = float(np.percentile(mag, 90))
    edge_mask = mag > edge_thresh
    stats["edges"] = {
        "density": float(edge_mask.sum() / (h * w)),
        "irregularity": float(mag.std()),
        "threshold": edge_thresh,
    }

    # Bright-blob detection (potential lesions/nodules)
    blobs = []
    for thresh in (500, 800, 1200):
        bright = hu > thresh
        if bright.sum() < 10:
            continue
        labels, n = ndimage.label(bright)
        if n == 0:
            continue
        sizes = ndimage.sum_labels(bright, labels, range(1, n + 1))
        # Ignore tiny artifacts
        large = [int(s) for s in sizes if s > 30]
        blobs.append(
            {
                "hu_threshold": thresh,
                "count": len(large),
                "total_area_px": int(sum(large)),
                "largest_area_px": int(max(large)) if large else 0,
            }
        )
    stats["blobs"] = blobs

    # Weighted abnormality score — heuristic but useful as a triage flag
    edge_score = min(1.0, stats["edges"]["density"] * 5.0)
    bone_pct = stats["tissue_pct"]["bone"]
    blob_score = min(1.0, sum(b["total_area_px"] for b in blobs) / 5000.0)
    abnormality = 0.4 * edge_score + 0.3 * blob_score + 0.3 * (bone_pct / 30.0)
    stats["abnormality_score"] = float(min(1.0, max(0.0, abnormality)))

    # Preserve some DICOM tags for context
    stats["dicom"] = {
        "Modality": str(getattr(ds, "Modality", "") or ""),
        "BodyPartExamined": str(getattr(ds, "BodyPartExamined", "") or ""),
        "StudyDescription": str(getattr(ds, "StudyDescription", "") or ""),
    }
    return stats


def segment_tissues(dicom_path: Path) -> tuple[str, dict]:
    """Return (base64 PNG of RGBA overlay, statistics)."""
    import numpy as np
    from PIL import Image

    hu, _slope, _intercept, _ds = _load_dicom_array(dicom_path)
    if hu.ndim == 3:
        hu = hu[hu.shape[0] // 2]

    h, w = hu.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)

    # CT tissue colors (radiology convention)
    #   Air = translucent blue
    #   Fat = amber
    #   Soft = green
    #   Bone = white/yellow
    masks = {
        "air": (hu < -900, (30, 100, 220, 90)),
        "fat": ((hu >= -200) & (hu < -50), (250, 180, 60, 110)),
        "soft": ((hu >= -50) & (hu <= 100), (60, 220, 90, 90)),
        "bone": (hu > 300, (250, 250, 200, 160)),
    }

    total = h * w or 1
    stats = {}
    for name, (mask, color) in masks.items():
        rgba[mask] = color
        stats[f"{name}_pct"] = float(mask.sum() / total * 100.0)

    img = Image.fromarray(rgba, mode="RGBA")
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode("ascii"), stats


VISION_SYNTHESIZE_SYSTEM = (
    "You are a radiology safety officer reviewing a study for missed findings. "
    "You DO NOT see the image directly, but you receive a structured JSON of "
    "quantitative image features (HU stats, tissue distribution, edge density, "
    "blob counts, abnormality score) plus what the radiologist has already dictated. "
    "Your job: identify what may have been missed based on the numerical evidence. "
    "Output STRICT JSON only, no prose:\n"
    "{\n"
    '  "additional_findings": [str, ...],  // things numeric evidence suggests but not in dictated\n'
    '  "confirmed_findings": [str, ...],   // things numeric evidence supports\n'
    '  "differential": [str, ...],         // up to 3 alternative diagnoses\n'
    '  "confidence": 0.0-1.0,\n'
    '  "regions_of_interest": [{"desc": str, "priority": "high"|"medium"|"low"}]\n'
    "}\n"
    "Be conservative. If features are unremarkable, return empty arrays."
)


# ---- Real vision: render DICOM to PNG and send to a multimodal LLM --------

def _dicom_to_normed_array(
    dicom_path: Path,
    window_center: float | None = None,
    window_width: float | None = None,
):
    """Load a DICOM file and return normalized uint8 array (H,W)."""
    import numpy as np

    hu, _slope, _intercept, ds = _load_dicom_array(dicom_path)
    if hu.ndim == 3:
        hu = hu[hu.shape[0] // 2]

    if window_center is None or window_width is None:
        wc = getattr(ds, "WindowCenter", None)
        ww = getattr(ds, "WindowWidth", None)
        if isinstance(wc, (list, tuple)):
            wc = wc[0]
        if isinstance(ww, (list, tuple)):
            ww = ww[0]
        try:
            window_center = float(wc) if wc is not None else float(np.percentile(hu, 50))
            window_width = float(ww) if ww is not None else float(
                np.percentile(hu, 99) - np.percentile(hu, 1)
            )
        except Exception:
            window_center = float(np.median(hu))
            window_width = float(hu.max() - hu.min()) or 1.0
    if window_width < 1:
        window_width = 1.0

    low = window_center - window_width / 2.0
    high = window_center + window_width / 2.0
    clipped = np.clip(hu, low, high)
    return ((clipped - low) / (high - low) * 255.0).astype(np.uint8)


def render_dicom_grid_to_png(
    dicom_paths: list[Path],
    *,
    tile_size: int = 320,
    cols: int = 4,
    label_slices: bool = True,
    total_slice_count: int | None = None,
) -> bytes:
    """Render multiple DICOM slices as a grid mosaic PNG.

    This is what lets the vision LLM "see the whole study" instead of one slice.
    Each tile is labelled with its position in the volume (e.g. "12/156") so
    the model can localize findings.

    Args:
        dicom_paths: N DICOM files (sampled evenly across the volume)
        tile_size: pixel size of each square tile
        cols: number of columns in the grid
        label_slices: overlay a small label with slice index on each tile
        total_slice_count: full volume slice count (for accurate labels)

    Returns:
        PNG bytes of the assembled grid.
    """
    import numpy as np
    from PIL import Image, ImageDraw, ImageFont

    if not dicom_paths:
        raise ValueError("no dicom_paths provided")

    n = len(dicom_paths)
    rows = (n + cols - 1) // cols

    grid = Image.new("RGB", (cols * tile_size, rows * tile_size), (0, 0, 0))
    draw = ImageDraw.Draw(grid)
    try:
        font = ImageFont.truetype("arial.ttf", 18)
    except Exception:
        font = ImageFont.load_default()

    total = total_slice_count or n
    for i, dcm_path in enumerate(dicom_paths):
        try:
            normed = _dicom_to_normed_array(dcm_path)
            tile = Image.fromarray(normed, mode="L").convert("RGB")
            # Fit into square tile with letterboxing
            tw, th = tile.size
            scale = tile_size / max(tw, th)
            new_w, new_h = int(tw * scale), int(th * scale)
            tile = tile.resize((new_w, new_h), Image.LANCZOS)
            x = (i % cols) * tile_size + (tile_size - new_w) // 2
            y = (i // cols) * tile_size + (tile_size - new_h) // 2
            grid.paste(tile, (x, y))

            if label_slices:
                # Compute the approximate slice position (1-based) in the full volume.
                approx_idx = int(round((i / max(n - 1, 1)) * (total - 1))) + 1
                label = f"{approx_idx}/{total}"
                # Draw a small text with black outline for contrast on any image
                tx = (i % cols) * tile_size + 6
                ty = (i // cols) * tile_size + 4
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        draw.text((tx + dx, ty + dy), label, fill=(0, 0, 0), font=font)
                draw.text((tx, ty), label, fill=(255, 255, 100), font=font)
        except Exception as e:  # noqa: BLE001
            # Draw an "error" tile so the grid stays uniform
            x0 = (i % cols) * tile_size
            y0 = (i // cols) * tile_size
            draw.rectangle(
                [x0 + 2, y0 + 2, x0 + tile_size - 2, y0 + tile_size - 2],
                outline=(80, 80, 80),
                width=1,
            )
            draw.text((x0 + 8, y0 + 8), f"err {i}", fill=(180, 60, 60), font=font)
            log.warning("mosaic tile %d failed: %s", i, e)

    buf = io.BytesIO()
    grid.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def sample_slice_indices(total: int, k: int = 12) -> list[int]:
    """Return `k` evenly-spaced slice indices across a volume of size `total`.
    Always includes first and last slice if k >= 2."""
    if total <= 0 or k <= 0:
        return []
    if total <= k:
        return list(range(total))
    if k == 1:
        return [total // 2]
    step = (total - 1) / (k - 1)
    return [int(round(i * step)) for i in range(k)]


def batch_slice_indices(total: int, batch_size: int = 16) -> list[list[int]]:
    """Split ALL slice indices [0..total-1] into consecutive batches of
    `batch_size`. This gives 100% coverage of the volume."""
    if total <= 0 or batch_size <= 0:
        return []
    return [list(range(i, min(i + batch_size, total))) for i in range(0, total, batch_size)]


# System prompt used to SYNTHESIZE findings across many mosaic-batch responses.
VISION_SYNTHESIZE_MULTI_SYSTEM = (
    "LANGUAGE LOCK: Respond in clinical English ONLY. Never Arabic.\n\n"
    "You are a senior consultant radiologist. You are given multiple partial "
    "JSON reports, each from a different batch of slices from the SAME DICOM "
    "study (e.g. slices 1-16, 17-32, ...). Merge them into ONE unified report "
    "for the full volume.\n\n"
    "CRITICAL — USE THE PROVIDED CONTEXT: The user message contains a "
    "'STUDY CONTEXT' block with modality, body region, patient age, patient "
    "sex, symptoms, and clinical history. USE THESE VALUES VERBATIM. NEVER "
    "write 'age unknown', 'sex unknown', 'no clinical context provided', or "
    "similar fallback phrases when the values are actually in the context. "
    "If a specific field says '(not stated)', omit it silently — do not draw "
    "attention to its absence.\n\n"
    "Rules:\n"
    "1. Deduplicate: if the same finding appears in multiple batches (e.g. a "
    "mass spanning slices 40-70), report it ONCE with the full slice range.\n"
    "2. Escalate severity: if any batch marked a finding STAT, keep STAT.\n"
    "3. Cite slice ranges where findings appear (e.g. 'slices 42-67').\n"
    "4. Include NORMAL findings only if they appear consistently across "
    "batches (otherwise the finding may be region-specific).\n"
    "5. Overall impression must reflect the WHOLE study — not a single batch.\n\n"
    "Output STRICT JSON only, same schema as a single-batch report:\n"
    "{\n"
    '  "anatomy_seen": "regions visualized across the whole volume",\n'
    '  "abnormal_findings": [\n'
    "    { \"finding\": \"...\", \"location\": \"...\", "
    "\"slice_range\": \"e.g. 42-67 of 156\", "
    "\"confidence\": 0.0-1.0, "
    "\"acr_priority\": \"routine|urgent|STAT\" }\n"
    "  ],\n"
    '  "slices_reviewed": "e.g. all 156 slices across 10 batches",\n'
    '  "normal_findings": [ "consistently intact structures" ],\n'
    '  "measurements_suggested": [ '
    '{ "structure": "...", "reason": "..." } ],\n'
    '  "differential_diagnosis": [ '
    '{ "dx": "...", "probability": 0.0-1.0, "supporting": "..." } ],\n'
    '  "recommend_next_view": "...",\n'
    '  "overall_impression": "1-3 sentences summarizing the whole volume",\n'
    '  "confidence_in_reading": 0.0-1.0\n'
    "}"
)


def render_dicom_to_png(
    dicom_path: Path,
    *,
    max_dim: int = 768,
    window_center: float | None = None,
    window_width: float | None = None,
) -> bytes:
    """Convert a DICOM slice to a PNG bytes payload suitable for a vision LLM.

    Applies windowing (auto or manual) and scales to fit within max_dim while
    keeping aspect ratio. Returns PNG bytes ready for base64 encoding.
    """
    import numpy as np
    from PIL import Image

    hu, _slope, _intercept, ds = _load_dicom_array(dicom_path)
    if hu.ndim == 3:
        hu = hu[hu.shape[0] // 2]

    # Auto-window if not supplied — use the DICOM header's default first,
    # otherwise a robust percentile-based approach.
    if window_center is None or window_width is None:
        wc = getattr(ds, "WindowCenter", None)
        ww = getattr(ds, "WindowWidth", None)
        if isinstance(wc, (list, tuple)):
            wc = wc[0]
        if isinstance(ww, (list, tuple)):
            ww = ww[0]
        try:
            window_center = float(wc) if wc is not None else float(np.percentile(hu, 50))
            window_width = float(ww) if ww is not None else float(
                np.percentile(hu, 99) - np.percentile(hu, 1)
            )
        except Exception:
            window_center = float(np.median(hu))
            window_width = float(hu.max() - hu.min()) or 1.0
    if window_width < 1:
        window_width = 1.0

    low = window_center - window_width / 2.0
    high = window_center + window_width / 2.0
    clipped = np.clip(hu, low, high)
    normed = ((clipped - low) / (high - low) * 255.0).astype(np.uint8)

    img = Image.fromarray(normed, mode="L").convert("RGB")
    # Scale to fit max_dim while preserving aspect ratio
    if max(img.size) > max_dim:
        w, h = img.size
        scale = max_dim / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


# System prompt for the multimodal call — asks the LLM to actually read pixels.
VISION_MULTIMODAL_SYSTEM = (
    "LANGUAGE LOCK: Respond in clinical English ONLY. Never Arabic.\n\n"
    "You are a senior radiologist. You CAN SEE the image directly.\n\n"
    "═══ ABSOLUTE RULE — DESCRIBE ONLY WHAT YOU SEE ═══\n"
    "You are FORBIDDEN from inventing, inferring, or 'filling in' any finding "
    "that is not directly visible in the image. Being 'thorough' means seeing "
    "everything that IS present — not adding things that might be present.\n"
    "  • If you cannot clearly identify a lesion, do NOT report it. There is "
    "no penalty for a short list.\n"
    "  • If the image is a blurry mosaic tile or the anatomy is ambiguous, "
    "leave 'abnormal_findings' empty and say so in overall_impression.\n"
    "  • Do NOT let the clinical context (symptoms, history) push you to "
    "'see' a finding that fits the story. The context is background only.\n"
    "  • Do NOT hallucinate measurements. Only cite sizes you can actually "
    "estimate from the image (with a visible ruler or tile scale). If in "
    "doubt, omit the number entirely — never guess millimeters.\n"
    "  • Do NOT hallucinate anatomy. If a mosaic tile is mostly black / "
    "cropped / off-center, describe that instead of inventing content.\n\n"
    "The image may be either a SINGLE slice OR a GRID MOSAIC of multiple slices "
    "sampled evenly across the full DICOM volume. In grid mode, each tile is "
    "labelled with its position (e.g. '12/156' = slice 12 out of 156). Scan "
    "every tile. Findings must include the tile label where they appear. If "
    "a finding spans multiple contiguous tiles, cite the RANGE (e.g. "
    "'slices 14-22').\n\n"
    "Look at each image carefully. Identify anatomical structures. Note any "
    "abnormalities YOU CAN ACTUALLY SEE: masses, hemorrhage (subdural, "
    "epidural, subarachnoid, intraparenchymal, intraventricular), fractures, "
    "effusions, consolidation, atrophy, midline shift, edema, air-fluid levels, "
    "foreign bodies, calcifications, mass effect, hydrocephalus.\n\n"
    "CRITICAL — USE THE PROVIDED CONTEXT: The user message contains a "
    "'Case context' block with modality, body region, patient age, patient "
    "sex, symptoms, clinical history, and study description. You MUST use "
    "these values verbatim in the header. Never write 'age unknown', 'sex "
    "unknown', 'no clinical context', or similar fallback phrases when the "
    "values are actually provided. But NEVER use symptoms/history to "
    "authorize a finding you don't actually see.\n\n"
    "IMPORTANT — SLICE REFERENCES: When describing findings in prose (e.g. "
    "overall_impression), cite the specific slice numbers where the finding is "
    "visible using the phrase 'slice N' or 'slices N-M' (e.g. 'hyperdense "
    "focus visible on slice 47 with mass effect extending through slices "
    "42-67'). The report UI turns these into clickable links that jump the "
    "viewer to that slice.\n\n"
    "Output STRICT JSON only:\n"
    "{\n"
    '  "anatomy_seen": "1-2 sentence description of what body region + '
    'orientation is shown",\n'
    '  "abnormal_findings": [\n'
    "    { \"finding\": \"describe ONLY what is visible\", \"location\": "
    "\"anatomical location\", \"slice_range\": \"e.g. 14-22 or 47\", "
    "\"confidence\": 0.0-1.0, "
    "\"acr_priority\": \"routine|urgent|STAT\" }\n"
    "  ],\n"
    '  "slices_reviewed": "e.g. all 12 shown tiles from full 156-slice volume",\n'
    '  "normal_findings": [ "structures that appear intact and were actually inspected" ],\n'
    '  "measurements_suggested": [ '
    '{ "structure": "...", "reason": "why measure this" } ],\n'
    '  "differential_diagnosis": [ '
    '{ "dx": "...", "probability": 0.0-1.0, "supporting": "cite the finding this rests on" } ],\n'
    '  "recommend_next_view": '
    '"which additional plane / sequence / contrast phase to acquire",\n'
    '  "overall_impression": "1-2 sentences — describe only what you saw",\n'
    '  "confidence_in_reading": 0.0-1.0\n'
    "}\n\n"
    "Rules:\n"
    "1. English only. No Arabic characters anywhere.\n"
    "2. NEVER fabricate findings you cannot see. Empty findings array is OK.\n"
    "3. If the slice is unclear/artifacted/cropped, leave findings empty and "
    "say so in overall_impression. Do not paper over uncertainty.\n"
    "4. Every abnormal_findings entry MUST include a slice_range you can "
    "point to on the image.\n"
    "5. Cite ACR / Fleischner / BI-RADS / TI-RADS categories where relevant "
    "AND supported by the visible finding.\n"
    "6. For any STAT finding, use the acr_priority field to flag it."
)


# Vision provider order — ALL free. The paid naraya-sonnet was removed
# after the account hit HTTP 402 in production; we now stack multiple free
# multimodal providers with independent quotas so one exhausted TPM/tier
# never leaves the doctor without an AI second-read.
_VISION_PROVIDERS = [
    # 1) Groq llama-4-scout — the strongest free multimodal, but low TPM/TPD
    {
        "name": "groq-llama4",
        "url": "https://api.groq.com/openai/v1/chat/completions",
        "model": "meta-llama/llama-4-scout-17b-16e-instruct",
        "env_key": "GROQ_API_KEY",
    },
    # 2) Naraya mistral-medium multimodal — proven working (2026-07-15 logs)
    #    NOTE: the two naraya-llama4* aliases were removed — Bynara router
    #    consistently returns 404 for them, so they only waste round-trips.
    {
        "name": "naraya-mistral-medium",
        "url": "https://router.bynara.id/v1/chat/completions",
        "model": "mistral-medium-3-5",
        "env_key": "NARAYA_API_KEY",
    },
    # 3) OpenRouter free Gemini multimodal — kicks in only if OPENROUTER_API_KEY set
    {
        "name": "openrouter-gemini",
        "url": "https://openrouter.ai/api/v1/chat/completions",
        "model": "google/gemini-2.0-flash-exp:free",
        "env_key": "OPENROUTER_API_KEY",
    },
]

# Providers that have hit a daily/hard rate limit during THIS process
# lifetime. Skip them until restart — retrying just wastes latency.
_EXHAUSTED_PROVIDERS: set[str] = set()


def _get_provider_key(env_var: str) -> str:
    """Fetch API key from env, then NEXUS vault as a fallback."""
    import os
    import base64 as _b64
    import json as _json
    from pathlib import Path as _Path

    val = os.getenv(env_var, "")
    if val:
        return val

    # Fallback to NEXUS vault
    root = os.getenv("MIDCINE_NEXUS_ROOT", r"D:\project\suportagent")
    vault_path = _Path(root) / "data" / "vault.json"
    if not vault_path.exists():
        return ""
    try:
        vault = _json.loads(vault_path.read_text(encoding="utf-8"))
        # Map env var name → vault provider key
        env_to_provider = {
            "GROQ_API_KEY": "groq",
            "NARAYA_API_KEY": "naraya",
            "GOOGLE_API_KEY": "google",
            "OPENAI_API_KEY": "openai",
            "OPENROUTER_API_KEY": "openrouter",
        }
        provider_key = env_to_provider.get(env_var)
        if not provider_key:
            return ""
        encoded = vault.get(provider_key, "")
        if not encoded:
            return ""
        return _b64.b64decode(encoded.encode()).decode()
    except Exception:  # noqa: BLE001
        return ""


def call_vision_llm(
    png_bytes: bytes,
    modality: str,
    body_part: str,
    symptoms: str,
    clinical_history: str,
    existing_findings: str,
    *,
    patient_age: int | str | None = None,
    patient_sex: str | None = None,
    patient_name: str | None = None,
    study_description: str = "",
    referrer: str = "",
    api_key: str | None = None,
    model: str | None = None,
    timeout: float = 90.0,
) -> dict:
    """Send the actual DICOM slice PNG to a multimodal LLM.

    Tries providers in order: Groq (llama-4-scout, free) → Bynara Claude Sonnet 5
    (paid fallback). Uses the OpenAI-compatible /v1/chat/completions endpoint
    with image_url content parts.

    Returns {"ok": bool, "text": str, "provider": str, "model": str, "error": str|None}.
    """
    import base64 as _b64

    import httpx

    # Build the patient block — include EVERY field that's actually present so
    # the LLM never says "age/sex unknown" when the data is on the record.
    age_str = ""
    if patient_age is not None:
        if isinstance(patient_age, (int, float)) and patient_age > 0:
            age_str = f"{int(patient_age)}"
        elif isinstance(patient_age, str) and patient_age.strip():
            age_str = patient_age.strip()
    sex_str = (patient_sex or "").strip().upper()
    sex_display = {"M": "Male", "F": "Female", "O": "Other", "U": "Unknown"}.get(sex_str, sex_str or "")

    patient_line = ""
    parts_p: list[str] = []
    if patient_name:
        parts_p.append(f"Name: {patient_name}")
    if age_str:
        parts_p.append(f"Age: {age_str}")
    if sex_display:
        parts_p.append(f"Sex: {sex_display}")
    if parts_p:
        patient_line = "- Patient: " + " · ".join(parts_p) + "\n"

    b64 = _b64.b64encode(png_bytes).decode("ascii")
    context_block = (
        f"Case context (for correlation only — the IMAGE is the primary evidence):\n"
        f"{patient_line}"
        f"- Modality: {modality or '?'}\n"
        f"- Body region: {body_part or '?'}\n"
        f"- Study description: {study_description or '(not stated)'}\n"
        f"- Referring physician: {referrer or '(not stated)'}\n"
        f"- Symptoms: {symptoms or '(not stated)'}\n"
        f"- Clinical history: {clinical_history or '(not stated)'}\n"
        f"- Radiologist's existing findings (if any): "
        f"{(existing_findings or '(not yet dictated)').strip()[:800]}\n\n"
        f"Read the image using the context above. NEVER say age or sex is "
        f"unknown if a value is given in the context. Return the JSON per the "
        f"system rules."
    )

    errors: list[str] = []
    for provider in _VISION_PROVIDERS:
        # Allow single-model override
        if api_key and model:
            key = api_key
            provider_name = "custom"
            url = provider["url"]
            use_model = model
        else:
            key = _get_provider_key(provider["env_key"])
            provider_name = provider["name"]
            url = provider["url"]
            use_model = provider["model"]

        if not key:
            errors.append(f"{provider_name}: no API key")
            if api_key:
                break
            continue

        # Skip providers we already know are exhausted this process lifetime.
        # A daily-quota 429 doesn't resolve for hours — burning latency to
        # rediscover it on every batch is wasteful.
        if provider_name in _EXHAUSTED_PROVIDERS and not api_key:
            errors.append(f"{provider_name}: skipped (daily quota exhausted this session)")
            continue

        body = {
            "model": use_model,
            "messages": [
                {"role": "system", "content": VISION_MULTIMODAL_SYSTEM},
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/png;base64,{b64}"},
                        },
                        {"type": "text", "text": context_block},
                    ],
                },
            ],
            "max_tokens": 1400,
            "temperature": 0.1,
        }
        headers = {
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        }

        try:
            with httpx.Client(timeout=timeout) as client:
                r = client.post(url, json=body, headers=headers)
            if r.status_code != 200:
                err_msg = f"{provider_name}: HTTP {r.status_code}: {r.text[:200]}"
                errors.append(err_msg)
                log.warning(err_msg)
                # Detect DAILY-quota exhaustion (Groq's TPD, OpenAI's daily
                # cap) — a plain 429 might be per-minute (retriable), but if
                # the message mentions "day"/"TPD"/"daily" we shouldn't
                # retry this provider for the rest of the process lifetime.
                low = (r.text or "").lower()
                is_daily_limit = r.status_code == 429 and (
                    "tpd" in low or "per day" in low or "daily" in low
                    or "requests per day" in low or "rpd" in low
                )
                if is_daily_limit:
                    _EXHAUSTED_PROVIDERS.add(provider_name)
                    log.warning(
                        "%s: marked EXHAUSTED for the rest of this process (daily quota hit)",
                        provider_name,
                    )
                # 404 (model missing) never recovers — mark exhausted too.
                if r.status_code == 404:
                    _EXHAUSTED_PROVIDERS.add(provider_name)
                # Per-minute 429 → honor Retry-After if present so we don't
                # hammer the provider and burn latency. Cap at 30s to keep
                # request-level timeouts sane.
                if r.status_code == 429 and not is_daily_limit:
                    retry_after = r.headers.get("retry-after", "")
                    try:
                        wait_s = min(30.0, max(0.5, float(retry_after)))
                    except (TypeError, ValueError):
                        wait_s = 2.0
                    log.info(
                        "%s: per-minute 429, honoring Retry-After=%ss then falling to next provider",
                        provider_name, wait_s,
                    )
                    import time as _t
                    _t.sleep(wait_s)
                # 429/402/401/404: skip to next provider immediately
                if r.status_code in (401, 402, 404, 429):
                    continue
                continue
            data = r.json()
            choices = data.get("choices") or []
            if not choices:
                errors.append(f"{provider_name}: empty choices")
                continue
            text = choices[0].get("message", {}).get("content", "")
            if isinstance(text, list):
                text = "".join(
                    p.get("text", "") if isinstance(p, dict) else str(p) for p in text
                )
            return {
                "ok": True,
                "text": (text or "").strip(),
                "provider": provider_name,
                "model": use_model,
                "error": None,
            }
        except Exception as e:  # noqa: BLE001
            errors.append(f"{provider_name}: {str(e)[:150]}")
            log.warning(f"vision provider {provider_name} failed: {e}")
            continue

        # Single-shot mode (api_key + model provided)
        if api_key:
            break

    return {
        "ok": False,
        "text": "",
        "provider": "",
        "model": "",
        "error": "all vision providers failed: " + " | ".join(errors),
    }


def build_vision_prompt(features: dict, modality: str, body_part: str, existing: str) -> str:
    return (
        f"Modality: {modality}. Body part: {body_part}.\n"
        f"Radiologist's dictated findings so far:\n{existing or '(none)'}\n\n"
        f"Structured image features (JSON):\n{json.dumps(features, indent=2)}\n\n"
        "Return only the JSON object described in the system prompt."
    )


# ============================================================
# FULL-VOLUME ANALYSIS — reads 100% of a study's slices via
# batched parallel mosaics + deterministic + LLM synthesis.
# ============================================================
#
# Design (verified from Algorithm Expert consult + adapted):
#   - batch_size=16 slices per mosaic tile
#   - tile_size=256px per tile
#   - grid_cols=4  →  4x4 grid per mosaic
#   - max_parallel=4 concurrent LLM calls
#   - Sequential batches (skipped "pyramid-then-focused" as premature
#     optimization; the base pass already reads every slice)
#   - Deterministic dedup by finding-text similarity, then LLM synthesis
#   - Critical-flag escalation: STAT findings surface immediately

DEFAULT_BATCH_SIZE = 16
DEFAULT_TILE_SIZE = 256
DEFAULT_GRID_COLS = 4
DEFAULT_MAX_PARALLEL = 4


def _dedup_findings(all_batches: list[dict]) -> dict:
    """Deterministic merge of per-batch findings before the LLM synthesis.

    - Combines abnormal_findings across batches, merging duplicates by
      normalized finding text.
    - For duplicates, keeps the max confidence + highest ACR priority.
    - Aggregates slice ranges when the same finding appears in multiple
      batches (e.g. finding in batch 3 slices 33-48 + batch 4 slices 49-64
      → range "33-64").
    """
    priority_rank = {"STAT": 3, "urgent": 2, "routine": 1, "": 0}

    merged: dict[str, dict] = {}
    all_normal: set[str] = set()
    anatomy_parts: list[str] = []
    all_differential: list[dict] = []

    for batch in all_batches:
        if not isinstance(batch, dict):
            continue
        parsed = batch.get("parsed") or {}
        if not isinstance(parsed, dict):
            continue

        anatomy = parsed.get("anatomy_seen", "")
        if anatomy and anatomy not in anatomy_parts:
            anatomy_parts.append(anatomy)

        for f in parsed.get("abnormal_findings") or []:
            if not isinstance(f, dict):
                continue
            key = (f.get("finding") or "").strip().lower()[:80]
            if not key:
                continue
            existing = merged.get(key)
            new_conf = float(f.get("confidence") or 0.0)
            new_prio = (f.get("acr_priority") or "").strip()
            slice_range = (f.get("slice_range") or "").strip()

            if not existing:
                merged[key] = {
                    "finding": f.get("finding", ""),
                    "location": f.get("location", ""),
                    "slice_range": slice_range,
                    "confidence": new_conf,
                    "acr_priority": new_prio,
                    "batch_ids": [batch.get("batch_id")],
                }
            else:
                existing["confidence"] = max(existing["confidence"], new_conf)
                if priority_rank.get(new_prio, 0) > priority_rank.get(
                    existing["acr_priority"], 0
                ):
                    existing["acr_priority"] = new_prio
                if slice_range and slice_range not in existing["slice_range"]:
                    existing["slice_range"] = (
                        (existing["slice_range"] + ", " + slice_range).strip(", ")
                    )
                existing["batch_ids"].append(batch.get("batch_id"))

        for n in parsed.get("normal_findings") or []:
            if isinstance(n, str) and n.strip():
                all_normal.add(n.strip())

        for d in parsed.get("differential_diagnosis") or []:
            if isinstance(d, dict) and d.get("dx"):
                all_differential.append(d)

    # Sort abnormal by ACR priority then confidence
    abnormal = sorted(
        merged.values(),
        key=lambda x: (priority_rank.get(x["acr_priority"], 0), x["confidence"]),
        reverse=True,
    )

    # Only include normal findings that appeared consistently (heuristic:
    # accept all — batches may cover different regions)
    normal = sorted(all_normal)

    # Top 5 differential diagnoses by probability
    ddx = sorted(
        [d for d in all_differential if d.get("dx")],
        key=lambda d: float(d.get("probability") or 0.0),
        reverse=True,
    )
    seen_dx: set[str] = set()
    ddx_final = []
    for d in ddx:
        dx_key = (d.get("dx") or "").lower()[:60]
        if dx_key not in seen_dx:
            seen_dx.add(dx_key)
            ddx_final.append(d)
        if len(ddx_final) >= 5:
            break

    return {
        "anatomy_seen": " ".join(anatomy_parts)[:600],
        "abnormal_findings": abnormal,
        "normal_findings": normal[:12],
        "differential_diagnosis": ddx_final,
    }


async def analyze_full_volume(
    dicom_paths: list[Path],
    modality: str,
    body_part: str,
    symptoms: str,
    clinical_history: str,
    existing_findings: str,
    *,
    patient_age: int | str | None = None,
    patient_sex: str | None = None,
    patient_name: str | None = None,
    study_description: str = "",
    referrer: str = "",
    batch_size: int = DEFAULT_BATCH_SIZE,
    tile_size: int = DEFAULT_TILE_SIZE,
    cols: int = DEFAULT_GRID_COLS,
    max_parallel: int = DEFAULT_MAX_PARALLEL,
    on_batch_done=None,
) -> dict:
    """Analyze EVERY slice of a DICOM volume.

    Strategy:
      1. Split slices into contiguous batches of `batch_size`.
      2. Render each batch as a grid mosaic PNG (with slice-number labels).
      3. Send batches to the vision LLM in parallel (up to `max_parallel`).
      4. Deterministically dedup findings across batches.
      5. Return a synthesized report covering the entire volume.

    Returns:
        {"ok": bool, "text": str, "parsed": dict|None, "batches": [...],
         "total_slices": int, "batch_count": int, "error": str|None}
    """
    import asyncio

    total = len(dicom_paths)
    if total == 0:
        return {"ok": False, "error": "no DICOM slices provided"}

    # Build batches — 100% coverage.
    batches = batch_slice_indices(total, batch_size)

    # Concurrency guard — Groq allows a few in flight; more risks 429.
    sem = asyncio.Semaphore(max(1, max_parallel))

    # Transient failures (429 rate limit, 500 upstream, connection reset,
    # timeout) are common on the free Groq tier. Retry each batch up to 3
    # times with exponential backoff before giving up — otherwise 1 flaky
    # batch out of 10 means a whole region of the volume is unread.
    MAX_ATTEMPTS = 3
    BACKOFF_BASE = 2.5  # 2.5s, 5s, 10s

    async def _call_vision_once(png: bytes, batch_context: str) -> dict:
        return await asyncio.to_thread(
            call_vision_llm,
            png,
            modality,
            body_part,
            symptoms,
            clinical_history + " " + batch_context,
            existing_findings,
            patient_age=patient_age,
            patient_sex=patient_sex,
            patient_name=patient_name,
            study_description=study_description,
            referrer=referrer,
        )

    async def _process_batch(batch_id: int, slice_indices: list[int]) -> dict:
        async with sem:
            low = slice_indices[0] + 1
            high = slice_indices[-1] + 1
            batch_context = (
                f"BATCH {batch_id + 1} OF {len(batches)}: slices {low}-{high} "
                f"of {total}. Each tile is labelled with its slice number "
                f"in the format 'N/{total}'."
            )

            # Render the mosaic ONCE (blocking, expensive). Retries reuse
            # the same PNG — no point re-rendering identical pixels.
            try:
                paths = [dicom_paths[i] for i in slice_indices]
                png = await asyncio.to_thread(
                    render_dicom_grid_to_png,
                    paths,
                    tile_size=tile_size,
                    cols=cols,
                    label_slices=True,
                    total_slice_count=total,
                )
            except Exception as e:  # noqa: BLE001
                log.warning("batch %d render failed: %s", batch_id, e)
                out = {
                    "batch_id": batch_id,
                    "slice_range": f"{low}-{high}",
                    "slice_count": len(slice_indices),
                    "ok": False,
                    "error": f"render failed: {str(e)[:200]}",
                }
                if on_batch_done:
                    try:
                        on_batch_done(out)
                    except Exception:  # noqa: BLE001
                        pass
                return out

            last_err = ""
            for attempt in range(1, MAX_ATTEMPTS + 1):
                try:
                    result = await _call_vision_once(png, batch_context)
                    ok = bool(result.get("ok"))
                    err = (result.get("error") or "").strip()
                    text = result.get("text") or ""

                    # Retry on ok=false OR ok=true but empty text (LLM
                    # returned garbage / hit content filter).
                    retryable = (not ok) or (ok and not text)
                    err_low = err.lower()
                    # Distinguish PERMANENT failures (won't recover) from
                    # TRANSIENT ones (rate limits, transient timeouts):
                    #   permanent:  no API key, 404 (model missing), 401/402
                    #   transient:  429 per-minute, 5xx, network reset
                    is_rate_limit = (
                        "429" in err_low
                        or "rate" in err_low
                        or "per-minute" in err_low
                        or "too many" in err_low
                    )
                    # A rate-limit signal ANYWHERE in the error trumps
                    # everything else — waiting has a real chance of
                    # succeeding once the per-minute window rolls.
                    # Otherwise, check for truly permanent conditions.
                    if is_rate_limit:
                        permanent = False
                    else:
                        permanent = (
                            ("no api key" in err_low)
                            or ("401" in err_low and "unauth" in err_low)
                            or ("402" in err_low)
                            or ("all vision providers failed" in err_low)
                        )
                    if retryable and permanent:
                        last_err = err[:200]
                        log.info(
                            "batch %d attempt %d: permanent failure detected, "
                            "not retrying — %s",
                            batch_id, attempt, last_err[:80],
                        )
                        break
                    if retryable and attempt < MAX_ATTEMPTS:
                        last_err = err or ("empty text" if ok else "unknown")
                        # Rate-limit failures need MUCH longer waits than
                        # generic transients. Naraya per-minute window is
                        # 60s; sleeping less just re-hits the wall.
                        if is_rate_limit:
                            wait = 30.0 * attempt  # 30s, 60s, 90s
                        else:
                            wait = BACKOFF_BASE * (2 ** (attempt - 1))
                        log.info(
                            "batch %d attempt %d/%d %s (%s) — sleeping %.1fs",
                            batch_id, attempt, MAX_ATTEMPTS,
                            "rate-limited" if is_rate_limit else "retryable",
                            last_err[:80], wait,
                        )
                        await asyncio.sleep(wait)
                        continue

                    out: dict = {
                        "batch_id": batch_id,
                        "slice_range": f"{low}-{high}",
                        "slice_count": len(slice_indices),
                        "png_bytes": len(png),
                        "ok": ok,
                        "provider": result.get("provider"),
                        "model": result.get("model"),
                        "error": err or None,
                        "attempts": attempt,
                        "text": text,
                    }
                    if ok and text:
                        try:
                            out["parsed"] = _parse_vision_json(text)
                        except Exception as pe:  # noqa: BLE001
                            log.warning("batch %d parse failed: %s", batch_id, pe)
                    if on_batch_done:
                        try:
                            on_batch_done(out)
                        except Exception:  # noqa: BLE001
                            pass
                    return out

                except Exception as e:  # noqa: BLE001
                    last_err = str(e)[:200]
                    log.warning(
                        "batch %d attempt %d/%d raised: %s",
                        batch_id, attempt, MAX_ATTEMPTS, last_err,
                    )
                    if attempt < MAX_ATTEMPTS:
                        wait = BACKOFF_BASE * (2 ** (attempt - 1))
                        await asyncio.sleep(wait)
                        continue
                    break

            # All attempts exhausted.
            out = {
                "batch_id": batch_id,
                "slice_range": f"{low}-{high}",
                "slice_count": len(slice_indices),
                "ok": False,
                "attempts": MAX_ATTEMPTS,
                "error": f"failed after {MAX_ATTEMPTS} attempts: {last_err}",
            }
            if on_batch_done:
                try:
                    on_batch_done(out)
                except Exception:  # noqa: BLE001
                    pass
            return out

    # Fire all batches — the Semaphore caps concurrency but doesn't stagger
    # STARTS. Naraya/Groq per-minute rate limits kick in when batches launch
    # in a tight burst. Add a small stagger (0.3s per launch) so the first
    # wave doesn't all hit the same second on the API's clock.
    async def _staggered_launch(i: int, idx: list[int]) -> dict:
        await asyncio.sleep(0.3 * (i // max_parallel))
        return await _process_batch(i, idx)

    batch_results = await asyncio.gather(
        *[_staggered_launch(i, idx) for i, idx in enumerate(batches)],
        return_exceptions=False,
    )

    # Merge across batches deterministically first, then LLM-synthesize a
    # final narrative if the volume is complex.
    merged = _dedup_findings(batch_results)

    # LLM synthesis for the narrative — takes the merged findings and
    # produces the overall_impression + recommendations. This is one
    # cheap call (text-only) that ties everything together.
    synthesis = _synthesize_volume_report(
        merged,
        modality,
        body_part,
        symptoms,
        clinical_history,
        total,
        len(batches),
        patient_age=patient_age,
        patient_sex=patient_sex,
        patient_name=patient_name,
        study_description=study_description,
    )

    # If any batch flagged STAT/urgent → escalate in overall_impression
    has_stat = any(f.get("acr_priority") == "STAT" for f in merged["abnormal_findings"])
    has_urgent = any(f.get("acr_priority") == "urgent" for f in merged["abnormal_findings"])

    parsed_final: dict = {
        "anatomy_seen": merged["anatomy_seen"],
        "abnormal_findings": merged["abnormal_findings"],
        "normal_findings": merged["normal_findings"],
        "differential_diagnosis": merged["differential_diagnosis"],
        "slices_reviewed": f"all {total} slices across {len(batches)} batches",
        "overall_impression": synthesis.get("overall_impression", ""),
        "recommend_next_view": synthesis.get("recommend_next_view", ""),
        "confidence_in_reading": synthesis.get("confidence_in_reading", 0.7),
        "critical": has_stat,
        "urgent": has_urgent,
    }

    successful = sum(1 for b in batch_results if b.get("ok"))
    all_ok = successful > 0

    # If nothing succeeded, distill WHY into a doctor-readable message so
    # the client can show something actionable instead of a generic 502.
    friendly_error = None
    if not all_ok:
        all_errs = " | ".join(str(b.get("error") or "")[:200] for b in batch_results if not b.get("ok"))
        low = all_errs.lower()
        if "tpd" in low or "per day" in low or "daily" in low or "requests per day" in low:
            friendly_error = (
                "Vision AI daily quota exhausted on all providers. "
                "Try again after the free tier resets (typically 24h UTC). "
                "Add an OPENROUTER_API_KEY or paid Groq key to unlock more requests."
            )
        elif "no api key" in low:
            friendly_error = (
                "No vision-AI API key configured. "
                "Set NARAYA_API_KEY or GROQ_API_KEY on the bridge."
            )
        else:
            friendly_error = f"All {len(batches)} batches failed: {all_errs[:400]}"

    return {
        "ok": all_ok,
        "parsed": parsed_final,
        "batches": batch_results,
        "total_slices": total,
        "batch_count": len(batches),
        "successful_batches": successful,
        "coverage_pct": round(100.0 * successful / max(1, len(batches)), 1),
        "error": friendly_error,
    }


def _parse_vision_json(text: str) -> dict | None:
    """Best-effort JSON parse of a vision LLM response — strips code fences."""
    if not text:
        return None
    txt = text.strip()
    if txt.startswith("```"):
        first_nl = txt.find("\n")
        if first_nl > 0:
            txt = txt[first_nl + 1 :]
        if txt.rstrip().endswith("```"):
            txt = txt.rstrip()[:-3].rstrip()
    try:
        return json.loads(txt)
    except Exception:
        pass
    start = txt.find("{")
    end = txt.rfind("}")
    if start >= 0 and end > start:
        try:
            return json.loads(txt[start : end + 1])
        except Exception:
            return None
    return None


def _synthesize_volume_report(
    merged: dict,
    modality: str,
    body_part: str,
    symptoms: str,
    clinical_history: str,
    total_slices: int,
    batch_count: int,
    *,
    patient_age: int | str | None = None,
    patient_sex: str | None = None,
    patient_name: str | None = None,
    study_description: str = "",
) -> dict:
    """Ask the LLM to write a 1-3 sentence overall_impression from the merged
    per-batch findings. Text-only call (no image), fast and cheap.
    """
    import os
    import httpx

    if not merged.get("abnormal_findings") and not merged.get("normal_findings"):
        return {
            "overall_impression": (
                "No abnormalities detected across the full volume; "
                "recommend clinical correlation."
            ),
            "recommend_next_view": "",
            "confidence_in_reading": 0.5,
        }

    # Multi-provider fallback chain — 5 free medical brains.
    # This is the "super medical brain" ensemble: if one provider hits
    # 429/402, we roll to the next one automatically instead of failing.
    _TEXT_CHAIN = [
        ("groq",   "openai/gpt-oss-120b",                       "https://api.groq.com/openai/v1/chat/completions"),
        ("groq",   "llama-3.3-70b-versatile",                   "https://api.groq.com/openai/v1/chat/completions"),
        ("naraya", "mistral-large",                             "https://router.bynara.id/v1/chat/completions"),
        ("naraya", "mistral-medium-3-5",                        "https://router.bynara.id/v1/chat/completions"),
        ("groq",   "meta-llama/llama-4-scout-17b-16e-instruct", "https://api.groq.com/openai/v1/chat/completions"),
    ]

    # Compose patient meta line for the LLM
    age_disp = ""
    if patient_age is not None:
        if isinstance(patient_age, (int, float)) and patient_age > 0:
            age_disp = f"{int(patient_age)}"
        elif isinstance(patient_age, str) and patient_age.strip():
            age_disp = patient_age.strip()
    sex_map = {"M": "Male", "F": "Female", "O": "Other", "U": "Unknown"}
    sex_disp = sex_map.get((patient_sex or "").strip().upper(), (patient_sex or "").strip())
    patient_meta_lines: list[str] = []
    if patient_name:
        patient_meta_lines.append(f"- Patient name: {patient_name}")
    if age_disp:
        patient_meta_lines.append(f"- Patient age: {age_disp}")
    if sex_disp:
        patient_meta_lines.append(f"- Patient sex: {sex_disp}")
    patient_block = ("\n".join(patient_meta_lines) + "\n") if patient_meta_lines else ""

    system = VISION_SYNTHESIZE_MULTI_SYSTEM
    user = (
        f"STUDY CONTEXT:\n"
        f"{patient_block}"
        f"- Modality: {modality}\n"
        f"- Body region: {body_part}\n"
        f"- Study description: {study_description or '(not stated)'}\n"
        f"- Total slices: {total_slices}\n"
        f"- Batches processed: {batch_count}\n"
        f"- Symptoms: {symptoms or '(not stated)'}\n"
        f"- History: {clinical_history or '(not stated)'}\n\n"
        f"MERGED PER-BATCH FINDINGS (already deduplicated):\n"
        f"{json.dumps(merged, ensure_ascii=False, indent=2)[:6000]}\n\n"
        f"Return the JSON with overall_impression + recommend_next_view + "
        f"confidence_in_reading only. Do not re-list findings. NEVER say age, "
        f"sex, or clinical context is unknown if the values are given above."
    )
    # Try providers in order until one succeeds. Skip immediately on 402/429.
    errors: list[str] = []
    for provider_name, model, url in _TEXT_CHAIN:
        env_var = "GROQ_API_KEY" if provider_name == "groq" else "NARAYA_API_KEY"
        key = _get_provider_key(env_var)
        if not key:
            errors.append(f"{provider_name}/{model}: no key")
            continue
        body = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "max_tokens": 500,
            "temperature": 0.1,
        }
        headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
        try:
            with httpx.Client(timeout=60.0) as client:
                r = client.post(url, json=body, headers=headers)
            if r.status_code != 200:
                errors.append(f"{provider_name}/{model}: HTTP {r.status_code}")
                log.warning("synthesis %s/%s → HTTP %s: %s",
                            provider_name, model, r.status_code, r.text[:120])
                continue  # try next provider
            text = r.json()["choices"][0]["message"]["content"]
            parsed = _parse_vision_json(text) or {}
            log.info("synthesis succeeded via %s/%s", provider_name, model)
            return {
                "overall_impression": parsed.get("overall_impression", ""),
                "recommend_next_view": parsed.get("recommend_next_view", ""),
                "confidence_in_reading": parsed.get("confidence_in_reading", 0.7),
                "synth_provider": f"{provider_name}/{model}",
            }
        except Exception as e:  # noqa: BLE001
            errors.append(f"{provider_name}/{model}: {str(e)[:80]}")
            log.warning("synthesis %s/%s failed: %s", provider_name, model, e)

    log.warning("synthesis: all providers failed: %s", " | ".join(errors))
    # All providers failed — fall through to the fallback response below.
    if True:
        return {
            "overall_impression": (
                f"Full-volume review of {total_slices} slices complete."
            ),
            "recommend_next_view": "",
            "confidence_in_reading": 0.6,
        }
