"""Load dispatch_rules.yaml and match study metadata → agent list."""

from __future__ import annotations

from pathlib import Path

import yaml

from .schemas import StudyMetadata


class Dispatcher:
    def __init__(self, rules_path: Path):
        self.rules_path = rules_path
        self._rules: list[dict] = []
        self.reload()

    def reload(self) -> None:
        with self.rules_path.open("r", encoding="utf-8") as f:
            self._rules = yaml.safe_load(f) or []

    def match(self, study: StudyMetadata) -> tuple[list[str], dict[str, str] | None]:
        """Return (agent_list, matched_rule) — first matching rule wins."""
        for rule in self._rules:
            criteria: dict = rule.get("match", {})
            if not criteria:
                # empty match = fallback (only used if no other match)
                continue
            ok = True
            for key, want in criteria.items():
                if str(getattr(study, key, "")).upper() != str(want).upper():
                    ok = False
                    break
            if ok:
                return list(rule.get("agents", [])), criteria

        # Fallback rule (match: {})
        for rule in self._rules:
            if not rule.get("match"):
                return list(rule.get("agents", [])), None

        return [], None
