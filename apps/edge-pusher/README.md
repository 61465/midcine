# edge-pusher

محاكي Edge Gateway للـ prototype. يراقب مجلد `inbox/` ويرفع ملفات DICOM للـ Ingestion API.

## التشغيل

```powershell
cd D:\project\midcine\apps\edge-pusher
uv pip install -e .
python -m app.pusher --inbox ./inbox --api http://localhost:8100
```

## الاستخدام
1. ضع ملفات `.dcm` في `inbox/`
2. سيرفعها تلقائياً ويخطر الـ Ingestion باكتمال الـ study
3. اتبع الحالة في الـ Web app على http://localhost:3000
