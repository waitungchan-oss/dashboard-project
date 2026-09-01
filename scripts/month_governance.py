#!/usr/bin/env python3
"""Shared read-only models and helpers for monthly data governance checks."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Mapping


SEVERITIES = {"ERROR", "WARN", "INFO"}
_PATH_TOKEN_RE = re.compile(r"([^\.\[\]]+)|\[(\d+)\]")


@dataclass(frozen=True)
class Finding:
    rule_id: str
    severity: str
    month: str
    path: str
    message: str
    evidence: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.severity not in SEVERITIES:
            raise ValueError(f"unsupported governance severity: {self.severity}")

    def to_dict(self) -> dict[str, Any]:
        return {
            "ruleId": self.rule_id,
            "severity": self.severity,
            "month": self.month,
            "path": self.path,
            "message": self.message,
            "evidence": self.evidence,
        }


@dataclass
class GovernanceReport:
    checked_months: list[str] = field(default_factory=list)
    checks: dict[str, str] = field(default_factory=dict)
    findings: list[Finding] = field(default_factory=list)

    def add_finding(self, finding: Finding) -> None:
        self.findings.append(finding)

    @property
    def errors(self) -> list[Finding]:
        return [finding for finding in self.findings if finding.severity == "ERROR"]

    @property
    def warnings(self) -> list[Finding]:
        return [finding for finding in self.findings if finding.severity == "WARN"]

    @property
    def status(self) -> str:
        return "fail" if self.errors else "warn" if self.warnings else "pass"

    def finalize_checks(self) -> None:
        for check_name in self.checks:
            prefix = {
                "schema": "SCHEMA-",
                "monthConsistency": "MONTH-",
                "metricContracts": "METRIC-",
                "numericDisplayContracts": "DISPLAY-",
            }.get(check_name)
            if prefix is None:
                continue
            scoped = [finding for finding in self.findings if finding.rule_id.startswith(prefix)]
            self.checks[check_name] = "fail" if any(
                finding.severity == "ERROR" for finding in scoped
            ) else "warn" if any(finding.severity == "WARN" for finding in scoped) else "pass"

    def to_dict(self) -> dict[str, Any]:
        self.finalize_checks()
        return {
            "version": "1.0",
            "status": self.status,
            "checkedMonths": self.checked_months,
            "checks": self.checks,
            "errors": [finding.to_dict() for finding in self.errors],
            "warnings": [finding.to_dict() for finding in self.warnings],
            "evidence": [
                finding.to_dict()
                for finding in self.findings
                if finding.severity == "INFO"
            ],
        }


def resolve_json_path(data: Any, path: str) -> Any:
    """Resolve dotted paths with optional list indexes; return None when absent."""

    current = data
    for match in _PATH_TOKEN_RE.finditer(path):
        key, index = match.groups()
        try:
            if key is not None:
                if not isinstance(current, Mapping) or key not in current:
                    return None
                current = current[key]
            else:
                if not isinstance(current, list):
                    return None
                current = current[int(index)]
        except (IndexError, KeyError, TypeError, ValueError):
            return None
    return current


def parse_percentage(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        text = value.strip().replace("%", "")
        if not text:
            return None
        try:
            return float(text)
        except ValueError:
            return None
    return None


def load_metric_contract(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("monthly metric contract must be a JSON object")
    metrics = payload.get("metrics")
    if not isinstance(metrics, list) or not all(isinstance(item, dict) for item in metrics):
        raise ValueError("monthly metric contract metrics must be an array of objects")
    return payload
