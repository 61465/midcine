"""يولّد DICOM volumes اصطناعية متعدد الشرائح:
- ct-brain-hemorrhage/ — 40 slice CT brain مع تجمع دموي وهمي
- ct-brain-normal/    — 40 slice CT brain طبيعي
- chest-xray.dcm      — صورة واحدة CR

يحاكي بنية الجمجمة + الدماغ + (نزيف) في نطاقات HU صحيحة.
استعمال: python scripts/make_test_dicom.py
"""
from __future__ import annotations

import shutil
from datetime import date, datetime
from pathlib import Path

import numpy as np
from pydicom.dataset import Dataset, FileDataset, FileMetaDataset
from pydicom.uid import (
    CTImageStorage,
    ComputedRadiographyImageStorage,
    ExplicitVRLittleEndian,
    generate_uid,
)


def base_meta(sop_class, sop_uid) -> FileMetaDataset:
    m = FileMetaDataset()
    m.MediaStorageSOPClassUID = sop_class
    m.MediaStorageSOPInstanceUID = sop_uid
    m.TransferSyntaxUID = ExplicitVRLittleEndian
    m.ImplementationClassUID = generate_uid()
    return m


def make_ct_volume(
    out_dir: Path,
    *,
    patient_id: str,
    patient_name: str,
    age: int,
    sex: str,
    hemorrhage: bool,
    num_slices: int = 40,
    rows: int = 256,
    cols: int = 256,
    pixel_spacing: float = 0.6,
    slice_thickness: float = 5.0,
):
    """ينشئ silice متعددة في out_dir/."""
    out_dir.mkdir(parents=True, exist_ok=True)
    study_uid = generate_uid()
    series_uid = generate_uid()
    today = date.today()
    accession = f"ACC-{study_uid[-8:]}"

    yy, xx = np.ogrid[:rows, :cols]
    cx = cy = cols // 2

    # axial loop: slices ترتقي من القاعدة لقمة الجمجمة
    for z in range(num_slices):
        sop_uid = generate_uid()
        # دماغ يتغير حجمه قليلاً مع z (لإعطاء shape "كروي" تقريبي)
        depth_factor = abs(z - num_slices / 2) / (num_slices / 2)
        skull_r = int(105 - depth_factor * 40)
        brain_r = int(skull_r - 12)
        skull_r = max(skull_r, 20)
        brain_r = max(brain_r, 8)

        arr = np.full((rows, cols), -1000, dtype=np.int16)  # هواء
        skull_mask = (xx - cx) ** 2 + (yy - cy) ** 2 <= skull_r ** 2
        brain_mask = (xx - cx) ** 2 + (yy - cy) ** 2 <= brain_r ** 2
        arr[skull_mask & ~brain_mask] = 1100  # عظم الجمجمة
        arr[brain_mask] = 35 + np.random.randint(-3, 4)  # دماغ مع noise خفيف

        # نزيف في slices المتوسطة فقط (10-25)
        if hemorrhage and 10 <= z <= 28:
            hx = cx - 30
            hy = cy - 25
            h_r = 22 if 14 <= z <= 22 else 12
            h_mask = (xx - hx) ** 2 + (yy - hy) ** 2 <= h_r ** 2
            arr[h_mask & brain_mask] = 75 + np.random.randint(-5, 6)

        fm = base_meta(CTImageStorage, sop_uid)
        ds = FileDataset(str(out_dir), {}, file_meta=fm, preamble=b"\0" * 128)
        ds.SOPClassUID = CTImageStorage
        ds.SOPInstanceUID = sop_uid
        ds.StudyInstanceUID = study_uid
        ds.SeriesInstanceUID = series_uid
        ds.PatientID = patient_id
        ds.PatientName = patient_name
        ds.PatientBirthDate = f"{today.year - age}0101"
        ds.PatientSex = sex
        ds.StudyDate = today.strftime("%Y%m%d")
        ds.StudyTime = datetime.now().strftime("%H%M%S")
        ds.AccessionNumber = accession
        ds.Modality = "CT"
        ds.BodyPartExamined = "BRAIN"
        ds.StudyDescription = "CT BRAIN W/O CONTRAST"
        ds.SeriesDescription = "AXIAL 5MM"
        ds.SeriesNumber = "1"
        ds.InstanceNumber = z + 1
        ds.SliceLocation = float(z * slice_thickness)
        ds.ImagePositionPatient = [-128.0 * pixel_spacing, -128.0 * pixel_spacing, float(z * slice_thickness)]
        ds.ImageOrientationPatient = [1, 0, 0, 0, 1, 0]
        ds.PixelSpacing = [pixel_spacing, pixel_spacing]
        ds.SliceThickness = slice_thickness
        ds.SamplesPerPixel = 1
        ds.PhotometricInterpretation = "MONOCHROME2"
        ds.Rows = rows
        ds.Columns = cols
        ds.BitsAllocated = 16
        ds.BitsStored = 16
        ds.HighBit = 15
        ds.PixelRepresentation = 1
        ds.RescaleSlope = 1.0
        ds.RescaleIntercept = 0.0
        ds.WindowCenter = 40
        ds.WindowWidth = 80
        ds.PixelData = arr.tobytes()
        ds.is_little_endian = True
        ds.is_implicit_VR = False
        out_path = out_dir / f"slice_{z+1:03d}.dcm"
        ds.save_as(str(out_path), write_like_original=False)

    return study_uid, num_slices


def make_chest_xr(out_path: Path, patient_id: str, patient_name: str):
    rows = cols = 768
    arr = (np.random.randn(rows, cols) * 50 + 800).astype(np.uint16)
    # خطوط ضلوع تقريبية
    for k in range(7):
        y = int(rows * (0.25 + k * 0.07))
        arr[y - 2 : y + 2, cols // 4 : 3 * cols // 4] = 300
    sop_uid = generate_uid()
    study_uid = generate_uid()
    series_uid = generate_uid()
    fm = base_meta(ComputedRadiographyImageStorage, sop_uid)
    ds = FileDataset(str(out_path), {}, file_meta=fm, preamble=b"\0" * 128)
    ds.SOPClassUID = ComputedRadiographyImageStorage
    ds.SOPInstanceUID = sop_uid
    ds.StudyInstanceUID = study_uid
    ds.SeriesInstanceUID = series_uid
    ds.PatientID = patient_id
    ds.PatientName = patient_name
    ds.PatientBirthDate = "19790101"
    ds.PatientSex = "F"
    ds.StudyDate = date.today().strftime("%Y%m%d")
    ds.AccessionNumber = f"ACC-XR-{sop_uid[-8:]}"
    ds.Modality = "CR"
    ds.BodyPartExamined = "CHEST"
    ds.StudyDescription = "CHEST PA"
    ds.SeriesDescription = "PA VIEW"
    ds.SeriesNumber = "1"
    ds.InstanceNumber = "1"
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"
    ds.Rows = rows
    ds.Columns = cols
    ds.BitsAllocated = 16
    ds.BitsStored = 16
    ds.HighBit = 15
    ds.PixelRepresentation = 0
    ds.PixelData = arr.tobytes()
    ds.is_little_endian = True
    ds.is_implicit_VR = False
    ds.save_as(str(out_path), write_like_original=False)


def main() -> None:
    out = Path("fixtures")
    # نظّف أي إنتاج سابق
    for sub in ["ct-brain-hemorrhage", "ct-brain-normal"]:
        if (out / sub).exists():
            shutil.rmtree(out / sub)

    print("-> generating CT brain hemorrhage (40 slices)...")
    make_ct_volume(
        out / "ct-brain-hemorrhage",
        patient_id="MRN-2026-0142",
        patient_name="Ahmed^Mohamed",
        age=67,
        sex="M",
        hemorrhage=True,
        num_slices=40,
    )
    print("-> generating CT brain normal (40 slices)...")
    make_ct_volume(
        out / "ct-brain-normal",
        patient_id="MRN-2026-0188",
        patient_name="Sara^Hassan",
        age=42,
        sex="F",
        hemorrhage=False,
        num_slices=40,
    )
    print("-> generating chest x-ray...")
    out.mkdir(exist_ok=True)
    make_chest_xr(out / "chest-xray.dcm", "MRN-2026-0203", "Mostafa^Ali")

    print(f"\n[OK] fixtures ready in {out.resolve()}/")
    print("   - ct-brain-hemorrhage/ (40 slices)")
    print("   - ct-brain-normal/ (40 slices)")
    print("   - chest-xray.dcm")


if __name__ == "__main__":
    main()
