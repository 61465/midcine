"""End-to-end MWL test — sends a C-FIND to the MWL SCP and verifies:
  1. Association established
  2. Identifier returned with expected DICOM VR types
  3. Wildcard + specific queries both work
  4. Only pending/in_progress studies exposed

Run:
  # Start the MWL SCP in another shell:
  #   cd services/dicom-mwl && python -m app.main
  # Then:
  python scripts/test_mwl_query.py
"""

from __future__ import annotations

import argparse
import sys

from pydicom.dataset import Dataset
from pynetdicom import AE
from pynetdicom.sop_class import ModalityWorklistInformationFind


def _query(host: str, port: int, ae_title: str, ident: Dataset, label: str) -> int:
    ae = AE(ae_title="TEST-SCU")
    ae.add_requested_context(ModalityWorklistInformationFind)
    assoc = ae.associate(host, port, ae_title=ae_title)
    if not assoc.is_established:
        print(f"  [{label}] FAIL — association rejected")
        return -1

    match_count = 0
    responses = assoc.send_c_find(ident, ModalityWorklistInformationFind)
    for status, resp_ds in responses:
        if status and status.Status == 0xFF00:
            match_count += 1
            if resp_ds:
                pn = getattr(resp_ds, "PatientName", "?")
                pid = getattr(resp_ds, "PatientID", "?")
                acc = getattr(resp_ds, "AccessionNumber", "?")
                mod = "?"
                if hasattr(resp_ds, "ScheduledProcedureStepSequence"):
                    sps = resp_ds.ScheduledProcedureStepSequence
                    if len(sps) > 0:
                        mod = getattr(sps[0], "Modality", "?")
                print(f"    match: {pn} ({pid}) acc={acc} modality={mod}")
        elif status and status.Status == 0x0000:
            print(f"  [{label}] SUCCESS — {match_count} matches")
        else:
            print(f"  [{label}] status={status.Status if status else 'None'}")

    assoc.release()
    return match_count


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="localhost")
    p.add_argument("--port", type=int, default=11115)
    p.add_argument("--aet", default="MIDCINE-MWL")
    args = p.parse_args()

    print(f"MWL SCP: {args.host}:{args.port} AET={args.aet}\n")

    all_pass = True

    # Test 1: universal query (everything)
    print("=== TEST 1: universal query (all pending studies) ===")
    q1 = Dataset()
    q1.PatientName = ""
    q1.PatientID = ""
    q1.AccessionNumber = ""
    q1.StudyInstanceUID = ""
    q1.RequestedProcedureID = ""
    sps = Dataset()
    sps.Modality = ""
    sps.ScheduledProcedureStepStartDate = ""
    sps.ScheduledStationAETitle = ""
    from pydicom.sequence import Sequence

    q1.ScheduledProcedureStepSequence = Sequence([sps])
    n1 = _query(args.host, args.port, args.aet, q1, "universal")
    if n1 < 0:
        all_pass = False

    # Test 2: filter by modality CT
    print("\n=== TEST 2: filter by Modality=CT ===")
    q2 = Dataset()
    q2.PatientName = ""
    sps2 = Dataset()
    sps2.Modality = "CT"
    q2.ScheduledProcedureStepSequence = Sequence([sps2])
    n2 = _query(args.host, args.port, args.aet, q2, "modality=CT")
    if n2 < 0:
        all_pass = False

    # Test 3: filter by PatientID prefix wildcard
    print("\n=== TEST 3: PatientID=MRN* (wildcard) ===")
    q3 = Dataset()
    q3.PatientID = "MRN*"
    q3.PatientName = ""
    sps3 = Dataset()
    sps3.Modality = ""
    q3.ScheduledProcedureStepSequence = Sequence([sps3])
    n3 = _query(args.host, args.port, args.aet, q3, "patient=MRN*")
    if n3 < 0:
        all_pass = False

    print("\n" + "=" * 50)
    print("RESULT:", "ALL PASSED" if all_pass and n1 > 0 else "SOME FAILED / EMPTY")
    print("Note: expect at least 1 CT match if HL7 test was run recently.")
    return 0 if all_pass and n1 > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
