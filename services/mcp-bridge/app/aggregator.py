"""Consensus + disagreement detection.
Adapted from D:\\project\\midcine\\docs\\reference\\v12-extracts\\aggregator_pattern.py.
"""

from __future__ import annotations

from .schemas import (
    AggregateRequest,
    AggregateResponse,
    Disagreement,
    Finding,
)

CONFIDENCE_HIGH_THRESHOLD = 0.75
DISAGREEMENT_SPREAD_THRESHOLD = 0.30


def aggregate(req: AggregateRequest) -> AggregateResponse:
    successful = [o for o in req.outputs if o.ok]
    failed = [o for o in req.outputs if not o.ok]

    confidences = [o.confidence for o in successful if o.confidence is not None]
    findings: list[Finding] = []
    for o in successful:
        if o.summary:
            findings.append(
                Finding(
                    text=o.summary,
                    confidence=o.confidence or 0.0,
                    agents=[o.agent],
                )
            )

    overall = (sum(confidences) / len(confidences)) if confidences else 0.0
    requires_review = overall < CONFIDENCE_HIGH_THRESHOLD or bool(failed)

    disagreements: list[Disagreement] = []
    if len(confidences) >= 2:
        spread = max(confidences) - min(confidences)
        if spread > DISAGREEMENT_SPREAD_THRESHOLD:
            disagreements.append(
                Disagreement(
                    agents=[o.agent for o in successful],
                    topic="confidence_spread",
                    detail=f"spread={spread:.2f} (>threshold {DISAGREEMENT_SPREAD_THRESHOLD})",
                )
            )
    if failed:
        disagreements.append(
            Disagreement(
                agents=[o.agent for o in failed],
                topic="agent_failure",
                detail=f"{len(failed)} agent(s) failed — human review recommended",
            )
        )

    return AggregateResponse(
        study_uid=req.study_uid,
        findings=findings,
        disagreements=disagreements,
        overall_confidence=overall,
        requires_human_review=requires_review,
        agent_versions={o.agent: "naraya:mistral-large" for o in successful},
    )
