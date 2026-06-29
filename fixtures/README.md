# fixtures

ملفات DICOM اصطناعية للاختبار. تُولّد بـ:

```powershell
python scripts/make_test_dicom.py
```

| الملف | الوصف | النتيجة المتوقعة من AI stub |
|------|--------|-----------------------------|
| ct-brain-hemorrhage.dcm | CT دماغ بـ "تجمع دموي" pixel intensity HU 75 | priority=1, label=intracranial_hemorrhage, confidence ≥0.9 |
| ct-brain-normal.dcm | CT دماغ طبيعي | priority=5, label=no_acute_finding |
| chest-xray.dcm | Chest XR عشوائي | priority=5 (الـ stub يركز على CT brain فقط) |
