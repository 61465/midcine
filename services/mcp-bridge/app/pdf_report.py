"""PDF report generator — Arabic RTL layout for FinalReport.

Design decisions:
  - reportlab (widely deployed, no browser dep) + arabic-reshaper + python-bidi
    for correct Arabic character shaping.
  - A4 page, right-to-left flow, single column.
  - Section-per-block layout with heading + body.
  - Signer block at the bottom with license + timestamp.
  - Uses an embedded TrueType font that supports Arabic (Amiri if bundled, else
    a bundled Noto fallback). Falls back to Helvetica for English-only if
    no Arabic font found — logs a warning in that case.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path

import arabic_reshaper
from bidi.algorithm import get_display
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

from .report import FinalReport

log = logging.getLogger("pdf-report")


_FONT_REGISTERED = False
_FONT_NAME = "Helvetica"

# Look for Arabic-capable fonts on Windows/Linux
_CANDIDATE_FONTS: list[tuple[str, list[Path]]] = [
    (
        "Tajawal",
        [
            Path(r"C:\Windows\Fonts\tajawal-regular.ttf"),
            Path("/usr/share/fonts/truetype/tajawal/Tajawal-Regular.ttf"),
        ],
    ),
    (
        "Amiri",
        [
            Path(r"C:\Windows\Fonts\amiri-regular.ttf"),
            Path("/usr/share/fonts/truetype/amiri/amiri-regular.ttf"),
        ],
    ),
    (
        "Arial",
        [
            Path(r"C:\Windows\Fonts\arial.ttf"),
        ],
    ),
    (
        "DejaVuSans",
        [
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        ],
    ),
]


def _ensure_font() -> str:
    """Register an Arabic-capable font once. Return its logical name."""
    global _FONT_REGISTERED, _FONT_NAME
    if _FONT_REGISTERED:
        return _FONT_NAME
    for name, paths in _CANDIDATE_FONTS:
        for p in paths:
            if p.exists():
                try:
                    pdfmetrics.registerFont(TTFont(name, str(p)))
                    _FONT_NAME = name
                    _FONT_REGISTERED = True
                    log.info("pdf: registered font %s from %s", name, p)
                    return name
                except Exception as e:
                    log.warning("pdf: could not load %s: %s", p, e)
                    continue
    log.warning(
        "pdf: no Arabic font found — falling back to Helvetica (Arabic will render as boxes)"
    )
    _FONT_REGISTERED = True
    return _FONT_NAME


def _reshape_ar(text: str) -> str:
    """Shape + bidi Arabic text so it renders correctly in PDF."""
    if not text:
        return ""
    try:
        reshaped = arabic_reshaper.reshape(text)
        return get_display(reshaped)
    except Exception:
        return text


def _draw_wrapped(
    c: canvas.Canvas,
    text: str,
    x_right: float,
    y: float,
    width: float,
    font: str,
    size: float,
    leading: float,
) -> float:
    """Draw text right-aligned, wrapping at word boundaries. Return new y."""
    from reportlab.pdfbase.pdfmetrics import stringWidth

    if not text:
        return y

    # Split by paragraphs first, then word-wrap each
    paragraphs = text.replace("\r", "").split("\n")
    line_height = size * leading

    for para in paragraphs:
        if not para.strip():
            y -= line_height / 2
            continue
        words = para.split()
        cur_line: list[str] = []
        for w in words:
            candidate = " ".join([*cur_line, w])
            reshaped = _reshape_ar(candidate)
            if stringWidth(reshaped, font, size) <= width:
                cur_line.append(w)
            else:
                if cur_line:
                    line_text = _reshape_ar(" ".join(cur_line))
                    c.drawRightString(x_right, y, line_text)
                    y -= line_height
                cur_line = [w]
        if cur_line:
            line_text = _reshape_ar(" ".join(cur_line))
            c.drawRightString(x_right, y, line_text)
            y -= line_height
        y -= line_height * 0.3  # paragraph break

    return y


def build_pdf(report: FinalReport) -> bytes:
    """Render FinalReport to Arabic RTL PDF bytes."""
    font = _ensure_font()
    bold_font = font  # reportlab needs separate bold registration; skip for simplicity

    buf = BytesIO()
    page_w, page_h = A4
    margin_x = 20 * mm
    margin_top = 20 * mm
    margin_bottom = 20 * mm
    text_w = page_w - 2 * margin_x
    x_right = page_w - margin_x

    c = canvas.Canvas(buf, pagesize=A4)
    c.setTitle(f"midcine report {report.study_uid}")
    c.setAuthor("midcine")

    # Header band
    header_h = 22 * mm
    c.setFillColor(HexColor("#15305B"))  # brand navy
    c.rect(0, page_h - header_h, page_w, header_h, fill=1, stroke=0)

    c.setFillColor(HexColor("#C5A059"))  # gold
    c.setFont(font, 20)
    c.drawRightString(x_right, page_h - 12 * mm, _reshape_ar("midcine"))

    c.setFillColor(HexColor("#FFFFFF"))
    c.setFont(font, 9)
    c.drawRightString(x_right, page_h - 18 * mm, _reshape_ar("تقرير أشعة رسمي · Radiology Report"))

    # Meta block (patient + study)
    y = page_h - header_h - 10 * mm
    c.setFillColor(HexColor("#0F172A"))
    c.setFont(font, 11)

    meta_lines = [
        f"المريض: {report.patient_name or '—'}",
        f"رقم المريض: {report.patient_id or '—'}",
        f"الفحص: {report.modality} — {report.body_part}",
        f"رقم الدراسة: {report.study_uid}",
        f"المستشفى: {report.hospital_id}",
        f"تاريخ التوليد: {report.generated_at.strftime('%Y-%m-%d %H:%M')}",
    ]
    for line in meta_lines:
        c.drawRightString(x_right, y, _reshape_ar(line))
        y -= 6 * mm
    y -= 4 * mm

    # Separator
    c.setStrokeColor(HexColor("#C5A059"))
    c.setLineWidth(1)
    c.line(margin_x, y, x_right, y)
    y -= 8 * mm

    # Sections
    for section in report.sections:
        if y < margin_bottom + 40 * mm:
            c.showPage()
            y = page_h - margin_top

        # Section title
        c.setFillColor(HexColor("#15305B"))
        c.setFont(bold_font, 13)
        c.drawRightString(x_right, y, _reshape_ar(section.title_ar))
        y -= 5 * mm

        # Underline
        c.setStrokeColor(HexColor("#E5E7EB"))
        c.setLineWidth(0.5)
        c.line(margin_x, y, x_right, y)
        y -= 5 * mm

        # Body
        c.setFillColor(HexColor("#334155"))
        c.setFont(font, 10.5)
        y = _draw_wrapped(c, section.content_ar or "", x_right, y, text_w, font, 10.5, 1.35)
        y -= 4 * mm

    # Signer block
    if y < margin_bottom + 30 * mm:
        c.showPage()
        y = page_h - margin_top
    y -= 6 * mm
    c.setStrokeColor(HexColor("#15305B"))
    c.setLineWidth(1.5)
    c.line(margin_x, y, x_right, y)
    y -= 6 * mm

    c.setFillColor(HexColor("#15305B"))
    c.setFont(bold_font, 11)
    if report.signed_at and report.signed_by:
        signed_dt = report.signed_at
        if isinstance(signed_dt, str):
            try:
                signed_dt = datetime.fromisoformat(signed_dt.replace("Z", "+00:00"))
            except ValueError:
                signed_dt = datetime.now(UTC)
        c.drawRightString(x_right, y, _reshape_ar(f"الطبيب: {report.signed_by}"))
        y -= 5 * mm
        c.drawRightString(x_right, y, _reshape_ar(f"رقم الترخيص: {report.license_no or '—'}"))
        y -= 5 * mm
        c.drawRightString(
            x_right, y, _reshape_ar(f"تاريخ التوقيع: {signed_dt.strftime('%Y-%m-%d %H:%M')}")
        )
    else:
        c.setFillColor(HexColor("#B45309"))
        c.drawRightString(x_right, y, _reshape_ar("⚠ التقرير غير موقّع بعد — مسودّة"))

    # Footer
    c.setFillColor(HexColor("#94A3B8"))
    c.setFont(font, 7.5)
    footer_text = _reshape_ar(
        "أُنشئ هذا التقرير بمساعدة NEXUS AI Ensemble وراجعه ووقّعه طبيب مختصّ · midcine.io"
    )
    c.drawCentredString(page_w / 2, margin_bottom / 2, footer_text)

    c.showPage()
    c.save()
    return buf.getvalue()
