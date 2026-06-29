"""كاشف نزيف وهمي rule-based — يحاكي MONAI brain_hemorrhage.

المبدأ: pixels في نطاق Hounsfield 60-90 HU شائعة في النزيف الحاد.
إذا نسبتها من إجمالي pixels داخل قناع الجمجمة > threshold → نقول "نزيف".
هذا ليس دقيقاً طبياً — مجرد placeholder لإثبات pipeline.
"""
from __future__ import annotations

import io
from dataclasses import dataclass

import numpy as np
import pydicom

from .config import get_settings

_settings = get_settings()


@dataclass
class TriageOut:
    label: str
    confidence: float
    priority: int
    measurements: dict
    hu_ratio: float


def analyze(dicom_bytes: bytes) -> TriageOut:
    ds = pydicom.dcmread(io.BytesIO(dicom_bytes), force=True)
    try:
        arr = ds.pixel_array.astype(np.float32)
    except Exception:
        return TriageOut(label="indeterminate", confidence=0.0, priority=5, measurements={}, hu_ratio=0.0)

    slope = float(getattr(ds, "RescaleSlope", 1.0))
    intercept = float(getattr(ds, "RescaleIntercept", -1024.0))
    hu = arr * slope + intercept

    # قناع الجمجمة: HU > -200 (يستثني الهواء)
    brain_mask = hu > -200
    if brain_mask.sum() == 0:
        return TriageOut(label="indeterminate", confidence=0.0, priority=5, measurements={}, hu_ratio=0.0)

    hemorrhage_mask = (hu >= 55) & (hu <= 95) & brain_mask
    ratio = float(hemorrhage_mask.sum()) / float(brain_mask.sum())

    if ratio >= _settings.ai_triage_threshold:
        # تحجيم confidence: ratio=0.005 → 0.85, ratio>=0.02 → 0.97
        conf = min(0.97, 0.85 + (ratio - _settings.ai_triage_threshold) * 6.0)
        return TriageOut(
            label="intracranial_hemorrhage",
            confidence=round(conf, 4),
            priority=1,
            measurements={
                "hemorrhage_pixels_ratio": round(ratio, 5),
                "approx_volume_cc": round(ratio * 150.0, 1),  # تقريب جداً
                "midline_shift_mm": round(min(ratio * 200.0, 8.0), 1),
                "ventricular_compression": ratio > 0.01,
            },
            hu_ratio=ratio,
        )

    return TriageOut(
        label="no_acute_finding",
        confidence=round(1.0 - ratio * 20.0, 4),
        priority=5,
        measurements={
            "hemorrhage_pixels_ratio": round(ratio, 5),
        },
        hu_ratio=ratio,
    )
