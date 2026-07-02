"""E2E test — generate report + sign + send ORU^R01 back to a mock HIS listener.

Uses our own hl7-listener as the mock HIS (it accepts any HL7 message and ACKs).
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "services" / "mcp-bridge"))

import requests

BRIDGE = "http://localhost:8210"


def _assert(cond: bool, msg: str) -> None:
    if not cond:
        print(f"  FAIL: {msg}")
        sys.exit(1)
    print(f"  OK:   {msg}")


def main() -> int:
    print("=== 1. Run pipeline to produce agent outputs ===")
    study = {
        "study_uid": "1.2.826.0.1.midcine.ORU-TEST-001",
        "modality": "CT",
        "body_part": "BRAIN",
        "patient_id": "MRN-99887",
        "patient_name": "Youssef Al-Hakim",
        "clinical_context": "Acute headache with right hemiparesis.",
        "hospital_id": "oru-test",
    }
    r = requests.post(f"{BRIDGE}/pipeline", json={"study": study}, timeout=180)
    r.raise_for_status()
    pipe = r.json()
    _assert(len(pipe["outputs"]) > 0, "pipeline produced agent outputs")

    print("\n=== 2. Generate report draft ===")
    r = requests.post(
        f"{BRIDGE}/report/generate",
        json={"study": study, "aggregate": pipe["aggregate"], "outputs": pipe["outputs"]},
        timeout=30,
    )
    r.raise_for_status()
    report = r.json()
    _assert(len(report["sections"]) >= 5, f"report has {len(report['sections'])} sections")

    print("\n=== 3. Sign report ===")
    r = requests.post(
        f"{BRIDGE}/report/sign",
        json={"report": report, "signed_by": "Dr. Test Radiologist", "license_no": "RAD-999"},
        timeout=30,
    )
    r.raise_for_status()
    signed = r.json()
    _assert(signed.get("signed_at") is not None, "report signed with timestamp")

    print("\n=== 4. Preview ORU message ===")
    r = requests.post(
        f"{BRIDGE}/hl7/oru/preview",
        json={
            "report": signed,
            "host": "localhost",
            "port": 2575,
            "receiving_facility": "HOSPITAL_TEST",
        },
        timeout=10,
    )
    r.raise_for_status()
    preview = r.json()["message"]
    _assert(preview.startswith("MSH|"), "ORU starts with MSH")
    _assert("ORU^R01" in preview, "message type is ORU^R01")
    _assert("PID|" in preview, "PID segment present")
    _assert("OBR|" in preview, "OBR segment present")
    _assert(preview.count("OBX|") >= 5, "at least 5 OBX segments (one per section)")
    _assert(signed["signed_by"] in preview, "signer name in message")
    print(f"\n  ORU preview (first 400 chars):\n    {preview[:400]}...")

    print("\n=== 5. Send ORU to our hl7-listener as mock HIS ===")
    r = requests.post(
        f"{BRIDGE}/hl7/oru",
        json={
            "report": signed,
            "host": "localhost",
            "port": 2575,
            "receiving_facility": "HOSPITAL_TEST",
        },
        timeout=30,
    )
    r.raise_for_status()
    result = r.json()
    _assert(result.get("ok") is True, f"send succeeded: {result}")
    _assert(result.get("ack_code") == "AA", f"ACK is AA (got {result.get('ack_code')})")
    print(f"  control_id={result.get('control_id')}")

    print("\n" + "=" * 50)
    print("RESULT: ALL 5 STEPS PASSED — integration loop closes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
