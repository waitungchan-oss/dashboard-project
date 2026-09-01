#!/usr/bin/env python3
"""Run the monthly dashboard governance checks as one read-only report."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import check_month_consistency
import validate_month_schema
from check_month_metrics import check_month_metrics
from check_numeric_display_contract import (
    check_chart_series,
    check_frontend_bindings,
    check_numeric_fields,
)
from month_governance import Finding, GovernanceReport, load_metric_contract


ROOT = Path(__file__).resolve().parents[1]


def _month_from_message(message: str, fallback: str) -> str:
    for token in message.replace("/", " ").replace(":", " ").split():
        if len(token) == 6 and token.isdigit() and token.startswith("20"):
            return token
    return fallback


def _add_text_findings(
    report: GovernanceReport,
    messages: list[str],
    rule_id: str,
    severity: str,
    fallback_month: str,
) -> None:
    existing = {(finding.rule_id, finding.severity, finding.message) for finding in report.findings}
    for message in messages:
        finding = Finding(
            rule_id=rule_id,
            severity=severity,
            month=_month_from_message(message, fallback_month),
            path="$.validator",
            message=message,
            evidence={"source": "validator"},
        )
        if (finding.rule_id, finding.severity, finding.message) not in existing:
            report.add_finding(finding)
            existing.add((finding.rule_id, finding.severity, finding.message))


def _load_object(path: Path) -> dict[str, Any] | None:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return value if isinstance(value, dict) else None


def _manifest_entries(root: Path) -> list[dict[str, Any]]:
    manifest = _load_object(root / "data" / "months.json")
    if not manifest or not isinstance(manifest.get("months"), list):
        return []
    return [item for item in manifest["months"] if isinstance(item, dict)]


def _entry_data(root: Path, entry: dict[str, Any]) -> dict[str, Any] | None:
    key = entry.get("key")
    if not isinstance(key, str):
        return None
    return _load_object(root / "data" / f"{key}.json")


def _p3_data(root: Path, entry: dict[str, Any]) -> dict[str, Any] | None:
    p3 = entry.get("p3")
    if not isinstance(p3, dict) or p3.get("status") != "ready":
        return None
    path = p3.get("path")
    if not isinstance(path, str):
        return None
    return _load_object(root / "data" / path)


def _add_schema_report(
    report: GovernanceReport,
    schema_report: validate_month_schema.ValidationReport,
    fallback_month: str,
) -> None:
    _add_text_findings(report, schema_report.errors, "SCHEMA-001", "ERROR", fallback_month)
    _add_text_findings(report, schema_report.warnings, "SCHEMA-002", "WARN", fallback_month)


def run_governance(
    root: Path,
    month: str | None = None,
    all_months: bool = False,
    candidate: Path | None = None,
    schema_profile: str = "current",
) -> GovernanceReport:
    """Run schema, month, metric and numeric/display checks without mutation."""

    root = root.resolve()
    report = GovernanceReport(
        checks={
            "schema": "pass",
            "monthConsistency": "pass",
            "metricContracts": "pass",
            "numericDisplayContracts": "pass",
        }
    )
    if month is not None and all_months:
        report.add_finding(
            Finding("CLI-001", "ERROR", "unknown", "$.selection", "provide a month or --all, not both", {})
        )
        return report
    if candidate is not None and (all_months or month is None):
        report.add_finding(
            Finding("CLI-001", "ERROR", month or "unknown", "$.selection", "--candidate requires --month and cannot use --all", {})
        )
        return report
    if candidate is None and month is None and not all_months:
        report.add_finding(
            Finding("CLI-001", "ERROR", "unknown", "$.selection", "provide a month or use --all", {})
        )
        return report

    contract_path = root / "data" / "schema" / "monthly-metric-contract.json"
    try:
        contract = load_metric_contract(contract_path)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        report.add_finding(
            Finding("SCHEMA-003", "ERROR", month or "unknown", "$.contract", f"cannot load metric contract: {exc}", {})
        )
        return report

    selected: list[tuple[str, dict[str, Any], dict[str, Any] | None, str]] = []
    if candidate is not None:
        assert month is not None
        schema_report = validate_month_schema.validate_candidate(
            root, candidate.resolve(), month, schema_profile
        )
        _add_schema_report(report, schema_report, month)
        data = _load_object(candidate.resolve())
        if data is None:
            report.add_finding(
                Finding("SCHEMA-004", "ERROR", month, "$.candidate", "candidate is not a JSON object", {})
            )
        else:
            selected.append((month, {"key": month, "schema": schema_profile}, data, "candidate"))
    else:
        schema_report = validate_month_schema.ValidationReport()
        common_schema = validate_month_schema.load_schema(
            root / "data" / "schema", "common-month.schema.json", schema_report
        )
        _, entries = validate_month_schema.validate_manifest(root, schema_report)
        if month is not None:
            entries = [entry for entry in entries if entry.get("key") == month]
            if not entries:
                schema_report.error(f"month {month} is not listed in data/months.json")
        for entry in entries:
            validate_month_schema.validate_month(root, entry, common_schema, schema_report)
            key = entry.get("key")
            data = _entry_data(root, entry)
            if isinstance(key, str):
                selected.append((key, entry, data, "manifest"))
        _add_schema_report(report, schema_report, month or "manifest")

    report.checked_months = [key for key, _entry, data, _source in selected if data is not None]
    app_path = root / "app.js"
    try:
        app_source = app_path.read_text(encoding="utf-8")
    except OSError as exc:
        app_source = ""
        report.add_finding(
            Finding("DISPLAY-003", "ERROR", month or "unknown", "$.app.js", f"cannot read app.js: {exc}", {})
        )

    for key, entry, data, source_label in selected:
        if data is None:
            report.add_finding(
                Finding("SCHEMA-005", "ERROR", key, f"$.data.{key}", "monthly JSON is unavailable", {})
            )
            continue
        consistency = check_month_consistency.check_month_data(data, key, source_label)
        for finding in consistency.findings:
            report.add_finding(finding)
        _add_text_findings(report, consistency.errors, "MONTH-002", "ERROR", key)
        _add_text_findings(report, consistency.warnings, "MONTH-003", "WARN", key)

        p3_data = _p3_data(root, entry) if source_label == "manifest" else None
        for finding in check_month_metrics(data, key, contract, source_label, p3_data=p3_data):
            report.add_finding(finding)
        for finding in check_numeric_fields(data, key, contract):
            report.add_finding(finding)
        for finding in check_chart_series(data, key, contract):
            report.add_finding(finding)
        for finding in check_frontend_bindings(app_source, contract, key):
            report.add_finding(finding)

    report.finalize_checks()
    return report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run read-only monthly dashboard governance checks.")
    parser.add_argument("month", nargs="?", help="single YYYYMM month")
    parser.add_argument("--month", dest="month_option", help="single YYYYMM month")
    parser.add_argument("--all", action="store_true", help="check all manifest months")
    parser.add_argument("--candidate", type=Path, help="check an unregistered JSON candidate")
    parser.add_argument("--schema-profile", choices=["current", "legacy"], default="current")
    parser.add_argument("--strict", "--strict-warnings", dest="strict", action="store_true", help="fail on warnings")
    parser.add_argument("--report", type=Path, help="write the JSON governance report")
    parser.add_argument("--json", action="store_true", help="print the JSON governance report")
    parser.add_argument("--root", type=Path, default=ROOT, help=argparse.SUPPRESS)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    month = args.month_option or args.month
    if args.month_option and args.month:
        print("ERROR: provide a positional month or --month, not both", file=sys.stderr)
        return 2
    if args.all and (month or args.candidate):
        print("ERROR: --all cannot be combined with a month or --candidate", file=sys.stderr)
        return 2
    if args.candidate and not month:
        print("ERROR: --candidate requires --month", file=sys.stderr)
        return 2
    if not args.all and not month:
        print("ERROR: provide a month or use --all", file=sys.stderr)
        return 2

    report = run_governance(
        args.root,
        month=month,
        all_months=args.all,
        candidate=args.candidate,
        schema_profile=args.schema_profile,
    )
    payload = report.to_dict()
    if args.report:
        args.report.resolve().parent.mkdir(parents=True, exist_ok=True)
        args.report.resolve().write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print(f"Monthly governance: {payload['status'].upper()}")
        print(f"Months checked: {', '.join(payload['checkedMonths']) or '(none)'}")
        print(f"Checks: {payload['checks']}")
        for finding in report.findings:
            print(f"{finding.severity}: {finding.rule_id} {finding.month} {finding.path} {finding.message}")
    if report.errors or (args.strict and report.warnings):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
