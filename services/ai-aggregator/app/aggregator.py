"""Consensus algorithm. Real LLM-assisted aggregation lands in Sprint 10."""
from .config import settings
from .schemas import (
    AggregateRequest,
    AggregateResponse,
    Disagreement,
    Finding,
    Impression,
)


def aggregate(req: AggregateRequest) -> AggregateResponse:
    successful = [o for o in req.specialist_outputs if o.ok and o.data]
    failed = [o for o in req.specialist_outputs if not o.ok]

    findings: list[Finding] = []
    impressions: list[Impression] = []
    disagreements: list[Disagreement] = []

    # Naive Sprint-0 aggregation:
    # - take findings from each specialist as separate items
    # - confidence per specialist; aggregator avg across successful
    confidences: list[float] = []
    for output in successful:
        data = output.data or {}
        conf = float(data.get("confidence", 0.0))
        confidences.append(conf)
        text = str(data.get("summary", "")) or str(data.get("label", ""))
        if text:
            findings.append(Finding(text=text, confidence=conf, models=[output.model]))

    overall = sum(confidences) / len(confidences) if confidences else 0.0
    requires_review = (
        overall < settings.high_confidence_threshold or len(failed) > 0
    )

    # Disagreement detection: variance in confidence > threshold
    if len(confidences) >= 2:
        spread = max(confidences) - min(confidences)
        if spread > settings.disagreement_threshold:
            disagreements.append(
                Disagreement(
                    models=[o.model for o in successful],
                    topic="confidence_spread",
                    detail=f"spread={spread:.2f} threshold={settings.disagreement_threshold}",
                )
            )

    return AggregateResponse(
        study_uid=req.study_uid,
        findings=findings,
        impressions=impressions,
        recommendations=[],
        overall_confidence=overall,
        requires_human_review=requires_review,
        disagreements=disagreements,
        citations=[],
        model_versions={o.model: "v0.1" for o in successful},
    )
