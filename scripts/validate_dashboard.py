#!/usr/bin/env python3
"""Validate dashboard month manifest and monthly JSON data."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
MANIFEST_PATH = DATA_DIR / "months.json"
FORBIDDEN_TOKENS = ("function", "formatter", "onClick", "=>")
MONTH_KEY_RE = re.compile(r"^20\d{4}$")
VALID_FEEDBACK_TYPES = {"positive", "suggestion", "negative"}

CURRENT_REQUIRED_KEYS = {
    "genderData",
    "ageData",
    "memberConsentCrossData",
    "satisfactionDistributionData",
    "destAgeCrossData",
    "satisfactionCrossData",
    "branchLeaderboardData",
    "branchRawFeedbacks",
    "salesData",
    "customerSegments",
    "sourceData",
    "channelData",
    "rawFeedbacks",
    "uniqueTours",
    "leadersRaw",
    "futureDestData",
    "npsDistData",
    "npsScoreData",
    "npsCorrelationData",
    "topDestData",
    "durationDistData",
    "dashboardSummary",
    "dashboardTextLabels",
    "dashboardInsights",
    "futureTrendInsights",
    "opinionMiningInsights",
    "recordsSummary",
    "recordsInsights",
    "feedbackKeywordCloud",
}

LEGACY_REQUIRED_KEYS = {
    "satisfactionCrossData",
    "branchLeaderboardData",
    "branchRawFeedbacks",
    "sourceData",
    "channelData",
    "rawFeedbacks",
    "uniqueTours",
    "leadersRaw",
    "futureDestData",
    "npsDistData",
    "npsScoreData",
    "topDestData",
    "durationDistData",
    "dashboardSummary",
    "dashboardTextLabels",
    "dashboardInsights",
    "recordsSummary",
    "recordsInsights",
}


class ValidationReport:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def error(self, message: str) -> None:
        self.errors.append(message)

    def warn(self, message: str) -> None:
        self.warnings.append(message)

    def print(self) -> None:
        for warning in self.warnings:
            print(f"WARNING: {warning}")
        for error in self.errors:
            print(f"ERROR: {error}")
        if not self.errors:
            print("Dashboard data validation passed.")


def load_json(path: Path, report: ValidationReport) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001 - CLI should show the original parse failure.
        report.error(f"{path.relative_to(ROOT)} cannot be parsed as JSON: {exc}")
        return None


def check_forbidden_tokens(path: Path, report: ValidationReport) -> None:
    text = path.read_text(encoding="utf-8", errors="replace")
    for token in FORBIDDEN_TOKENS:
        if token in text:
            report.error(f"{path.relative_to(ROOT)} contains forbidden token: {token}")


def require_dict(value: Any, name: str, report: ValidationReport) -> dict[str, Any]:
    if not isinstance(value, dict):
        report.error(f"{name} must be an object")
        return {}
    return value


def require_list(value: Any, name: str, report: ValidationReport) -> list[Any]:
    if not isinstance(value, list):
        report.error(f"{name} must be an array")
        return []
    return value


def is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def validate_manifest(report: ValidationReport) -> dict[str, Any]:
    if not MANIFEST_PATH.exists():
        report.error("data/months.json is missing")
        return {}

    check_forbidden_tokens(MANIFEST_PATH, report)
    manifest = require_dict(load_json(MANIFEST_PATH, report), "data/months.json", report)
    default_month = manifest.get("defaultMonth")
    months = require_list(manifest.get("months"), "data/months.json months", report)

    if not isinstance(default_month, str) or not MONTH_KEY_RE.match(default_month):
        report.error("data/months.json defaultMonth must be YYYYMM")

    seen: set[str] = set()
    valid_months: set[str] = set()
    for index, item in enumerate(months):
        if not isinstance(item, dict):
            report.error(f"data/months.json months[{index}] must be an object")
            continue
        key = item.get("key")
        label = item.get("label")
        schema = item.get("schema")
        if not isinstance(key, str) or not MONTH_KEY_RE.match(key):
            report.error(f"data/months.json months[{index}].key must be YYYYMM")
            continue
        if key in seen:
            report.error(f"data/months.json has duplicated month key: {key}")
        seen.add(key)
        valid_months.add(key)
        if not isinstance(label, str) or not label.strip():
            report.error(f"data/months.json months[{index}].label is required")
        if schema not in {"current", "legacy"}:
            report.error(f"data/months.json months[{index}].schema must be current or legacy")
        month_file = DATA_DIR / f"{key}.json"
        if not month_file.exists():
            report.error(f"manifest month {key} points to missing data/{key}.json")

    if isinstance(default_month, str) and valid_months and default_month not in valid_months:
        report.error(f"defaultMonth {default_month} is not listed in months")

    return manifest


def validate_chart_shape(data: dict[str, Any], key: str, report: ValidationReport, month: str) -> None:
    value = data.get(key)
    if not isinstance(value, dict):
        report.error(f"{month}: {key} must be an object")
        return
    labels = value.get("labels")
    if "values" in value:
        values = value.get("values")
        if not isinstance(labels, list) or not isinstance(values, list):
            report.error(f"{month}: {key} must contain labels and values arrays")
        elif len(labels) != len(values):
            report.error(f"{month}: {key} labels and values length mismatch")


def validate_month_data(month_item: dict[str, Any], report: ValidationReport) -> None:
    key = month_item["key"]
    schema = month_item.get("schema", "current")
    path = DATA_DIR / f"{key}.json"
    check_forbidden_tokens(path, report)
    data = require_dict(load_json(path, report), f"data/{key}.json", report)
    if not data:
        return

    required = CURRENT_REQUIRED_KEYS if schema == "current" else LEGACY_REQUIRED_KEYS
    missing = sorted(required - set(data))
    if missing and schema == "current":
        report.error(f"{key}: missing current schema keys: {', '.join(missing)}")
    elif missing:
        report.warn(f"{key}: legacy month missing optional keys: {', '.join(missing)}")

    for chart_key in ("topDestData", "durationDistData", "sourceData", "channelData"):
        if chart_key in data:
            validate_chart_shape(data, chart_key, report, key)

    feedbacks = data.get("rawFeedbacks")
    if isinstance(feedbacks, list):
        for index, item in enumerate(feedbacks):
            if not isinstance(item, dict):
                report.error(f"{key}: rawFeedbacks[{index}] must be an object")
                continue
            item_type = item.get("type")
            if item_type not in VALID_FEEDBACK_TYPES:
                report.error(f"{key}: rawFeedbacks[{index}].type is invalid: {item_type!r}")

    tours = data.get("uniqueTours")
    if isinstance(tours, list):
        for index, item in enumerate(tours):
            if not isinstance(item, dict):
                report.error(f"{key}: uniqueTours[{index}] must be an object")
                continue
            days = item.get("days")
            if days is not None and (not is_number(days) or days < 1 or days > 30):
                report.error(f"{key}: uniqueTours[{index}].days must be 1-30 or null")

    leaders = data.get("leadersRaw")
    if isinstance(leaders, list):
        for index, item in enumerate(leaders):
            if not isinstance(item, dict):
                report.error(f"{key}: leadersRaw[{index}] must be an object")
                continue
            if not is_number(item.get("score")):
                report.error(f"{key}: leadersRaw[{index}].score must be numeric")
            if not isinstance(item.get("n"), int) or item.get("n") < 0:
                report.error(f"{key}: leadersRaw[{index}].n must be a non-negative integer")

    branches = data.get("branchLeaderboardData")
    if isinstance(branches, list):
        for index, item in enumerate(branches):
            if not isinstance(item, dict):
                report.error(f"{key}: branchLeaderboardData[{index}] must be an object")
                continue
            if not is_number(item.get("score")):
                report.error(f"{key}: branchLeaderboardData[{index}].score must be numeric")
            if not isinstance(item.get("n"), int) or item.get("n") < 0:
                report.error(f"{key}: branchLeaderboardData[{index}].n must be a non-negative integer")


def main() -> int:
    report = ValidationReport()
    manifest = validate_manifest(report)
    months = manifest.get("months") if isinstance(manifest, dict) else []
    if isinstance(months, list):
        for item in months:
            if isinstance(item, dict) and isinstance(item.get("key"), str) and (DATA_DIR / f"{item['key']}.json").exists():
                validate_month_data(item, report)

    report.print()
    return 1 if report.errors else 0


if __name__ == "__main__":
    sys.exit(main())
