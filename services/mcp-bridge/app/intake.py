"""Patient intake — accept a mixed folder (DICOMs + PDFs + notes + photos)
and store each in the right place. Builds a dossier the AI can read.

Files live under data/dicoms/{uid}.series/  (existing pattern),
docs/notes/photos under         data/docs/{uid}/  (new).
"""

from __future__ import annotations

import logging
import os
import re
from pathlib import Path
from typing import Literal

log = logging.getLogger("mcp-bridge.intake")

FileKind = Literal["dicom", "pdf", "note", "photo", "unknown"]

BASE = Path(__file__).resolve().parent.parent
DOCS_DIR = Path(os.getenv("MIDCINE_DOCS_DIR", str(BASE / "data" / "docs")))
DOCS_DIR.mkdir(parents=True, exist_ok=True)


def _safe(name: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]", "_", name)[:200]


def study_docs_dir(study_uid: str) -> Path:
    """Directory holding non-DICOM files for a study."""
    d = DOCS_DIR / _safe(study_uid)
    d.mkdir(parents=True, exist_ok=True)
    return d


def classify_file(name: str, first_bytes: bytes) -> FileKind:
    """Classify by extension + magic bytes.

    Order matters — magic-byte DICM overrides everything (some hospitals give
    DICOM files random extensions).
    """
    if len(first_bytes) >= 132 and first_bytes[128:132] == b"DICM":
        return "dicom"

    ext = Path(name).suffix.lower()
    if ext in {".dcm", ".dicom", ".ima", ".dic"}:
        return "dicom"
    if ext == ".pdf" or first_bytes[:4] == b"%PDF":
        return "pdf"
    if ext in {".txt", ".md", ".rtf"}:
        return "note"
    if ext in {".jpg", ".jpeg", ".png", ".webp", ".bmp"}:
        # Bare JPEG could be a DICOM disguised — magic first
        return "photo"
    if ext in {".doc", ".docx"}:
        # Not extractable without a heavy dep; store as-is under docs
        return "note"
    return "unknown"


def extract_pdf_text(path: Path) -> str:
    """Extract text from a PDF, best-effort."""
    try:
        import pypdf

        reader = pypdf.PdfReader(str(path))
        parts = []
        for page in reader.pages:
            try:
                t = page.extract_text() or ""
                if t.strip():
                    parts.append(t)
            except Exception:
                continue
        return "\n\n".join(parts)
    except Exception as e:
        log.warning("PDF extract failed for %s: %s", path.name, e)
        return ""


def save_doc(study_uid: str, filename: str, kind: FileKind, data: bytes, *, prefix: str | None = None) -> Path:
    """Save a non-DICOM file under the study's docs dir. Returns the path.

    `prefix` overrides the on-disk prefix (default = kind). Use "report" to mark
    a file as an explicit patient-report attachment (visible separately in the UI).
    """
    d = study_docs_dir(study_uid)
    safe = _safe(filename)
    px = prefix or kind
    target = d / f"{px}__{safe}"
    with target.open("wb") as f:
        f.write(data)

    # For PDFs (or PDF reports), also cache extracted text for fast dossier build
    if kind == "pdf":
        text = extract_pdf_text(target)
        if text:
            (d / f"{px}__{safe}.txt").write_text(text, encoding="utf-8")
    elif px == "report" and kind == "note":
        # Plain-text (.txt/.md/.rtf) OR a .doc/.docx that classify_file lumped as
        # "note" — try to extract text and drop a .txt sidecar so build_dossier
        # + report-session readers can pick it up.
        suf = Path(safe).suffix.lower()
        if suf in {".doc", ".docx"}:
            try:
                from .templates_lib import extract_text as _tpl_extract  # reuse the doc parser

                extracted = _tpl_extract(target)
                if extracted:
                    (d / f"{px}__{safe}.txt").write_text(extracted, encoding="utf-8")
            except Exception as e:
                log.warning("doc/docx text extraction failed for %s: %s", safe, e)
    return target


def build_dossier(study_uid: str) -> dict:
    """Aggregate everything we know about the patient into a single dict."""
    from .studies_store import list_series_slices

    slices = list_series_slices(study_uid)
    d = study_docs_dir(study_uid)

    pdf_texts: list[dict] = []
    notes: list[dict] = []
    photos: list[str] = []
    reports: list[dict] = []

    for f in sorted(d.iterdir()):
        if not f.is_file():
            continue
        name = f.name
        # Patient reports (explicit uploads via /studies/{uid}/report)
        if name.startswith("report__"):
            if name.endswith(".txt"):
                # cached extracted text for a PDF report
                base = name[len("report__") : -len(".txt")]
                reports.append(
                    {
                        "name": base,
                        "kind": "pdf",
                        "text": f.read_text(encoding="utf-8", errors="replace")[:14000],
                    }
                )
            elif f.suffix.lower() in {".txt", ".md", ".rtf"}:
                reports.append(
                    {
                        "name": name[len("report__") :],
                        "kind": "note",
                        "text": f.read_text(encoding="utf-8", errors="replace")[:10000],
                    }
                )
            elif f.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}:
                reports.append(
                    {"name": name[len("report__") :], "kind": "photo", "text": ""}
                )
            # a report__foo.pdf without a sibling .txt still gets listed once its .txt lands
            continue
        if name.startswith("pdf__") and name.endswith(".txt"):
            pdf_texts.append(
                {
                    "name": name[len("pdf__") : -len(".txt")],
                    "text": f.read_text(encoding="utf-8", errors="replace")[:12000],
                }
            )
        elif name.startswith("note__"):
            try:
                notes.append(
                    {
                        "name": name[len("note__") :],
                        "text": f.read_text(encoding="utf-8", errors="replace")[:8000],
                    }
                )
            except Exception:
                pass
        elif name.startswith("photo__"):
            photos.append(name[len("photo__") :])

    return {
        "study_uid": study_uid,
        "dicom_slice_count": len(slices),
        "pdf_texts": pdf_texts,
        "notes": notes,
        "photos": photos,
        "reports": reports,
    }
