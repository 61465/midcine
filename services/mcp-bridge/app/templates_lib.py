"""Radiology templates library.

Indexes the "Common Tamplates" folder (1200+ .doc/.docx templates organized by
modality → region → condition). Extracts text once at boot, caches to JSON, and
serves search/browse/get by id.

Design:
- Each template has a stable `id` = sha1(relative_path)[:12]
- Categorization from folder tree + filename tokens (Normal / Aging / pathology).
- `.doc` parsed via olefile+heuristic (pure Python), `.docx` via docx2txt.
- Cache lives at data/templates_index.json, rebuilt when folder mtime changes.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Any

log = logging.getLogger("mcp-bridge.templates")

BASE = Path(__file__).resolve().parent.parent
TEMPLATES_ROOT = Path(
    os.getenv(
        "MIDCINE_TEMPLATES_ROOT",
        str(BASE.parent.parent / "Common Tamplates" / "Common Tamplates"),
    )
)
CACHE_PATH = Path(os.getenv("MIDCINE_TEMPLATES_CACHE", str(BASE / "data" / "templates_index.json")))

MODALITY_MAP = {
    "1-X-Ray": "X-Ray",
    "2-Ultrasound": "US",
    "3-C.T": "CT",
    "4-MRI": "MRI",
    "5-I.R": "IR",
    "6-Isotop Scanning": "Isotope",
}

NORMAL_TOKENS = ("normal", "-normal ", " normal.", "aging")


def _tid(rel: str) -> str:
    return hashlib.sha1(rel.encode("utf-8")).hexdigest()[:12]


def _extract_docx(path: Path) -> str:
    try:
        import docx2txt

        return (docx2txt.process(str(path)) or "").strip()
    except Exception as e:
        log.debug("docx2txt failed for %s: %s", path.name, e)
        return ""


def _extract_doc(path: Path) -> str:
    """Best-effort .doc extractor using olefile + text heuristic."""
    try:
        import olefile

        if not olefile.isOleFile(str(path)):
            return ""
        ole = olefile.OleFileIO(str(path))
        try:
            if not ole.exists("WordDocument"):
                return ""
            data = ole.openstream("WordDocument").read()
        finally:
            ole.close()

        # Extract runs of printable ASCII either as UTF-16LE or plain latin-1
        out: list[str] = []
        n = len(data)
        i = 0
        while i < n - 1:
            # UTF-16LE ASCII run
            if 32 <= data[i] < 127 and data[i + 1] == 0:
                j = i
                run: list[str] = []
                while j < n - 1 and (
                    (32 <= data[j] < 127 and data[j + 1] == 0)
                    or (data[j] == 0x0A and data[j + 1] == 0)
                    or (data[j] == 0x0D and data[j + 1] == 0)
                    or (data[j] == 0x09 and data[j + 1] == 0)
                ):
                    ch = chr(data[j]) if data[j] >= 32 else " "
                    run.append(ch)
                    j += 2
                if len(run) >= 6:
                    out.append("".join(run))
                i = j
                continue
            # plain ASCII run (some .docs use CP1252)
            if 32 <= data[i] < 127:
                j = i
                run = []
                while j < n and (32 <= data[j] < 127 or data[j] in (0x0A, 0x0D, 0x09)):
                    run.append(chr(data[j]) if data[j] >= 32 else " ")
                    j += 1
                if len(run) >= 40:  # ascii-runs must be long to avoid noise
                    out.append("".join(run))
                i = j
                continue
            i += 1

        text = "\n".join(out)
        # Clean control chars
        text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", " ", text)
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()
    except Exception as e:
        log.debug("doc parse failed for %s: %s", path.name, e)
        return ""


def extract_text(path: Path) -> str:
    """Extract text from a .doc/.docx template file."""
    suf = path.suffix.lower()
    if suf == ".docx":
        return _extract_docx(path)
    if suf == ".doc":
        return _extract_doc(path)
    return ""


def _classify(rel_parts: list[str], filename: str) -> dict[str, str]:
    modality = MODALITY_MAP.get(rel_parts[0], rel_parts[0]) if rel_parts else "?"
    # region is the second folder; sub-region third if present
    region = rel_parts[1] if len(rel_parts) > 1 else ""
    sub = rel_parts[2] if len(rel_parts) > 2 else ""

    stem = Path(filename).stem
    low = stem.lower().replace("_", " ")

    # detect condition — anything after " - " on the last leaf
    condition = ""
    is_normal = False
    if any(t in low for t in NORMAL_TOKENS) and "+" not in stem:
        is_normal = True
        condition = "Normal"
    else:
        # take right-of last hyphen
        m = re.split(r"\s-\s", stem)
        if len(m) > 1:
            condition = m[-1].strip().strip(".")
        else:
            condition = stem
        condition = re.sub(r"\s*\(\d+\)\s*$", "", condition).strip()

    return {
        "modality": modality,
        "region": region,
        "sub_region": sub,
        "condition": condition or "Unspecified",
        "is_normal": "1" if is_normal else "0",
    }


def _root_mtime() -> float:
    if not TEMPLATES_ROOT.exists():
        return 0.0
    latest = 0.0
    for p in TEMPLATES_ROOT.rglob("*"):
        try:
            m = p.stat().st_mtime
            if m > latest:
                latest = m
        except Exception:
            continue
    return latest


def _load_cache() -> dict | None:
    if not CACHE_PATH.exists():
        return None
    try:
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    except Exception:
        return None


def _save_cache(idx: dict) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(idx, ensure_ascii=False), encoding="utf-8")


def build_index(force: bool = False) -> dict:
    """Scan the templates folder and cache extracted text. Returns the index."""
    if not TEMPLATES_ROOT.exists():
        log.warning("Templates root missing: %s", TEMPLATES_ROOT)
        return {"root": str(TEMPLATES_ROOT), "count": 0, "items": {}, "built_at": time.time()}

    cur_mtime = _root_mtime()
    cached = _load_cache()
    if cached and not force and abs(cached.get("root_mtime", 0) - cur_mtime) < 1:
        return cached

    items: dict[str, dict[str, Any]] = {}
    n_ok = 0
    n_fail = 0
    for p in TEMPLATES_ROOT.rglob("*"):
        if not p.is_file():
            continue
        if p.suffix.lower() not in (".doc", ".docx"):
            continue
        try:
            rel = p.relative_to(TEMPLATES_ROOT).as_posix()
        except Exception:
            continue
        parts = rel.split("/")
        tags = _classify(parts[:-1], p.name)
        text = extract_text(p)
        if text:
            n_ok += 1
        else:
            n_fail += 1
        items[_tid(rel)] = {
            "id": _tid(rel),
            "rel_path": rel,
            "filename": p.name,
            "modality": tags["modality"],
            "region": tags["region"],
            "sub_region": tags["sub_region"],
            "condition": tags["condition"],
            "is_normal": tags["is_normal"] == "1",
            "text": text[:15000],
            "text_ok": bool(text),
            "size": p.stat().st_size,
        }

    idx = {
        "root": str(TEMPLATES_ROOT),
        "root_mtime": cur_mtime,
        "built_at": time.time(),
        "count": len(items),
        "extracted_ok": n_ok,
        "extracted_fail": n_fail,
        "items": items,
    }
    _save_cache(idx)
    log.info("templates index: %d files, %d text OK, %d fail", len(items), n_ok, n_fail)
    return idx


_INDEX_CACHE: dict | None = None


def get_index(force: bool = False) -> dict:
    global _INDEX_CACHE
    if force or _INDEX_CACHE is None:
        _INDEX_CACHE = build_index(force=force)
    return _INDEX_CACHE


def list_modalities() -> list[dict]:
    idx = get_index()
    counts: dict[str, int] = {}
    for it in idx["items"].values():
        counts[it["modality"]] = counts.get(it["modality"], 0) + 1
    return [{"modality": m, "count": c} for m, c in sorted(counts.items())]


def browse(modality: str | None = None, region: str | None = None) -> list[dict]:
    idx = get_index()
    out = []
    for it in idx["items"].values():
        if modality and it["modality"].lower() != modality.lower():
            continue
        if region and region.lower() not in it["region"].lower():
            continue
        out.append(
            {
                "id": it["id"],
                "modality": it["modality"],
                "region": it["region"],
                "sub_region": it["sub_region"],
                "condition": it["condition"],
                "is_normal": it["is_normal"],
                "filename": it["filename"],
                "text_ok": it["text_ok"],
            }
        )
    out.sort(key=lambda x: (x["region"], x["is_normal"] is False, x["condition"]))
    return out


def get_template(tid: str) -> dict | None:
    idx = get_index()
    return idx["items"].get(tid)


def search(query: str, modality: str = "", body_part: str = "", limit: int = 30) -> list[dict]:
    """Rank templates by simple tf-ish scoring across region/condition/text."""
    idx = get_index()
    q = query.lower().strip()
    terms = [t for t in re.findall(r"[a-z0-9]{3,}", q) if t]
    results = []
    for it in idx["items"].values():
        if modality and it["modality"].lower() != modality.lower():
            continue
        if body_part:
            bp = body_part.lower()
            if bp not in it["region"].lower() and bp not in it["sub_region"].lower():
                continue
        score = 0.0
        blob = " ".join(
            [
                it["region"].lower(),
                it["sub_region"].lower(),
                it["condition"].lower(),
                it["text"][:2000].lower() if it["text"] else "",
            ]
        )
        for t in terms:
            if t in it["condition"].lower():
                score += 3.0
            if t in it["region"].lower() or t in it["sub_region"].lower():
                score += 2.0
            if t in blob:
                score += 1.0
        # Pathology templates ranked above normals when searching for a condition
        if terms and not it["is_normal"]:
            score += 0.5
        if score > 0:
            results.append(
                {
                    "id": it["id"],
                    "score": round(score, 2),
                    "modality": it["modality"],
                    "region": it["region"],
                    "sub_region": it["sub_region"],
                    "condition": it["condition"],
                    "is_normal": it["is_normal"],
                    "filename": it["filename"],
                    "preview": (it["text"][:280] if it["text"] else "").strip(),
                }
            )
    results.sort(key=lambda x: -x["score"])
    return results[:limit]
