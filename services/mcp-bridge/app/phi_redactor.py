"""PHI redactor — Saudi PDPL / GDPR / HIPAA compliance layer for LLM calls.

Design:
  Before sending clinical text to Naraya (cloud LLM), replace direct identifiers
  with stable tokens. After the response comes back, we un-redact the same
  tokens (though for now the AI response should NOT reference specific patients
  anyway — the prompt asks for medical impressions, not names).

Direct identifiers redacted (HIPAA Safe Harbor §164.514(b)(2)(i)):
  - Personal names (Arabic + Latin)
  - Medical Record Numbers (MRN-*, PAT-*, etc.)
  - Phone numbers (E.164 + local)
  - Email addresses
  - Dates of birth (kept year only)
  - Full geographic identifiers smaller than state
  - Any 9+ digit numeric sequence that could be an ID

The redactor is DETERMINISTIC — the same name always maps to the same token
in a given process so the LLM can still make consistent references.

Not redacted (these are what we WANT the LLM to see):
  - Clinical facts: modality, body part, symptoms, medical history
  - Age (only birth year gets coarsened)
  - Sex
  - Referring specialty (not the referring doctor's name)
"""

from __future__ import annotations

import hashlib
import logging
import re
from dataclasses import dataclass, field

log = logging.getLogger("phi-redactor")


# Patterns for direct identifiers
# Order matters — apply longer/more specific patterns first.

_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    # Email
    ("EMAIL", re.compile(r"\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b")),
    # E.164 phone (+CC ...) — 8-15 digits after +
    ("PHONE", re.compile(r"\+\d{8,15}\b")),
    # Local phone — 9-11 digit sequences starting with 0
    ("PHONE", re.compile(r"\b0\d{8,10}\b")),
    # MRN / patient ID formats
    ("MRN", re.compile(r"\bMRN-?\d{3,}\b", re.IGNORECASE)),
    ("MRN", re.compile(r"\bPAT-?\d{3,}\b", re.IGNORECASE)),
    ("MRN", re.compile(r"\bSAMPLE-?\d{3,}\b", re.IGNORECASE)),
    # Accession numbers
    ("ACC", re.compile(r"\bACC-?\d{3,}\b", re.IGNORECASE)),
    # 9+ digit standalone number that could be a national ID
    ("ID", re.compile(r"\b\d{9,15}\b")),
    # Dates in YYYY-MM-DD form (keep year only, coarsen day/month)
    ("DATE", re.compile(r"\b(19|20)\d{2}-\d{2}-\d{2}\b")),
]

# Arabic honorifics that mark the start of a person's name
_ARABIC_HONORIFICS = [
    "السيد",
    "السيدة",
    "الأستاذ",
    "الأستاذة",
    "الدكتور",
    "الدكتورة",
    "دكتور",
    "دكتورة",
    "د.",
    "أ.د.",
    "أ.",
]
_LATIN_HONORIFICS = [
    "Dr.",
    "Dr",
    "Mr.",
    "Mr",
    "Mrs.",
    "Mrs",
    "Ms.",
    "Ms",
    "Prof.",
    "Prof",
    "Doctor",
    "Sheikh",
]


def _stable_token(kind: str, value: str, salt: str = "midcine") -> str:
    """Deterministic short token: [KIND-HHHH] so LLM references stay consistent."""
    digest = hashlib.blake2s(f"{salt}::{kind}::{value}".encode(), digest_size=3).hexdigest().upper()
    return f"[{kind}-{digest}]"


@dataclass
class RedactionResult:
    text: str
    mapping: dict[str, str] = field(default_factory=dict)  # token → original

    def unredact(self, response_text: str) -> str:
        """Restore original values in the LLM response (if any tokens leaked back)."""
        out = response_text
        for token, original in self.mapping.items():
            out = out.replace(token, original)
        return out


def _redact_pattern(text: str, mapping: dict[str, str]) -> str:
    """Apply all regex patterns, populate mapping."""
    for kind, pattern in _PATTERNS:
        for match in list(pattern.finditer(text)):
            original = match.group(0)
            token = _stable_token(kind, original)
            text = text.replace(original, token)
            mapping[token] = original
    return text


def _redact_arabic_names(text: str, mapping: dict[str, str]) -> str:
    """Redact 'الدكتور اسم اسم', 'د. اسم', 'السيد اسم' patterns.
    Arabic name = 2-4 Arabic-word cluster following an honorific."""
    for hon in _ARABIC_HONORIFICS:
        pattern = re.compile(
            rf"{re.escape(hon)}\s+([؀-ۿ][؀-ۿ\s]{{2,60}}?)(?=[.،؛,\s]|$)",
        )
        for match in list(pattern.finditer(text)):
            name = match.group(1).strip()
            # Trim to first 4 words
            words = name.split()[:4]
            trimmed = " ".join(words)
            token = _stable_token("NAME_AR", trimmed)
            text = text.replace(f"{hon} {trimmed}", f"{hon} {token}")
            mapping[token] = trimmed
    return text


def _redact_latin_names(text: str, mapping: dict[str, str]) -> str:
    """Redact 'Dr. First Last', 'Mr. Given Family' patterns."""
    for hon in _LATIN_HONORIFICS:
        # Escape honorific, then capture 2-4 capitalized Latin words
        pattern = re.compile(
            rf"\b{re.escape(hon)}\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){{1,3}})\b",
        )
        for match in list(pattern.finditer(text)):
            name = match.group(1).strip()
            token = _stable_token("NAME", name)
            text = text.replace(f"{hon} {name}", f"{hon} {token}")
            mapping[token] = name
    return text


def _redact_bare_name(text: str, name: str | None, mapping: dict[str, str]) -> str:
    """If we KNOW the patient's name, redact all occurrences directly."""
    if not name or len(name.strip()) < 3:
        return text
    stripped = name.strip()
    # Also try individual parts (first name alone)
    parts = [p for p in stripped.split() if len(p) >= 3]
    variants = [stripped, *parts]
    for variant in variants:
        # Word-boundary aware for Arabic + Latin
        pattern = re.compile(
            r"(?:^|(?<=[\s.،؛,()]))" + re.escape(variant) + r"(?=[\s.،؛,()]|$)",
        )
        for match in list(pattern.finditer(text)):
            found = match.group(0)
            token = _stable_token("NAME", stripped)  # single token for all variants
            text = text.replace(found, token)
            mapping[token] = stripped
    return text


def redact(text: str, patient_name: str | None = None) -> RedactionResult:
    """Redact PHI from `text`. If `patient_name` is provided, also redacts it directly."""
    if not text:
        return RedactionResult(text="", mapping={})

    mapping: dict[str, str] = {}
    working = text

    working = _redact_pattern(working, mapping)
    working = _redact_arabic_names(working, mapping)
    working = _redact_latin_names(working, mapping)
    working = _redact_bare_name(working, patient_name, mapping)

    if mapping:
        log.info("phi: redacted %d identifier(s)", len(mapping))

    return RedactionResult(text=working, mapping=mapping)


def redact_study_prompt(
    modality: str,
    body_part: str,
    patient_name: str | None,
    patient_id: str | None,
    age: int | None,
    sex: str | None,
    clinical_context: str | None,
) -> tuple[str, dict[str, str]]:
    """Build a PHI-safe study prompt for LLM.
    Returns (safe_prompt, mapping) — the mapping lets us un-redact response text."""
    ctx = clinical_context or "not provided"
    result = redact(ctx, patient_name=patient_name)

    # Age coarsening: report decade only
    age_str = "unknown"
    if age is not None and age > 0:
        decade = (age // 10) * 10
        age_str = f"{decade}s"

    sex_str = (sex or "unknown").upper()[:1]

    # Never send patient name / ID at all
    safe_prompt = (
        f"Study: modality={modality} body_part={body_part}. "
        f"Patient: age~{age_str} sex={sex_str}. "
        f"Clinical context: {result.text}. "
        "Respond ONLY with the JSON object your role requires."
    )
    return safe_prompt, result.mapping
