#!/usr/bin/env python3
"""Validate numeric fields, chart series and frontend data bindings."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from month_governance import Finding, load_metric_contract, resolve_json_path


ROOT = Path(__file__).resolve().parents[1]


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _is_non_negative_integer(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def _path_exists(data: Any, path: str) -> tuple[bool, Any]:
    current = data
    for token in path.split("."):
        if isinstance(current, dict) and token in current:
            current = current[token]
            continue
        if isinstance(current, list) and token.isdigit():
            index = int(token)
            if index < len(current):
                current = current[index]
                continue
        return False, None
    return True, current


def _contract_path(item: Any) -> tuple[str | None, str]:
    if isinstance(item, str):
        return item, "ignore"
    if isinstance(item, dict):
        return item.get("path"), item.get("missingPolicy", "error")
    return None, "ignore"


def _finding(
    rule_id: str,
    severity: str,
    month: str,
    path: str,
    message: str,
    evidence: dict[str, Any],
) -> Finding:
    return Finding(rule_id, severity, month, path, message, evidence)


def check_numeric_fields(
    data: dict[str, Any],
    month: str,
    contract: dict[str, Any],
) -> list[Finding]:
    """Check numeric fields that are present in the selected monthly payload."""

    findings: list[Finding] = []
    for item in contract.get("numericFields", []):
        path, missing_policy = _contract_path(item)
        if not isinstance(path, str):
            continue
        exists, value = _path_exists(data, path)
        if not exists:
            if missing_policy == "warn":
                findings.append(
                    _finding(
                        "NUMERIC-000",
                        "WARN",
                        month,
                        f"$.{path}",
                        "contract numeric field is unavailable in this month",
                        {"missingPolicy": missing_policy},
                    )
                )
            continue
        display_path = f"$.{path}"
        if value is None or (isinstance(value, str) and not value.strip()):
            findings.append(
                _finding(
                    "DISPLAY-001",
                    "ERROR",
                    month,
                    display_path,
                    "numeric field is present but blank",
                    {"value": value},
                )
            )
            continue
        if not _is_number(value):
            findings.append(
                _finding(
                    "NUMERIC-001",
                    "ERROR",
                    month,
                    display_path,
                    "numeric field has an invalid type",
                    {"value": value, "type": type(value).__name__},
                )
            )
            continue
        segments = [segment.lower() for segment in path.split(".")]
        is_count_field = any(
            segment in {"count", "total", "n"}
            or segment.endswith("count")
            or segment.endswith("total")
            for segment in segments
        )
        if is_count_field and not _is_non_negative_integer(value):
            findings.append(
                _finding(
                    "NUMERIC-002",
                    "ERROR",
                    month,
                    display_path,
                    "count or total must be a non-negative integer",
                    {"value": value},
                )
            )
    return findings


def _resolve_many(data: Any, path: str, prefix: str = "") -> list[tuple[str, Any]]:
    tokens = path.split(".") if path else []
    if not tokens:
        return [(prefix.rstrip("."), data)]
    token, *rest = tokens
    if token.endswith("[]"):
        key = token[:-2]
        collection = data.get(key) if isinstance(data, dict) else None
        if not isinstance(collection, list):
            return []
        results: list[tuple[str, Any]] = []
        for index, item in enumerate(collection):
            next_prefix = f"{prefix}{key}[{index}]."
            results.extend(_resolve_many(item, ".".join(rest), next_prefix))
        return results
    if isinstance(data, dict) and token in data:
        next_prefix = f"{prefix}{token}."
        return _resolve_many(data[token], ".".join(rest), next_prefix)
    return []


def check_chart_series(
    data: dict[str, Any],
    month: str,
    contract: dict[str, Any],
) -> list[Finding]:
    findings: list[Finding] = []
    for series in contract.get("chartSeries", []):
        if not isinstance(series, dict):
            continue
        labels_path = series.get("labelsPath")
        labels = resolve_json_path(data, labels_path) if isinstance(labels_path, str) else None
        if not isinstance(labels, list):
            continue
        for data_path in series.get("dataPaths", []):
            if not isinstance(data_path, str):
                continue
            resolved = _resolve_many(data, data_path)
            if "[]" not in data_path:
                value = resolve_json_path(data, data_path)
                resolved = [(data_path, value)] if value is not None else []
            for concrete_path, values in resolved:
                display_path = f"$.{concrete_path.rstrip('.')}"
                if not isinstance(values, list) or len(values) != len(labels):
                    findings.append(
                        _finding(
                            "DISPLAY-002",
                            "ERROR",
                            month,
                            display_path,
                            "chart data length does not match labels",
                            {
                                "labels": len(labels),
                                "data": len(values) if isinstance(values, list) else None,
                            },
                        )
                    )
                    continue
                invalid = [
                    index
                    for index, value in enumerate(values)
                    if value is None or (isinstance(value, str) and not value.strip())
                ]
                if invalid:
                    findings.append(
                        _finding(
                            "DISPLAY-001",
                            "ERROR",
                            month,
                            display_path,
                            "chart data contains blank values",
                            {"indexes": invalid},
                        )
                    )
    return findings


def check_frontend_bindings(
    app_source: str,
    contract: dict[str, Any],
    month: str = "unknown",
) -> list[Finding]:
    findings: list[Finding] = []
    for binding in contract.get("frontendBindings", []):
        if not isinstance(binding, dict):
            continue
        data_path = binding.get("dataPath")
        tokens = binding.get("sourceTokens", [])
        if not isinstance(data_path, str) or not isinstance(tokens, list):
            continue
        if not any(isinstance(token, str) and token in app_source for token in tokens):
            findings.append(
                _finding(
                    "BINDING-001",
                    "ERROR",
                    month,
                    f"$.{data_path}",
                    "frontend source does not reference contract data binding",
                    {"sourceTokens": tokens},
                )
            )
    return findings


def check_sentinel_display(fixture: dict[str, Any], month: str) -> list[Finding]:
    findings: list[Finding] = []
    numeric_values = fixture.get("numericValues", {})
    rendered = fixture.get("rendered", {})
    if not isinstance(numeric_values, dict) or not isinstance(rendered, dict):
        return findings
    for path, expected in numeric_values.items():
        if not _is_number(expected) or expected <= 0:
            continue
        actual = rendered.get(path)
        if actual is None or (isinstance(actual, str) and actual.strip() in {"", "—", "-", "0"}) or actual == 0:
            findings.append(
                _finding(
                    "DISPLAY-001",
                    "ERROR",
                    month,
                    path,
                    "non-zero sentinel value was rendered as blank or zero",
                    {"declared": expected, "rendered": actual},
                )
            )
    return findings


def _manifest_months(root: Path) -> list[str]:
    manifest = json.loads((root / "data" / "months.json").read_text(encoding="utf-8"))
    return [
        item["key"]
        for item in manifest.get("months", [])
        if isinstance(item, dict) and isinstance(item.get("key"), str)
    ]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check numeric and display contracts.")
    parser.add_argument("month", nargs="?", help="single YYYYMM month")
    parser.add_argument("--all", action="store_true", help="check all manifest months")
    parser.add_argument("--strict-warnings", action="store_true", help="fail on warnings")
    parser.add_argument("--root", type=Path, default=ROOT, help=argparse.SUPPRESS)
    parser.add_argument("--sentinel", type=Path, help="optional sentinel fixture")
    args = parser.parse_args(argv)
    if args.all and args.month:
        print("ERROR: provide a month or --all, not both", file=sys.stderr)
        return 2
    if not args.all and not args.month:
        print("ERROR: provide a month or use --all", file=sys.stderr)
        return 2

    root = args.root.resolve()
    contract = load_metric_contract(root / "data" / "schema" / "monthly-metric-contract.json")
    months = _manifest_months(root) if args.all else [args.month]
    app_source = (root / "app.js").read_text(encoding="utf-8")
    total_errors = 0
    total_warnings = 0
    for month in months:
        data = json.loads((root / "data" / f"{month}.json").read_text(encoding="utf-8"))
        findings = check_numeric_fields(data, month, contract)
        findings.extend(check_chart_series(data, month, contract))
        findings.extend(check_frontend_bindings(app_source, contract, month))
        errors = [finding for finding in findings if finding.severity == "ERROR"]
        warnings = [finding for finding in findings if finding.severity == "WARN"]
        total_errors += len(errors)
        total_warnings += len(warnings)
        print(f"Numeric/display check: {month}")
        for finding in findings:
            print(f"{finding.severity}: {finding.rule_id} {finding.path} {finding.message}")
        if not findings:
            print("PASS")
    if args.sentinel:
        fixture = json.loads(args.sentinel.read_text(encoding="utf-8"))
        findings = check_sentinel_display(fixture, args.month or "sentinel")
        for finding in findings:
            print(f"{finding.severity}: {finding.rule_id} {finding.path} {finding.message}")
        total_errors += sum(finding.severity == "ERROR" for finding in findings)
    if total_errors:
        return 1
    if args.strict_warnings and total_warnings:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
