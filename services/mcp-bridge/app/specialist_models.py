"""Specialist medical AI models — routed per modality/body_part.

Currently wired:
  - CXR (Chest X-Ray, modality CR/DR + body_part CHEST) → TorchXRayVision
    18-pathology classifier (Atelectasis, Cardiomegaly, Consolidation, Edema,
    Effusion, Emphysema, Fibrosis, Hernia, Infiltration, Mass, Nodule,
    Pleural_Thickening, Pneumonia, Pneumothorax, Fracture, Lung Lesion,
    Lung Opacity, Enlarged Cardiomediastinum)

Not-yet-wired (post-pilot):
  - MONAI Brain Tumor Segmentation (CT/MR brain)
  - MONAI Lung Segmentation (CT chest)
  - TotalSegmentator (104 organs, needs 5-10GB models)

Design:
  - Models load lazily on first use (avoids startup delay)
  - Weights cached in E:\\luffy-data\\midcine\\model_cache\\
  - Returns per-pathology probability list, sorted by score
  - Threshold at 0.5 for "positive" classification
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

log = logging.getLogger("mcp-bridge.specialists")

# Model cache goes to the data drive, not the E: venv (venv is on the flash)
MODEL_CACHE = Path(
    os.getenv("MIDCINE_MODEL_CACHE", r"E:\luffy-data\midcine\model_cache")
)
MODEL_CACHE.mkdir(parents=True, exist_ok=True)

# Point torchxrayvision at our cache dir
os.environ.setdefault("TORCHXRAYVISION_CACHE_DIR", str(MODEL_CACHE))

_XRV_MODEL = None
_XRV_LOAD_ERROR: str | None = None


def _load_xrv_model():
    """Load TorchXRayVision DenseNet on first use. Cached at module level."""
    global _XRV_MODEL, _XRV_LOAD_ERROR
    if _XRV_MODEL is not None:
        return _XRV_MODEL
    if _XRV_LOAD_ERROR is not None:
        return None

    try:
        import torchxrayvision as xrv  # type: ignore

        # DenseNet-121 trained on all NIH datasets — best all-round CXR model
        _XRV_MODEL = xrv.models.DenseNet(weights="densenet121-res224-all")
        _XRV_MODEL.eval()
        log.info(
            "TorchXRayVision DenseNet loaded (weights=densenet121-res224-all). "
            "Pathologies: %s",
            _XRV_MODEL.pathologies,
        )
        return _XRV_MODEL
    except Exception as e:  # noqa: BLE001
        _XRV_LOAD_ERROR = f"failed to load TorchXRayVision: {str(e)[:200]}"
        log.warning(_XRV_LOAD_ERROR)
        return None


def analyze_cxr_torchxrayvision(dicom_path: Path) -> dict:
    """Run TorchXRayVision 18-pathology classifier on a single CXR DICOM.

    Returns:
        {"ok": bool, "model": str, "predictions": [{"pathology": str, "probability": float, "positive": bool}], "error": str|None}
    """
    model = _load_xrv_model()
    if model is None:
        return {
            "ok": False,
            "model": "torchxrayvision-densenet121-res224-all",
            "predictions": [],
            "error": _XRV_LOAD_ERROR or "model not loaded",
        }

    try:
        import numpy as np
        import torch
        import torchxrayvision as xrv

        # Load DICOM → HU array → 8-bit uint
        from .ai_vision import _dicom_to_normed_array

        img_arr = _dicom_to_normed_array(dicom_path)

        # Convert to xrv format: single-channel, 224x224, normalized to [-1024, 1024]
        # xrv.datasets.normalize handles standard scaling
        img = np.asarray(img_arr, dtype=np.float32)
        img = xrv.datasets.normalize(img, 255)  # normalize to xrv range
        # Add channel dim → (1, H, W)
        img = img[None, :, :]
        # Center-crop / resize to 224
        transform = xrv.datasets.XRayResizer(224)
        img = transform(img)
        # Model expects (1, 1, 224, 224) tensor
        tensor = torch.from_numpy(img).unsqueeze(0)

        with torch.no_grad():
            output = model(tensor)  # sigmoid probabilities per pathology

        probs = output[0].cpu().numpy().tolist()
        preds = []
        for name, p in zip(model.pathologies, probs):
            if not name:
                continue
            preds.append(
                {
                    "pathology": name,
                    "probability": round(float(p), 4),
                    "positive": bool(p >= 0.5),
                }
            )
        # Sort by probability descending
        preds.sort(key=lambda x: x["probability"], reverse=True)
        return {
            "ok": True,
            "model": "torchxrayvision-densenet121-res224-all",
            "predictions": preds,
            "positive_count": sum(1 for p in preds if p["positive"]),
            "error": None,
        }
    except Exception as e:  # noqa: BLE001
        return {
            "ok": False,
            "model": "torchxrayvision-densenet121-res224-all",
            "predictions": [],
            "error": f"inference failed: {str(e)[:200]}",
        }


# ---- Router: pick the right specialist per study modality/body_part -----

def suggest_specialist(modality: str, body_part: str) -> str | None:
    """Return the id of the best specialist model for a given study.
    Returns None if we don't have one for that combination."""
    m = (modality or "").upper()
    b = (body_part or "").upper()

    # Chest X-Ray (CR = Computed Radiography, DR = Digital Radiography)
    if m in {"CR", "DR", "DX", "CX", "X-RAY", "XR"} and b in {"CHEST", "THORAX", "LUNG", "LUNGS"}:
        return "torchxrayvision-cxr"

    # More specialists can be added here (MONAI Brain Tumor, TotalSegmentator,
    # etc.) as they are integrated.
    return None


def health() -> dict:
    """Report specialist-models status without loading them."""
    return {
        "torchxrayvision": {
            "installed": True,
            "loaded": _XRV_MODEL is not None,
            "cache_dir": str(MODEL_CACHE),
            "pathologies": (
                list(_XRV_MODEL.pathologies) if _XRV_MODEL else "load lazily on first use"
            ),
        },
        "monai": {"installed": False, "note": "post-pilot"},
        "total_segmentator": {"installed": False, "note": "post-pilot (5-10GB)"},
    }
