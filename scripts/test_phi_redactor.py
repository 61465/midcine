"""Verify PHI redactor: nothing that identifies a real patient reaches the LLM."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "services" / "mcp-bridge"))

from app.phi_redactor import redact, redact_study_prompt


def _assert(cond: bool, msg: str) -> None:
    if not cond:
        print(f"  FAIL: {msg}")
        raise AssertionError(msg)
    print(f"  OK:   {msg}")


def test_arabic_name_with_honorific() -> None:
    text = "قدم المريض الدكتور محمد أحمد علي بألم صدر"
    r = redact(text)
    _assert("محمد أحمد علي" not in r.text, "Arabic doctor name removed")
    _assert("NAME_AR-" in r.text or "الدكتور [NAME" in r.text, "Arabic name token present")
    _assert("قدم المريض" in r.text, "Clinical verbiage preserved")


def test_latin_name_with_honorific() -> None:
    text = "Patient referred by Dr. Ahmed Al-Rashid for CT chest"
    r = redact(text)
    _assert("Ahmed Al-Rashid" not in r.text, "Latin doctor name removed")
    _assert("Patient referred by" in r.text, "Prefix intact")


def test_phone_and_email() -> None:
    text = "Contact +201002233445 or patient@hospital.com regarding results"
    r = redact(text)
    _assert("+201002233445" not in r.text, "E.164 phone removed")
    _assert("patient@hospital.com" not in r.text, "Email removed")
    _assert("[PHONE-" in r.text, "Phone token present")
    _assert("[EMAIL-" in r.text, "Email token present")


def test_mrn_and_accession() -> None:
    text = "See prior report for MRN-99887 and accession ACC-77812"
    r = redact(text)
    _assert("MRN-99887" not in r.text, "MRN removed")
    _assert("ACC-77812" not in r.text, "Accession removed")


def test_bare_patient_name() -> None:
    text = "The patient Youssef Al-Hakim, aged 62, complained of headache"
    r = redact(text, patient_name="Youssef Al-Hakim")
    _assert("Youssef Al-Hakim" not in r.text, "Bare full name removed when known")
    _assert("headache" in r.text, "Symptom preserved")


def test_deterministic_token() -> None:
    text_a = "Dr. Ali Al-Zahrani ordered"
    text_b = "Dr. Ali Al-Zahrani sent"
    ra = redact(text_a)
    rb = redact(text_b)
    tok_a = next(iter(ra.mapping.keys()))
    tok_b = next(iter(rb.mapping.keys()))
    _assert(tok_a == tok_b, f"Same name yields same token ({tok_a} == {tok_b})")


def test_full_prompt_build() -> None:
    prompt, mapping = redact_study_prompt(
        modality="CT",
        body_part="BRAIN",
        patient_name="Youssef Al-Hakim",
        patient_id="MRN-99887",
        age=62,
        sex="M",
        clinical_context=(
            "65yo male, sudden right hemiparesis. Referred by Dr. Fatima Al-Zahrani. "
            "Prior CT MRN-99887 shows old lacunar infarct. Contact +201002233445."
        ),
    )
    _assert("Youssef" not in prompt, "Patient given name NOT in prompt")
    _assert("Al-Hakim" not in prompt, "Patient family name NOT in prompt")
    _assert("MRN-99887" not in prompt, "MRN NOT in prompt")
    _assert("+201002233445" not in prompt, "Phone NOT in prompt")
    _assert("Fatima Al-Zahrani" not in prompt, "Referring doctor NOT in prompt")
    _assert("age~60s" in prompt, "Age coarsened to decade")
    _assert("hemiparesis" in prompt, "Clinical symptom preserved")
    _assert("modality=CT" in prompt and "body_part=BRAIN" in prompt, "Clinical facts preserved")
    _assert(len(mapping) >= 3, f"Multiple identifiers redacted (got {len(mapping)})")
    print(f"\n  SAFE PROMPT (goes to Naraya):\n    {prompt}\n")
    print("  REDACTION MAP (kept local for un-redact):")
    for tok, orig in mapping.items():
        print(f"    {tok} -> {orig}")


TESTS = [
    ("Arabic name with honorific", test_arabic_name_with_honorific),
    ("Latin name with honorific", test_latin_name_with_honorific),
    ("Phone + email", test_phone_and_email),
    ("MRN + accession", test_mrn_and_accession),
    ("Bare patient name (known)", test_bare_patient_name),
    ("Deterministic tokens", test_deterministic_token),
    ("Full study prompt build", test_full_prompt_build),
]


def main() -> int:
    failed = 0
    for name, fn in TESTS:
        print(f"\n=== TEST: {name} ===")
        try:
            fn()
        except AssertionError:
            failed += 1
    print("\n" + "=" * 50)
    print(f"RESULT: {len(TESTS) - failed}/{len(TESTS)} passed")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
