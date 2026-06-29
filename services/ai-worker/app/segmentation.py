"""Segmentation rule-based:
- يأخذ كل instances الـ study
- يبني volume 3D
- يطبّق HU thresholding للنزيف/العظم/الدماغ
- يولّد: overlay PNG لـ key slice + 3D MIP snapshot + حجم تقريبي
- يحفظ في MinIO
"""
from __future__ import annotations

import io
import logging
from dataclasses import dataclass
from typing import Sequence

import numpy as np
import pydicom

log = logging.getLogger("segmentation")

# نطاقات HU
HU_RANGES = {
    "hemorrhage": (55, 95),
    "bone": (300, 2000),
    "soft_tissue": (-100, 50),
}

# تكوين الألوان (RGBA) للـ overlay
COLORS = {
    "hemorrhage": (218, 30, 40, 200),     # حمراء
    "bone": (245, 234, 200, 120),         # كريمي شفاف
}


@dataclass
class SegSlice:
    instance_uid: str
    instance_number: int
    pixel_array_hu: np.ndarray
    rows: int
    cols: int


@dataclass
class SegResult:
    label: str
    volume_cc: float
    key_slice_idx: int
    overlay_png: bytes        # PNG composite للـ key slice
    snapshot_3d_png: bytes    # MIP من 3 محاور — صورة tile واحدة
    mask_total_voxels: int
    mask_nrrd: bytes | None = None   # binary mask للـ vtk.js


@dataclass
class VolumeData:
    """البيانات الخام للـ volume — تُحفَظ NRRD لـ vtk.js في المتصفح."""
    nrrd_bytes: bytes
    shape: tuple[int, int, int]
    spacing: tuple[float, float, float]
    hu_min: float
    hu_max: float


def _load_volume(dicoms: Sequence[bytes]) -> tuple[np.ndarray, list[str], float]:
    """يبني volume من قائمة DICOM bytes. يرجع (vol HU, sop_uids, voxel_volume_cc)."""
    slices: list[tuple[int, np.ndarray, str, float, float]] = []
    pixel_spacing_xy = (1.0, 1.0)
    slice_thickness = 1.0

    for b in dicoms:
        try:
            ds = pydicom.dcmread(io.BytesIO(b), force=True)
            arr = ds.pixel_array.astype(np.float32)
            slope = float(getattr(ds, "RescaleSlope", 1.0))
            intercept = float(getattr(ds, "RescaleIntercept", -1024.0))
            hu = arr * slope + intercept
            inst_no = int(getattr(ds, "InstanceNumber", 0) or 0)
            sop = str(getattr(ds, "SOPInstanceUID", ""))
            slice_loc = float(getattr(ds, "SliceLocation", inst_no) or inst_no)
            # حدِّث pixel spacing من أول slice
            ps = getattr(ds, "PixelSpacing", None)
            if ps and len(ps) >= 2:
                pixel_spacing_xy = (float(ps[0]), float(ps[1]))
            st = getattr(ds, "SliceThickness", None)
            if st:
                slice_thickness = float(st)
            slices.append((inst_no or int(slice_loc), hu, sop, slice_loc, slice_thickness))
        except Exception as e:
            log.warning("skip slice: %s", e)

    if not slices:
        return np.zeros((1, 1, 1), dtype=np.float32), [], 0.0

    slices.sort(key=lambda x: (x[3], x[0]))
    vol = np.stack([s[1] for s in slices], axis=0)
    sop_uids = [s[2] for s in slices]
    # mm^3 → cc: ÷1000
    voxel_cc = (pixel_spacing_xy[0] * pixel_spacing_xy[1] * slice_thickness) / 1000.0
    return vol, sop_uids, voxel_cc


def _to_rgb8(arr: np.ndarray, window: tuple[int, int] = (0, 80)) -> np.ndarray:
    """HU → uint8 رمادي مع windowing (brain default 0-80)."""
    lo, hi = window
    clipped = np.clip(arr, lo, hi)
    normalized = ((clipped - lo) / (hi - lo) * 255.0).astype(np.uint8)
    return np.stack([normalized] * 3, axis=-1)


def _encode_png(rgb: np.ndarray) -> bytes:
    import struct
    import zlib

    h, w = rgb.shape[:2]
    if rgb.shape[-1] == 4:
        color_type = 6
    else:
        color_type = 2

    def chunk(typ: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + typ + data
            + struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF)
        )

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, color_type, 0, 0, 0)
    raw = b"".join(b"\x00" + rgb[y].tobytes() for y in range(h))
    idat = zlib.compress(raw, 6)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


def _composite_overlay(base_rgb: np.ndarray, mask: np.ndarray, color_rgba: tuple) -> np.ndarray:
    """alpha-blend overlay على base."""
    out = base_rgb.copy()
    r, g, b, a = color_rgba
    alpha = a / 255.0
    out[mask, 0] = (out[mask, 0] * (1 - alpha) + r * alpha).astype(np.uint8)
    out[mask, 1] = (out[mask, 1] * (1 - alpha) + g * alpha).astype(np.uint8)
    out[mask, 2] = (out[mask, 2] * (1 - alpha) + b * alpha).astype(np.uint8)
    return out


def _mip_3panel(vol: np.ndarray, mask: np.ndarray, color_rgba: tuple) -> bytes:
    """يولّد صورة tile (axial MIP + coronal MIP + sagittal MIP) مع overlay."""
    z, y, x = vol.shape
    axial = vol.max(axis=0)
    coronal = vol.max(axis=1)
    sagittal = vol.max(axis=2)

    mask_axial = mask.any(axis=0)
    mask_coronal = mask.any(axis=1)
    mask_sagittal = mask.any(axis=2)

    panels = []
    for img2d, m2d in [(axial, mask_axial), (coronal, mask_coronal), (sagittal, mask_sagittal)]:
        rgb = _to_rgb8(img2d, window=(0, 200))
        rgb = _composite_overlay(rgb, m2d, color_rgba)
        panels.append(rgb)

    # نرفع الكل لنفس الحجم
    target_h = max(p.shape[0] for p in panels)
    resized = []
    for p in panels:
        if p.shape[0] != target_h:
            # padding بسيط
            pad = np.zeros((target_h - p.shape[0], p.shape[1], 3), dtype=np.uint8)
            p = np.concatenate([p, pad], axis=0)
        resized.append(p)

    tile = np.concatenate(resized, axis=1)
    return _encode_png(tile)


def _write_nrrd(arr: np.ndarray, spacing: tuple[float, float, float], dtype_str: str) -> bytes:
    """يكتب NRRD بسيط (raw little-endian) — vtk.js يقرأه مباشرة. ترتيب: (z,y,x) → sizes (x,y,z)."""
    z, y, x = arr.shape
    type_map = {"int16": "short", "uint8": "uchar", "float32": "float"}
    nrrd_type = type_map.get(dtype_str, "short")
    header = (
        "NRRD0004\n"
        f"type: {nrrd_type}\n"
        "dimension: 3\n"
        "space: left-posterior-superior\n"
        f"sizes: {x} {y} {z}\n"
        f"space directions: ({spacing[0]},0,0) (0,{spacing[1]},0) (0,0,{spacing[2]})\n"
        "kinds: domain domain domain\n"
        "endian: little\n"
        "encoding: raw\n"
        "space origin: (0,0,0)\n"
        "\n"
    )
    data = arr.astype(np.dtype(dtype_str).newbyteorder("<")).tobytes(order="C")
    return header.encode("utf-8") + data


def build_volume_nrrd(dicom_blobs: Sequence[bytes]) -> VolumeData | None:
    vol, _sops, voxel_cc = _load_volume(dicom_blobs)
    if vol.size == 0:
        return None
    vol_i16 = np.clip(vol, -2000, 4000).astype(np.int16)
    spacing = (0.6, 0.6, 5.0)
    nrrd = _write_nrrd(vol_i16, spacing, "int16")
    return VolumeData(
        nrrd_bytes=nrrd,
        shape=(vol.shape[2], vol.shape[1], vol.shape[0]),
        spacing=spacing,
        hu_min=float(vol.min()),
        hu_max=float(vol.max()),
    )


def segment_volume(dicom_blobs: Sequence[bytes]) -> dict[str, SegResult]:
    """يرجع dict من label → SegResult لكل ما اكتُشف."""
    vol, sop_uids, voxel_cc = _load_volume(dicom_blobs)
    if vol.size == 0:
        return {}

    results: dict[str, SegResult] = {}

    # نزيف
    lo, hi = HU_RANGES["hemorrhage"]
    brain_mask_vol = vol > -100
    hem_mask = (vol >= lo) & (vol <= hi) & brain_mask_vol
    voxels = int(hem_mask.sum())
    if voxels > 50 and voxel_cc > 0:
        volume_cc = voxels * voxel_cc
        # key slice: الأكثر voxels
        per_slice = hem_mask.reshape(vol.shape[0], -1).sum(axis=1)
        key_idx = int(per_slice.argmax())
        base = _to_rgb8(vol[key_idx], window=(0, 80))
        overlay = _composite_overlay(base, hem_mask[key_idx], COLORS["hemorrhage"])
        png_2d = _encode_png(overlay)
        png_3d = _mip_3panel(vol, hem_mask, COLORS["hemorrhage"])
        results["hemorrhage"] = SegResult(
            label="hemorrhage",
            volume_cc=round(volume_cc, 2),
            key_slice_idx=key_idx,
            overlay_png=png_2d,
            snapshot_3d_png=png_3d,
            mask_total_voxels=voxels,
            mask_nrrd=_write_nrrd(hem_mask.astype(np.uint8), (0.6, 0.6, 5.0), "uint8"),
        )

    # عظم — كرسم بنية لتأكيد التشريح
    lo, hi = HU_RANGES["bone"]
    bone_mask = (vol >= lo) & (vol <= hi)
    bone_voxels = int(bone_mask.sum())
    if bone_voxels > 100 and voxel_cc > 0:
        per_slice = bone_mask.reshape(vol.shape[0], -1).sum(axis=1)
        key_idx = int(per_slice.argmax())
        base = _to_rgb8(vol[key_idx], window=(-300, 1500))
        overlay = _composite_overlay(base, bone_mask[key_idx], COLORS["bone"])
        png_2d = _encode_png(overlay)
        png_3d = _mip_3panel(vol, bone_mask, COLORS["bone"])
        results["bone"] = SegResult(
            label="bone",
            volume_cc=round(bone_voxels * voxel_cc, 2),
            key_slice_idx=key_idx,
            overlay_png=png_2d,
            snapshot_3d_png=png_3d,
            mask_total_voxels=bone_voxels,
            mask_nrrd=_write_nrrd(bone_mask.astype(np.uint8), (0.6, 0.6, 5.0), "uint8"),
        )

    return results
