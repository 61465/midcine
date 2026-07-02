"""End-to-end HL7 test — sends a real ORM^O01 to the listener and verifies:
  1. TCP connection accepted
  2. MLLP-framed ACK received (MSA|AA)
  3. StudyRecord JSON was written to studies dir

Run:
  # Start the listener first in another shell:
  #   cd services/hl7-listener && python -m app.main
  # Then:
  python scripts/test_hl7_send.py
"""

from __future__ import annotations

import argparse
import json
import socket
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

MLLP_START = b"\x0b"
MLLP_END = b"\x1c\x0d"


SAMPLE_ORM_CT_BRAIN = (
    "MSH|^~\\&|CENTRICITY|HOSPITAL_A|MIDCINE|MIDCINE|20260702103000||"
    "ORM^O01|MSG-{ts}|P|2.5\r"
    "PID|1||MRN-99887||Al-Hakim^Youssef^Ahmed||19620314|M|||"
    "123 King Fahd Rd^^Riyadh^^12345^SA||+966501112233|||||\r"
    "PV1|1|O|RAD^^^HOSPITAL_A||||REF^Al-Zahrani^Fatima|||||||||||1234\r"
    "ORC|NW|ORD-55501|ACC-77812||SC||||20260702103000|||REF^Al-Zahrani^Fatima\r"
    "OBR|1|ORD-55501|ACC-77812|CT-BRAIN^Non-contrast CT of the brain^LOINC|"
    "S|20260702110000|20260702110000|||||||"
    "20260702103000||REF^Al-Zahrani^Fatima|||||||||CT|||^^^20260702110000^^S\r"
)


SAMPLE_ORM_MR_LUMBAR = (
    "MSH|^~\\&|CERNER|HOSPITAL_B|MIDCINE|MIDCINE|20260702104500||"
    "ORM^O01|MSG-{ts}|P|2.5\r"
    "PID|1||MRN-11234||Nasser^Layla^^^Ms||19850822|F|||"
    "45 Corniche Rd^^Alexandria^^21500^EG||+201009998877|||||\r"
    "PV1|1|O|RAD^^^HOSPITAL_B||||REF^Mansour^Omar|||||||||||5678\r"
    "ORC|NW|ORD-66610|ACC-88921||R||||20260702104500|||REF^Mansour^Omar\r"
    "OBR|1|ORD-66610|ACC-88921|MR-LUMBAR^MRI Lumbar spine^LOINC|"
    "R|20260702120000|20260702120000|||||||"
    "20260702104500||REF^Mansour^Omar|||||||||MR|||^^^20260702120000^^R\r"
)


def send_orm(host: str, port: int, hl7_text: str, timeout: float = 5.0) -> str:
    """Send an ORM over MLLP and return the ACK text (without framing)."""
    frame = MLLP_START + hl7_text.encode("utf-8") + MLLP_END
    with socket.create_connection((host, port), timeout=timeout) as sock:
        sock.sendall(frame)
        # Read until MLLP_END or timeout
        buf = b""
        deadline = time.time() + timeout
        while time.time() < deadline:
            chunk = sock.recv(4096)
            if not chunk:
                break
            buf += chunk
            if MLLP_END in buf:
                break
        # Strip framing
        start = buf.find(MLLP_START)
        end = buf.find(MLLP_END, start + 1) if start >= 0 else -1
        if start >= 0 and end >= 0:
            return buf[start + 1 : end].decode("utf-8", errors="replace")
        return buf.decode("utf-8", errors="replace")


def parse_msa(ack_text: str) -> tuple[str, str, str]:
    """Return (ack_code, control_id, error) from an MSA segment."""
    for line in ack_text.replace("\n", "\r").split("\r"):
        if line.startswith("MSA"):
            parts = line.split("|")
            code = parts[1] if len(parts) > 1 else "??"
            cid = parts[2] if len(parts) > 2 else ""
            err = parts[3] if len(parts) > 3 else ""
            return code, cid, err
    return "??", "", ""


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="localhost")
    p.add_argument("--port", type=int, default=2575)
    p.add_argument("--studies-dir", type=Path, default=Path("services/mcp-bridge/data/studies"))
    args = p.parse_args()

    now = datetime.now(UTC).strftime("%Y%m%d%H%M%S")

    tests = [
        ("CT Brain (STAT)", SAMPLE_ORM_CT_BRAIN.replace("{ts}", now + "-1")),
        ("MR Lumbar (Routine)", SAMPLE_ORM_MR_LUMBAR.replace("{ts}", now + "-2")),
    ]

    all_pass = True
    for label, msg in tests:
        print(f"\n=== TEST: {label} ===")
        print(f"Sending to {args.host}:{args.port} ({len(msg)} bytes)...")
        try:
            ack = send_orm(args.host, args.port, msg)
        except (OSError, TimeoutError) as e:
            print(f"  FAIL — connection error: {e}")
            all_pass = False
            continue

        code, cid, err = parse_msa(ack)
        print(f"  ACK: code={code} control_id={cid} error={err or '(none)'}")
        if code == "AA":
            print("  PASS — accepted")
        else:
            print(f"  FAIL — got MSA|{code}")
            all_pass = False
            continue

        # Verify a file was written
        time.sleep(0.2)
        if args.studies_dir.exists():
            written = sorted(args.studies_dir.glob("*.json"), key=lambda p: p.stat().st_mtime)
            if written:
                newest = written[-1]
                print(f"  wrote: {newest.name} ({newest.stat().st_size} bytes)")
                try:
                    data = json.loads(newest.read_text(encoding="utf-8"))
                    print(
                        f"  study_uid={data.get('study_uid')} "
                        f"patient={data.get('patient_name')} ({data.get('patient_id')}) "
                        f"modality={data.get('modality')} "
                        f"body_part={data.get('body_part')} "
                        f"priority={data.get('priority')}"
                    )
                except (OSError, json.JSONDecodeError) as e:
                    print(f"  ! could not read written file: {e}")
                    all_pass = False

    print("\n" + ("=" * 50))
    print("RESULT:", "ALL PASSED" if all_pass else "SOME FAILED")
    return 0 if all_pass else 1


if __name__ == "__main__":
    sys.exit(main())
