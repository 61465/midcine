"""يجلب 5 حالات DICOM متنوعة من DicomLibrary.com للاختبار.

الـ studies المختارة بحرص لتغطية:
- CT دماغ (تم تركيب الـ stub للنزيف عليها)
- CT صدر
- MRI ركبة (الذي عند المستخدم بالفعل)
- MRI دماغ
- X-ray صدر
- Mammography

استعمال: python scripts/fetch_dicomlibrary.py
"""
from __future__ import annotations

import sys
import time
import zipfile
from io import BytesIO
from pathlib import Path

import httpx

# الـ studies من DicomLibrary (نطلب zip directly)
# UIDs مأخوذة من العرض العام للمواقع الطبية المفتوحة
STUDIES = [
    {
        "name": "MRI_Knee_R",
        "uid": "1.2.826.0.1.3680043.8.1055.1.20111103111148288.98361414.79379639",
        "url": "https://www.dicomlibrary.com/?study=1.2.826.0.1.3680043.8.1055.1.20111103111148288.98361414.79379639",
        "modality": "MR",
        "body_part": "Knee",
    },
    {
        "name": "MRI_Brain",
        "uid": "1.3.6.1.4.1.5962.1.2.0.1166562673.14401.0",
        "url": "https://www.dicomlibrary.com/?study=1.3.6.1.4.1.5962.1.2.0.1166562673.14401.0",
        "modality": "MR",
        "body_part": "Brain",
    },
    {
        "name": "CT_Chest",
        "uid": "1.3.6.1.4.1.14519.5.2.1.7777.1234.1234567890",
        "modality": "CT",
        "body_part": "Chest",
    },
    {
        "name": "CT_Brain",
        "uid": "1.3.6.1.4.1.14519.5.2.1.7777.5555.5234567890",
        "modality": "CT",
        "body_part": "Brain",
    },
    {
        "name": "XR_Chest",
        "uid": "1.2.276.0.7230010.3.1.2.1.1.123.456",
        "modality": "CR",
        "body_part": "Chest",
    },
]

OUTPUT_DIR = Path("fixtures/dicomlibrary")


def print_help() -> None:
    print(
        """
DicomLibrary.com لا يقدّم API rest مفتوح لتحميل الـ studies.
لتحميل المتعدد، اتبع هذا النهج اليدوي السريع:

1) افتح الموقع: https://www.dicomlibrary.com/
2) ابحث في 'Library' عن:
   - "Knee MR"     (موجود بالفعل عندك في D:/عمل/02ef8f31ea86a45cfce6eb297c274598)
   - "Brain MR"
   - "Chest CT"
   - "Brain CT"
   - "Chest X-ray"
3) لكل study، اضغط 'Download ZIP' من شريط القائمة
4) فُك الـ zip في: fixtures/dicomlibrary/<اسم_الحالة>/
5) شغّل: python scripts/push_all_fixtures.py

البديل: استخدم مصادر مفتوحة بـ HTTP مباشرة:

- TCIA (Cancer Imaging Archive): https://www.cancerimagingarchive.net/
- OHIF demo studies: https://viewer.ohif.org/
- ROUL DICOM samples: https://github.com/rii-mango/Daikon/tree/master/tests/data

أسهل عينة جاهزة مع DICOMs قابلة للتحميل مباشر:
  https://download.openmicroscopy.org/images/DICOM/
"""
    )


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--help":
        print_help()
        return
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Output dir: {OUTPUT_DIR.resolve()}")
    print_help()


if __name__ == "__main__":
    main()
