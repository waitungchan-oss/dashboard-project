#!/usr/bin/env python3
"""Validate manifest-driven dashboard month data against evolvable schemas."""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR_NAME = "data"
SCHEMA_DIR_NAME = "schema"
MONTH_KEY_RE = re.compile(r"^20\d{4}$")
FORBIDDEN_TOKENS = ("function", "formatter", "onClick", "=>")


@dataclass
class ValidationReport:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    checked_months: list[str] = field(default_factory=list)

    def error(self, message: str) -> None:
        self.errors.append(message)

    def warning(self, message: str) -> None:
        self.warnings.append(message)


def project_paths(root: Path) -> tuple[Path, Path]:
    data_dir = root / DATA_DIR_NAME
    return data_dir, data_dir / SCHEMA_DIR_NAME


def load_json(path: Path, report: ValidationReport, label: str) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        report.error(f"{label} is missing: {path}")
    except json.JSONDecodeError as exc:
        report.error(f"{label} cannot be parsed as JSON: line {exc.lineno} column {exc.colno}: {exc.msg}")
    except OSError as exc:
        report.error(f"{label} cannot be read: {exc}")
    return None


def resolve_json_type(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int):
        return "integer"
    if isinstance(value, float):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    return "unknown"


def matches_type(value: Any, expected: str) -> bool:
    actual = resolve_json_type(value)
    if expected == "number":
        return actual in {"integer", "number"}
    return actual == expected


def validate_value(value: Any, schema: dict[str, Any], path: str, report: ValidationReport) -> None:
    any_of = schema.get("anyOf")
    if isinstance(any_of, list) and any_of:
        branch_reports: list[ValidationReport] = []
        for branch in any_of:
            if not isinstance(branch, dict):
                continue
            branch_report = ValidationReport()
            validate_value(value, branch, path, branch_report)
            if not branch_report.errors:
                break
            branch_reports.append(branch_report)
        else:
            expected = [branch.get("type", "value") for branch in any_of if isinstance(branch, dict)]
            report.error(f"{path} must match one of {expected}, got {resolve_json_type(value)}")
        return

    expected_type = schema.get("type")
    if isinstance(expected_type, str) and not matches_type(value, expected_type):
        report.error(f"{path} must be {expected_type}, got {resolve_json_type(value)}")
        return

    enum = schema.get("enum")
    if isinstance(enum, list) and value not in enum:
        report.error(f"{path} must be one of {enum!r}, got {value!r}")

    if isinstance(value, str):
        min_length = schema.get("minLength")
        if isinstance(min_length, int) and len(value) < min_length:
            report.error(f"{path} must contain at least {min_length} characters")
        pattern = schema.get("pattern")
        if isinstance(pattern, str) and re.fullmatch(pattern, value) is None:
            report.error(f"{path} does not match pattern {pattern!r}: {value!r}")

    if isinstance(value, dict):
        required = schema.get("required", [])
        if isinstance(required, list):
            for key in required:
                if isinstance(key, str) and key not in value:
                    report.error(f"{path}.{key} is required")
        properties = schema.get("properties", {})
        if isinstance(properties, dict):
            for key, child_schema in properties.items():
                if key in value and isinstance(child_schema, dict):
                    validate_value(value[key], child_schema, f"{path}.{key}", report)

    if isinstance(value, list):
        item_schema = schema.get("items")
        if isinstance(item_schema, dict):
            for index, item in enumerate(value):
                validate_value(item, item_schema, f"{path}[{index}]", report)


def check_forbidden_tokens(path: Path, report: ValidationReport, label: str) -> None:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        report.error(f"{label} cannot be read for purity check: {exc}")
        return
    for token in FORBIDDEN_TOKENS:
        if token in text:
            report.error(f"{label} contains forbidden runtime token: {token}")


def load_schema(schema_dir: Path, filename: str, report: ValidationReport) -> dict[str, Any]:
    value = load_json(schema_dir / filename, report, f"schema/{filename}")
    if not isinstance(value, dict):
        report.error(f"schema/{filename} must be a JSON object")
        return {}
    return value


def validate_manifest(root: Path, report: ValidationReport) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    data_dir, schema_dir = project_paths(root)
    manifest_path = data_dir / "months.json"
    manifest = load_json(manifest_path, report, "data/months.json")
    manifest_schema = load_schema(schema_dir, "manifest.schema.json", report)
    if isinstance(manifest, dict):
        validate_value(manifest, manifest_schema, "data/months.json", report)
    else:
        report.error("data/months.json must be a JSON object")
        return {}, []

    entries = manifest.get("months")
    if not isinstance(entries, list):
        return manifest, []
    seen: set[str] = set()
    valid_entries: list[dict[str, Any]] = []
    for index, entry in enumerate(entries):
        if not isinstance(entry, dict):
            continue
        key = entry.get("key")
        if not isinstance(key, str) or not MONTH_KEY_RE.fullmatch(key):
            continue
        if key in seen:
            report.error(f"data/months.json months[{index}].key is duplicated: {key}")
            continue
        seen.add(key)
        valid_entries.append(entry)
        if not (data_dir / f"{key}.json").exists():
            report.error(f"manifest month {key} points to missing data/{key}.json")
    default_month = manifest.get("defaultMonth")
    if isinstance(default_month, str) and default_month not in seen:
        report.error(f"defaultMonth {default_month} is not listed in data/months.json")
    return manifest, valid_entries


def schema_for_entry(entry: dict[str, Any], schema_dir: Path, report: ValidationReport) -> tuple[dict[str, Any], str]:
    profile = entry.get("schema")
    if profile not in {"current", "legacy"}:
        report.error(f"{entry.get('key', '(unknown)')}: schema profile must be current or legacy")
        return {}, str(profile)
    return load_schema(schema_dir, f"{profile}-month.schema.json", report), str(profile)


def validate_month(
    root: Path,
    entry: dict[str, Any],
    common_schema: dict[str, Any],
    report: ValidationReport,
    month_path: Path | None = None,
) -> None:
    key = entry["key"]
    data_dir, schema_dir = project_paths(root)
    resolved_month_path = month_path or data_dir / f"{key}.json"
    label = f"data/{key}.json" if month_path is None else str(resolved_month_path)
    month_data = load_json(resolved_month_path, report, label)
    if not isinstance(month_data, dict):
        report.error(f"{key}: root value must be a JSON object")
        return
    report.checked_months.append(key)
    check_forbidden_tokens(resolved_month_path, report, label)
    profile_schema, profile = schema_for_entry(entry, schema_dir, report)
    validate_value(month_data, common_schema, f"data/{key}.json", report)
    validate_value(month_data, profile_schema, f"data/{key}.json", report)

    optional = profile_schema.get("x-optional", [])
    if profile == "legacy" and isinstance(optional, list):
        for field_name in optional:
            if isinstance(field_name, str) and field_name not in month_data:
                report.warning(f"{key}: legacy optional field is absent: {field_name}")


def validate_candidate(
    root: Path,
    candidate_path: Path,
    month: str,
    schema_profile: str,
    report: ValidationReport | None = None,
) -> ValidationReport:
    result = report or ValidationReport()
    if not MONTH_KEY_RE.fullmatch(month):
        result.error(f"month must be YYYYMM: {month!r}")
        return result
    if schema_profile not in {"current", "legacy"}:
        result.error(f"schema profile must be current or legacy: {schema_profile!r}")
        return result
    _, schema_dir = project_paths(root)
    common_schema = load_schema(schema_dir, "common-month.schema.json", result)
    if not candidate_path.is_file():
        result.error(f"candidate file does not exist: {candidate_path}")
        return result
    validate_month(
        root,
        {"key": month, "schema": schema_profile},
        common_schema,
        result,
        month_path=candidate_path,
    )
    return result


def select_entries(entries: list[dict[str, Any]], month: str | None, check_all: bool, report: ValidationReport) -> list[dict[str, Any]]:
    if month is not None and check_all:
        report.error("provide a month or --all, not both")
        return []
    if month is None or check_all:
        return entries
    if not MONTH_KEY_RE.fullmatch(month):
        report.error(f"month must be YYYYMM: {month!r}")
        return []
    selected = [entry for entry in entries if entry.get("key") == month]
    if not selected:
        report.error(f"month {month} is not listed in data/months.json")
    return selected


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Validate manifest-driven dashboard month schemas.")
    parser.add_argument("month", nargs="?", help="single YYYYMM month to validate")
    parser.add_argument("--month", dest="month_option", help="single YYYYMM month to validate")
    parser.add_argument("--all", action="store_true", help="validate all months listed in data/months.json")
    parser.add_argument("--strict-warnings", action="store_true", help="return failure when warnings exist")
    parser.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    parser.add_argument("--candidate", type=Path, help="validate a JSON candidate before manifest registration")
    parser.add_argument(
        "--schema-profile",
        choices=["current", "legacy"],
        default="current",
        help="schema profile for --candidate (default: current)",
    )
    parser.add_argument("--root", type=Path, default=ROOT, help=argparse.SUPPRESS)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    report = ValidationReport()
    month = args.month_option or args.month
    if args.month_option and args.month:
        report.error("provide a positional month or --month, not both")

    root = args.root.resolve()
    data_dir, schema_dir = project_paths(root)
    common_schema = load_schema(schema_dir, "common-month.schema.json", report)
    _, entries = validate_manifest(root, report)
    if args.candidate is not None:
        if args.all:
            report.error("provide --candidate with --month, not --all")
        elif month is None:
            report.error("--candidate requires --month")
        else:
            validate_candidate(root, args.candidate.resolve(), month, args.schema_profile, report)
    else:
        selected = select_entries(entries, month, args.all, report)
        for entry in selected:
            validate_month(root, entry, common_schema, report)

    status = "fail" if report.errors or (args.strict_warnings and report.warnings) else ("warn" if report.warnings else "pass")
    payload = {
        "status": status,
        "checkedMonths": report.checked_months,
        "errors": report.errors,
        "warnings": report.warnings,
    }
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print(f"Month schema validation: {status.upper()}")
        print(f"Months checked: {', '.join(report.checked_months) or '(none)'}")
        for warning in report.warnings:
            print(f"WARNING: {warning}")
        for error in report.errors:
            print(f"ERROR: {error}")
    return 1 if status == "fail" else 0


if __name__ == "__main__":
    sys.exit(main())
