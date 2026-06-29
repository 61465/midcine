from dataclasses import dataclass
from pathlib import Path

import yaml


@dataclass(frozen=True)
class RoutingRule:
    match: dict[str, str]
    models: list[str]


def load_rules(path: str) -> list[RoutingRule]:
    """Load dispatch rules from YAML. Empty list if file missing (logged at boot)."""
    p = Path(path)
    if not p.exists():
        return []
    data = yaml.safe_load(p.read_text(encoding="utf-8")) or []
    return [RoutingRule(match=r["match"], models=r["models"]) for r in data]


def pick_models(rules: list[RoutingRule], study_meta: dict[str, str]) -> list[str]:
    """Return the union of models from all matching rules."""
    chosen: list[str] = []
    for rule in rules:
        if all(study_meta.get(k) == v for k, v in rule.match.items()):
            for m in rule.models:
                if m not in chosen:
                    chosen.append(m)
    return chosen
