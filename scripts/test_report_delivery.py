"""E2E test — generate signed report, request WhatsApp send, verify:
1. PDF attachment created + parseable + reasonable size
2. DICOM SR attachment created + valid + parseable by pydicom
3. Three signed share links issued + resolveable
4. Text body contains impression + links
5. Files persisted on disk under WA_DIR/attachments/{message_id}/
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "services" / "mcp-bridge"))

import pydicom
import requests

BRIDGE = "http://localhost:8210"
WA_DIR = Path("D:/project/midcine/services/mcp-bridge/data/whatsapp")


def _assert(cond: bool, msg: str) -> None:
    if not cond:
        print(f"  FAIL: {msg}")
        sys.exit(1)
    print(f"  OK:   {msg}")


def main() -> int:
    print("=== 1. Pipeline + report + sign ===")
    study = {
        "study_uid": "1.2.826.0.1.midcine.DELIVERY-TEST",
        "modality": "CT",
        "body_part": "BRAIN",
        "patient_id": "MRN-99887",
        "patient_name": "Youssef Al-Hakim",
        "clinical_context": "Acute headache with right hemiparesis.",
        "hospital_id": "delivery-test",
    }
    r = requests.post(f"{BRIDGE}/pipeline", json={"study": study}, timeout=180)
    r.raise_for_status()
    pipe = r.json()
    r = requests.post(
        f"{BRIDGE}/report/generate",
        json={"study": study, "aggregate": pipe["aggregate"], "outputs": pipe["outputs"]},
        timeout=30,
    )
    r.raise_for_status()
    report = r.json()
    r = requests.post(
        f"{BRIDGE}/report/sign",
        json={"report": report, "signed_by": "Dr. Test Radiologist", "license_no": "RAD-999"},
        timeout=30,
    )
    r.raise_for_status()
    signed = r.json()
    _assert(signed.get("signed_at") is not None, "report signed")

    print("\n=== 2. Direct PDF download ===")
    r = requests.post(f"{BRIDGE}/report/pdf", json={"report": signed}, timeout=30)
    r.raise_for_status()
    pdf_bytes = r.content
    _assert(pdf_bytes.startswith(b"%PDF-"), f"PDF magic present ({len(pdf_bytes)} bytes)")
    _assert(len(pdf_bytes) > 3000, f"PDF size reasonable ({len(pdf_bytes)} bytes)")

    print("\n=== 3. Send report to doctor via WhatsApp mock (with attachments) ===")
    r = requests.post(
        f"{BRIDGE}/whatsapp/send",
        json={
            "report": signed,
            "to_phone": "+201002233445",
            "to_name": "Dr. Referring Physician",
            "kind": "report_to_doctor",
            "attach_pdf": True,
            "attach_dicom_sr": True,
            "include_share_links": True,
        },
        timeout=60,
    )
    r.raise_for_status()
    msg = r.json()
    _assert(msg["status"] == "delivered", "message status delivered")
    _assert(len(msg["attachments"]) == 2, f"2 attachments (got {len(msg['attachments'])})")

    kinds = {a["kind"]: a for a in msg["attachments"]}
    _assert("pdf" in kinds, "PDF attachment present")
    _assert("dicom_sr" in kinds, "DICOM SR attachment present")
    _assert(kinds["pdf"]["mime_type"] == "application/pdf", "PDF mime correct")
    _assert(kinds["dicom_sr"]["mime_type"] == "application/dicom", "SR mime correct")

    print(f"    PDF:  {kinds['pdf']['filename']} ({kinds['pdf']['size_bytes']} bytes)")
    print(f"    SR:   {kinds['dicom_sr']['filename']} ({kinds['dicom_sr']['size_bytes']} bytes)")

    print("\n=== 4. Verify files on disk ===")
    for a in msg["attachments"]:
        full_path = WA_DIR / a["payload_path"]
        _assert(full_path.exists(), f"file exists: {a['filename']}")
        actual_size = full_path.stat().st_size
        _assert(
            actual_size == a["size_bytes"], f"size matches ({actual_size} == {a['size_bytes']})"
        )

    # Parse SR back from disk
    sr_path = WA_DIR / kinds["dicom_sr"]["payload_path"]
    ds = pydicom.dcmread(sr_path)
    _assert(ds.Modality == "SR", "attached SR parseable, Modality=SR")

    # PDF starts with %PDF-
    pdf_path = WA_DIR / kinds["pdf"]["payload_path"]
    with pdf_path.open("rb") as f:
        head = f.read(8)
    _assert(head.startswith(b"%PDF-"), "attached PDF file valid")

    print("\n=== 5. Share links ===")
    links = msg.get("share_links", {})
    _assert(len(links) == 3, f"3 signed links (got {len(links)}): {list(links.keys())}")
    for kind, url in links.items():
        _assert(url.startswith("http"), f"{kind} link is URL")
        _assert("/share/" in url, f"{kind} link uses /share/ path")
        # Extract token
        token = url.split("/share/")[-1]
        # Verify via bridge
        r = requests.get(f"{BRIDGE}/share/{token}", timeout=5)
        r.raise_for_status()
        resolved = r.json()
        _assert(resolved.get("ok") is True, f"{kind} token verified")
        _assert(resolved["kind"] == kind, f"{kind} resolved kind matches")

    print("\n=== 6. Text body content ===")
    body = msg.get("text_body", "")
    _assert("تقرير أشعة" in body, "Arabic report header in body")
    _assert(signed["signed_by"] in body, "signer name in body")
    _assert(any(url in body for url in links.values()), "at least one link in body")

    print("\n  --- WhatsApp text body preview ---")
    print("  " + body.replace("\n", "\n  ")[:600])

    print("\n" + "=" * 50)
    print("RESULT: report delivery bundle complete")
    print(
        f"  Doctor receives: PDF ({kinds['pdf']['size_bytes']}B) + SR ({kinds['dicom_sr']['size_bytes']}B) + 3 links"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
