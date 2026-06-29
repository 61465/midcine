"""يولّد 4 حالات DICOM متنوعة + يدفعها للنظام:
1. CT Brain — مع نزيف
2. CT Chest — مع عقدة رئوية
3. CR Chest XR — اشعة سينية صدر
4. MR Brain — كتلة دماغية

كل حالة لها بيانات مريض مختلفة + UID فريد.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import sys
from datetime import date, datetime
from pathlib import Path
from collections import defaultdict

import numpy as np
import httpx
import pydicom
from pydicom.dataset import Dataset, FileDataset, FileMetaDataset
from pydicom.uid import (
    CTImageStorage, MRImageStorage, ComputedRadiographyImageStorage,
    ExplicitVRLittleEndian, generate_uid,
)

OUT = Path("fixtures/diverse")
API = "http://localhost:13100"


def base_meta(sop_class, sop_uid):
    m = FileMetaDataset()
    m.MediaStorageSOPClassUID = sop_class
    m.MediaStorageSOPInstanceUID = sop_uid
    m.TransferSyntaxUID = ExplicitVRLittleEndian
    m.ImplementationClassUID = generate_uid()
    return m


def common_setup(ds, *, patient_id, patient_name, age, sex, study_uid, series_uid, sop_uid,
                 study_desc, series_desc, modality, body_part, study_date=None):
    ds.SOPInstanceUID = sop_uid
    ds.StudyInstanceUID = study_uid
    ds.SeriesInstanceUID = series_uid
    ds.PatientID = patient_id
    ds.PatientName = patient_name
    ds.PatientBirthDate = f"{(study_date or date.today()).year - age}0101"
    ds.PatientSex = sex
    ds.StudyDate = (study_date or date.today()).strftime("%Y%m%d")
    ds.StudyTime = datetime.now().strftime("%H%M%S")
    ds.AccessionNumber = f"ACC-{sop_uid[-8:]}"
    ds.Modality = modality
    ds.BodyPartExamined = body_part
    ds.StudyDescription = study_desc
    ds.SeriesDescription = series_desc
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"
    ds.is_little_endian = True
    ds.is_implicit_VR = False


def make_ct_chest_with_nodule(out_dir: Path):
    """CT صدر مع عقدة رئوية وهمية."""
    out_dir.mkdir(parents=True, exist_ok=True)
    study_uid = generate_uid()
    series_uid = generate_uid()
    rows = cols = 256
    n_slices = 30
    yy, xx = np.ogrid[:rows, :cols]
    cx = cy = cols // 2

    for z in range(n_slices):
        # خلفية: هواء داخل تجويف الصدر
        arr = np.full((rows, cols), -1000, dtype=np.int16)
        # جدار صدر (أنسجة رخوة + عظام)
        chest_outer = (xx - cx) ** 2 + (yy - cy) ** 2 <= 120 ** 2
        chest_inner = (xx - cx) ** 2 + (yy - cy) ** 2 <= 105 ** 2
        arr[chest_outer & ~chest_inner] = 600  # عظم ضلع
        # رئتان (هواء)
        left_lung = ((xx - 80) ** 2 + (yy - cy) ** 2 <= 50 ** 2) & chest_inner
        right_lung = ((xx - 176) ** 2 + (yy - cy) ** 2 <= 50 ** 2) & chest_inner
        arr[left_lung] = -800
        arr[right_lung] = -800
        # قلب (أنسجة رخوة)
        heart = ((xx - cx) ** 2 + (yy - 140) ** 2 <= 30 ** 2) & chest_inner
        arr[heart] = 50
        # عقدة رئوية في الـ slices الوسطى
        if 12 <= z <= 18:
            nodule = (xx - 90) ** 2 + (yy - 130) ** 2 <= 8 ** 2
            arr[nodule & left_lung] = 40  # solid nodule

        sop_uid = generate_uid()
        fm = base_meta(CTImageStorage, sop_uid)
        ds = FileDataset(str(out_dir), {}, file_meta=fm, preamble=b"\0" * 128)
        ds.SOPClassUID = CTImageStorage
        common_setup(ds, patient_id="MRN-2026-CT001", patient_name="Mostafa^Hassan",
                     age=58, sex="M", study_uid=study_uid, series_uid=series_uid, sop_uid=sop_uid,
                     study_desc="CT CHEST W/O CONTRAST", series_desc="AXIAL 5MM LUNG",
                     modality="CT", body_part="CHEST")
        ds.SeriesNumber = "1"
        ds.InstanceNumber = z + 1
        ds.SliceLocation = float(z * 5)
        ds.ImagePositionPatient = [-128 * 0.7, -128 * 0.7, float(z * 5)]
        ds.ImageOrientationPatient = [1, 0, 0, 0, 1, 0]
        ds.PixelSpacing = [0.7, 0.7]
        ds.SliceThickness = 5
        ds.Rows = rows
        ds.Columns = cols
        ds.BitsAllocated = 16
        ds.BitsStored = 16
        ds.HighBit = 15
        ds.PixelRepresentation = 1
        ds.RescaleSlope = 1
        ds.RescaleIntercept = 0
        ds.WindowCenter = -600
        ds.WindowWidth = 1500
        ds.PixelData = arr.tobytes()
        ds.save_as(str(out_dir / f"slice_{z+1:03d}.dcm"), write_like_original=False)
    return study_uid


def make_mr_brain(out_dir: Path):
    """MRI دماغ T2 مع كتلة وهمية."""
    out_dir.mkdir(parents=True, exist_ok=True)
    study_uid = generate_uid()
    series_uid = generate_uid()
    rows = cols = 256
    n_slices = 25
    yy, xx = np.ogrid[:rows, :cols]
    cx = cy = cols // 2

    for z in range(n_slices):
        # MRI background ~ 0 + noise
        arr = (np.random.randn(rows, cols) * 30 + 100).astype(np.int16)
        # جمجمة (إشارة منخفضة)
        skull = (xx - cx) ** 2 + (yy - cy) ** 2 <= 110 ** 2
        brain = (xx - cx) ** 2 + (yy - cy) ** 2 <= 95 ** 2
        arr[skull & ~brain] = 50  # عظم low signal in T2
        # دماغ (مادة بيضاء/رمادية)
        depth_factor = abs(z - n_slices / 2) / (n_slices / 2)
        white_matter = (xx - cx) ** 2 + (yy - cy) ** 2 <= int(80 * (1 - depth_factor * 0.5)) ** 2
        arr[brain & ~white_matter] = 400  # gray T2 hyper
        arr[white_matter] = 250  # white T2 mid
        # بطينات سوداء
        ventricles = ((xx - cx) ** 2 + (yy - cy - 5) ** 2 <= 15 ** 2)
        arr[ventricles & brain] = 600  # CSF very hyper T2
        # كتلة (lesion) hyperintense
        if 10 <= z <= 16:
            mass = (xx - cx + 30) ** 2 + (yy - cy - 20) ** 2 <= 12 ** 2
            arr[mass & brain] = 700

        sop_uid = generate_uid()
        fm = base_meta(MRImageStorage, sop_uid)
        ds = FileDataset(str(out_dir), {}, file_meta=fm, preamble=b"\0" * 128)
        ds.SOPClassUID = MRImageStorage
        common_setup(ds, patient_id="MRN-2026-MR001", patient_name="Sara^Ahmed",
                     age=45, sex="F", study_uid=study_uid, series_uid=series_uid, sop_uid=sop_uid,
                     study_desc="MR BRAIN", series_desc="AXIAL T2 FLAIR",
                     modality="MR", body_part="BRAIN")
        ds.SeriesNumber = "1"
        ds.InstanceNumber = z + 1
        ds.SliceLocation = float(z * 5)
        ds.ImagePositionPatient = [-128 * 0.8, -128 * 0.8, float(z * 5)]
        ds.ImageOrientationPatient = [1, 0, 0, 0, 1, 0]
        ds.PixelSpacing = [0.8, 0.8]
        ds.SliceThickness = 5
        ds.Rows = rows
        ds.Columns = cols
        ds.BitsAllocated = 16
        ds.BitsStored = 16
        ds.HighBit = 15
        ds.PixelRepresentation = 0
        ds.WindowCenter = 350
        ds.WindowWidth = 700
        ds.PixelData = arr.astype(np.uint16).tobytes()
        ds.save_as(str(out_dir / f"slice_{z+1:03d}.dcm"), write_like_original=False)
    return study_uid


def make_chest_xray(out_dir: Path):
    """Chest X-ray PA — صورة واحدة كبيرة."""
    out_dir.mkdir(parents=True, exist_ok=True)
    rows = cols = 1024
    # خلفية فاتحة + ضلوع + قلب + رئتين
    arr = (np.random.randn(rows, cols) * 100 + 2500).astype(np.uint16)
    yy, xx = np.ogrid[:rows, :cols]
    cx = cy = cols // 2
    # رئة يمنى ويسرى (داكنة)
    left_lung = ((xx - 300) ** 2 / 100 + (yy - cy) ** 2 / 200) <= 100000
    right_lung = ((xx - 724) ** 2 / 100 + (yy - cy) ** 2 / 200) <= 100000
    arr[left_lung] = 600
    arr[right_lung] = 600
    # ضلوع (فاتحة)
    for k in range(7):
        y = int(rows * (0.25 + k * 0.07))
        arr[max(y - 4, 0): y + 4, cols // 4: 3 * cols // 4] = 1200
    # قلب (مظلم نسبياً في الوسط)
    heart = ((xx - cx) ** 2 + (yy - cy + 100) ** 2) <= 150 ** 2
    arr[heart] = 1500
    # عمود فقري (وسط مستقيم فاتح)
    arr[:, cx - 8: cx + 8] = 800

    sop_uid = generate_uid()
    study_uid = generate_uid()
    series_uid = generate_uid()
    fm = base_meta(ComputedRadiographyImageStorage, sop_uid)
    ds = FileDataset(str(out_dir / "xray.dcm"), {}, file_meta=fm, preamble=b"\0" * 128)
    ds.SOPClassUID = ComputedRadiographyImageStorage
    common_setup(ds, patient_id="MRN-2026-CR001", patient_name="Ali^Ibrahim",
                 age=35, sex="M", study_uid=study_uid, series_uid=series_uid, sop_uid=sop_uid,
                 study_desc="CHEST PA", series_desc="PA VIEW",
                 modality="CR", body_part="CHEST")
    ds.SeriesNumber = "1"
    ds.InstanceNumber = "1"
    ds.Rows = rows
    ds.Columns = cols
    ds.BitsAllocated = 16
    ds.BitsStored = 16
    ds.HighBit = 15
    ds.PixelRepresentation = 0
    ds.WindowCenter = 2048
    ds.WindowWidth = 3500
    ds.PixelData = arr.tobytes()
    ds.save_as(str(out_dir / "xray.dcm"), write_like_original=False)
    return study_uid


def make_xr_hand(out_dir: Path):
    """X-ray يد — مع مفاصل وعظام (محاكاة كسر)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    rows, cols = 1024, 768
    arr = (np.random.randn(rows, cols) * 80 + 2800).astype(np.uint16)
    yy, xx = np.ogrid[:rows, :cols]
    # رسم 5 أصابع كأشكال طولية (عظام opacity مرتفعة)
    fingers_x = [200, 320, 400, 480, 580]
    for fx in fingers_x:
        for seg in range(3):
            yt = 200 + seg * 200
            yb = yt + 150
            xt = fx - 25
            xb = fx + 25
            arr[yt: yb, xt: xb] = 1200
            # مفصل مظلم بين segments
            if seg < 2:
                arr[yb: yb + 15, xt - 5: xb + 5] = 2500
    # راحة اليد
    palm = ((xx - cols // 2) ** 2 / 50 + (yy - 800) ** 2 / 100) <= 5000
    arr[palm] = 1300
    # علامة كسر (خط داكن في إصبع وسطى)
    arr[420: 425, 380: 420] = 2400

    sop_uid = generate_uid()
    study_uid = generate_uid()
    series_uid = generate_uid()
    fm = base_meta(ComputedRadiographyImageStorage, sop_uid)
    ds = FileDataset(str(out_dir / "hand.dcm"), {}, file_meta=fm, preamble=b"\0" * 128)
    ds.SOPClassUID = ComputedRadiographyImageStorage
    common_setup(ds, patient_id="MRN-2026-XR001", patient_name="Omar^Mahmoud",
                 age=28, sex="M", study_uid=study_uid, series_uid=series_uid, sop_uid=sop_uid,
                 study_desc="HAND PA RIGHT", series_desc="PA OBLIQUE",
                 modality="CR", body_part="HAND")
    ds.SeriesNumber = "1"
    ds.InstanceNumber = "1"
    ds.Rows = rows
    ds.Columns = cols
    ds.BitsAllocated = 16
    ds.BitsStored = 16
    ds.HighBit = 15
    ds.PixelRepresentation = 0
    ds.WindowCenter = 2048
    ds.WindowWidth = 3000
    ds.PixelData = arr.tobytes()
    ds.save_as(str(out_dir / "hand.dcm"), write_like_original=False)
    return study_uid


# ===== Push helpers =====

async def login() -> str:
    async with httpx.AsyncClient() as c:
        r = await c.post(f"{API}/v1/auth/login",
                         json={"email": "demo@midcine.io", "password": "DemoMidcine!2026"},
                         timeout=15)
        return r.json()["access_token"]


async def push_dir(client, study_dir: Path):
    counts = defaultdict(int)
    for f in sorted(study_dir.rglob("*.dcm")):
        try:
            ds = pydicom.dcmread(str(f), stop_before_pixels=False)
        except Exception:
            continue
        raw = f.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()

        def fmt(v):
            v = str(v) if v else ""
            return f"{v[:4]}-{v[4:6]}-{v[6:8]}" if len(v) >= 8 else None
        meta = {
            "study_instance_uid": str(ds.StudyInstanceUID),
            "series_instance_uid": str(ds.SeriesInstanceUID),
            "sop_instance_uid": str(ds.SOPInstanceUID),
            "patient_mrn": str(getattr(ds, "PatientID", "X")),
            "patient_name_ar": str(getattr(ds, "PatientName", "X")),
            "patient_dob": fmt(getattr(ds, "PatientBirthDate", None)),
            "patient_sex": str(getattr(ds, "PatientSex", "U"))[:1],
            "modality": str(getattr(ds, "Modality", "OT")),
            "body_part": str(getattr(ds, "BodyPartExamined", "") or "") or None,
            "study_date": fmt(getattr(ds, "StudyDate", None)) or "2026-01-01",
            "accession_number": str(getattr(ds, "AccessionNumber", "") or "") or None,
            "rows": int(getattr(ds, "Rows", 0)) or None,
            "cols": int(getattr(ds, "Columns", 0)) or None,
            "transfer_syntax": str(ds.file_meta.TransferSyntaxUID),
            "hash_sha256": digest,
            "size_bytes": len(raw),
            "description": str(getattr(ds, "StudyDescription", "") or "") or None,
        }
        files = {
            "meta": (None, json.dumps(meta, ensure_ascii=False), "application/json"),
            "pixels": (f.name, raw, "application/dicom"),
        }
        r = await client.post(f"{API}/v1/instances", files=files, timeout=60)
        if r.status_code < 300:
            counts[meta["study_instance_uid"]] += 1
    for uid, n in counts.items():
        await client.post(f"{API}/v1/studies/{uid}/complete",
                          json={"expected_instances": n}, timeout=20)
        print(f"  pushed {study_dir.name}: {n} instances")


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    print("[1/4] CT Chest with lung nodule...")
    ct_chest = make_ct_chest_with_nodule(OUT / "ct_chest_nodule")
    print("[2/4] MR Brain with mass...")
    mr_brain = make_mr_brain(OUT / "mr_brain_mass")
    print("[3/4] Chest X-ray PA...")
    cr_chest = make_chest_xray(OUT / "cr_chest_pa")
    print("[4/4] Hand X-ray...")
    xr_hand = make_xr_hand(OUT / "xr_hand_fracture")
    print()
    print("Pushing all to system...")
    await login_and_push()


async def login_and_push():
    tok = await login()
    async with httpx.AsyncClient(headers={"Authorization": f"Bearer {tok}"}) as c:
        for sub in sorted((OUT).iterdir()):
            if sub.is_dir():
                await push_dir(c, sub)


if __name__ == "__main__":
    asyncio.run(main())
