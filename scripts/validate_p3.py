#!/usr/bin/env python3
"""Read-only validation for the P3 analytics data layer."""

from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


MONTH_KEY_LENGTH = 6
P3_STATUSES = {"ready", "unavailable"}
ISSUE_CATEGORIES = {"shopping", "hotel", "dining", "ground_service"}
ISSUE_PRIORITIES = {"low", "medium", "high"}
ISSUE_STATUSES = {"open", "monitoring", "resolved"}
CHAIN_STATUSES = {"complete", "partial", "unavailable"}
EPSILON = 0.0002
STAGE_SOURCE_PATHS = {
    "recommendation": ("dashboardSummary/nps/promoterCount",),
    "consent": ("dashboardSummary/promoConsent/count",),
    "member_consent_joint": (
        "memberConsentCrossData/datasets/0/data/0",
        "memberConsentCrossData/datasets/1/data/0",
    ),
    "customer_segment_repeat": ("customerSegments/回頭客 (Repeat)",),
    "store_signup": ("dashboardSummary/storeSignup/count",),
}


@dataclass
class ValidationReport:
    status: str = "pass"
    checkedMonths: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def __getitem__(self, key: str) -> Any:
        return self.to_dict()[key]

    def __iter__(self):
        return iter(self.to_dict())

    def __len__(self) -> int:
        return 4

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "checkedMonths": self.checkedMonths,
            "errors": self.errors,
            "warnings": self.warnings,
        }

    def error(self, message: str) -> None:
        self.errors.append(message)
        self.status = "fail"

    def warning(self, message: str) -> None:
        self.warnings.append(message)
        if self.status == "pass":
            self.status = "warn"


def _is_month(value: object) -> bool:
    return isinstance(value, str) and len(value) == MONTH_KEY_LENGTH and value.isdigit() and value.startswith("20")


def _load_json(path: Path, report: ValidationReport, label: str) -> Any | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        report.error(f"{label}: missing {path}")
    except (OSError, json.JSONDecodeError) as exc:
        report.error(f"{label}: cannot parse {path}: {exc}")
    return None


def _number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _integer(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def _validate_source_ref(
    ref: Any,
    expected_month: str,
    listed_months: set[str],
    report: ValidationReport,
    location: str,
) -> None:
    if not isinstance(ref, dict):
        report.error(f"{location}: source reference must be an object")
        return
    month = ref.get("month")
    if month != expected_month:
        report.error(f"{location}.month: expected {expected_month}, got {month!r}")
    if month not in listed_months:
        report.error(f"{location}.month: unlisted month {month!r}")
    if not isinstance(ref.get("path"), str) or not ref["path"]:
        report.error(f"{location}.path: required non-empty path")
    if not (isinstance(ref.get("recordKey"), str) and ref["recordKey"]):
        report.warning(f"{location}: source reference has no recordKey")


def _validate_stage_source_refs(
    stage: Any,
    expected_month: str,
    listed_months: set[str],
    report: ValidationReport,
    location: str,
) -> None:
    if not isinstance(stage, dict):
        report.error(f"{location}: stage must be an object")
        return
    refs = stage.get("sourceRefs")
    if not isinstance(refs, list) or not refs:
        report.error(f"{location}.sourceRefs: required non-empty array")
        return
    for ref_index, ref in enumerate(refs):
        _validate_source_ref(ref, expected_month, listed_months, report, f"{location}.sourceRefs[{ref_index}]")
    expected_paths = STAGE_SOURCE_PATHS.get(stage.get("key"))
    if expected_paths:
        observed_paths = {ref.get("path") for ref in refs if isinstance(ref, dict)}
        required_paths = {f"data/{expected_month}.json#/{path}" for path in expected_paths}
        missing_paths = sorted(required_paths - observed_paths)
        if missing_paths:
            report.error(f"{location}.sourceRefs: missing expected base paths {missing_paths}")


def _validate_snapshot(root: Path, month: str, snapshot: Any, listed_months: set[str], report: ValidationReport) -> None:
    location = f"p3/{month}"
    if not isinstance(snapshot, dict):
        report.error(f"{location}: snapshot must be an object")
        return
    for field_name in ("version", "period", "sampleSize", "metrics", "branchRanking", "destinationDemand", "sentiment", "customerValueChain", "sourceRefs", "calculationNotes"):
        if field_name not in snapshot:
            report.error(f"{location}.{field_name}: required")
    if snapshot.get("period") != month:
        report.error(f"{location}.period: expected {month}, got {snapshot.get('period')!r}")
    sample_size = snapshot.get("sampleSize")
    if not _integer(sample_size):
        report.error(f"{location}.sampleSize: expected non-negative integer")

    metrics = snapshot.get("metrics")
    if isinstance(metrics, dict):
        for key, metric in metrics.items():
            metric_location = f"{location}.metrics.{key}"
            if not isinstance(metric, dict):
                report.error(f"{metric_location}: metric must be an object")
                continue
            for field_name in ("value", "unit", "n", "definition"):
                if field_name not in metric:
                    report.error(f"{metric_location}.{field_name}: required")
            if metric.get("value") is not None and not _number(metric.get("value")):
                report.error(f"{metric_location}.value: expected numeric or null")
            if not _integer(metric.get("n")):
                report.error(f"{metric_location}.n: expected non-negative integer")
            if sample_size is not None and key != "overall_satisfaction" and metric.get("n") != sample_size:
                report.error(f"{metric_location}.n: expected sampleSize {sample_size}")

    branch_ranking = snapshot.get("branchRanking")
    if isinstance(branch_ranking, list):
        for index, row in enumerate(branch_ranking):
            if not isinstance(row, dict) or not isinstance(row.get("key"), str):
                report.error(f"{location}.branchRanking[{index}].key: required non-empty string")
            if isinstance(row, dict) and "score" in row and not _number(row["score"]):
                report.error(f"{location}.branchRanking[{index}].score: expected numeric")
            if isinstance(row, dict) and "n" in row and not _integer(row["n"]):
                report.error(f"{location}.branchRanking[{index}].n: expected non-negative integer")

    sentiment = snapshot.get("sentiment")
    if isinstance(sentiment, list):
        total = 0
        for index, row in enumerate(sentiment):
            item_location = f"{location}.sentiment[{index}]"
            if not isinstance(row, dict):
                report.error(f"{item_location}: expected object")
                continue
            if not _integer(row.get("count")):
                report.error(f"{item_location}.count: expected non-negative integer")
            elif not _number(row.get("rate")):
                report.error(f"{item_location}.rate: expected numeric")
            else:
                total += row["count"]
        if total:
            for index, row in enumerate(sentiment):
                if isinstance(row, dict) and _integer(row.get("count")) and _number(row.get("rate")):
                    expected = row["count"] / total
                    if abs(row["rate"] - expected) > EPSILON:
                        report.error(f"{location}.sentiment[{index}].rate: count/rate mismatch; expected {expected:.6f}")

    chain = snapshot.get("customerValueChain")
    if isinstance(chain, dict):
        status = chain.get("status")
        if status not in CHAIN_STATUSES:
            report.error(f"{location}.customerValueChain.status: invalid enum {status!r}")
        unavailable_links = chain.get("unavailableLinks", [])
        if status in {"partial", "unavailable"} and not isinstance(unavailable_links, list):
            report.error(f"{location}.customerValueChain.unavailableLinks: explicit unavailable reasons required")
        if status in {"partial", "unavailable"} and isinstance(unavailable_links, list) and not unavailable_links:
            report.error(f"{location}.customerValueChain.unavailableLinks: explicit unavailable reasons required")
        if status == "unavailable":
            report.warning(f"{location}.customerValueChain: unavailable data")
        links = chain.get("links", [])
        if isinstance(links, list):
            for index, link in enumerate(links):
                link_location = f"{location}.customerValueChain.links[{index}]"
                if not isinstance(link, dict):
                    report.error(f"{link_location}: expected object")
                    continue
                count = link.get("count")
                denominator = link.get("n")
                if not _integer(count) or not _integer(denominator):
                    report.error(f"{link_location}: count and n must be non-negative integers")
                elif count > denominator:
                    report.error(f"{link_location}: count cannot exceed n")
                for ref_index, ref in enumerate(link.get("sourceRefs", [])):
                    _validate_source_ref(ref, month, listed_months, report, f"{link_location}.sourceRefs[{ref_index}]")
        stages = chain.get("stages", [])
        if isinstance(stages, list):
            for index, stage in enumerate(stages):
                _validate_stage_source_refs(stage, month, listed_months, report, f"{location}.customerValueChain.stages[{index}]")

    refs = snapshot.get("sourceRefs")
    if isinstance(refs, list):
        for index, ref in enumerate(refs):
            _validate_source_ref(ref, month, listed_months, report, f"{location}.sourceRefs[{index}]")

    base = _load_json(root / "data" / f"{month}.json", report, f"base month {month}")
    if isinstance(base, dict) and isinstance(base.get("dashboardSummary"), dict):
        summary = base["dashboardSummary"]
        base_sample = summary.get("totalRespondents")
        if _integer(sample_size) and sample_size != base_sample:
            report.error(f"{location}.sampleSize: does not match dashboardSummary.totalRespondents {base_sample}")
        if isinstance(metrics, dict):
            expected_rates = {
                "promo_consent": summary.get("promoConsent", {}).get("count") if isinstance(summary.get("promoConsent"), dict) else None,
                "store_signup": summary.get("storeSignup", {}).get("count") if isinstance(summary.get("storeSignup"), dict) else None,
            }
            for metric_key, count in expected_rates.items():
                metric = metrics.get(metric_key)
                if not isinstance(metric, dict) or not _number(metric.get("value")) or not _integer(count) or not _integer(base_sample) or not base_sample:
                    continue
                expected = count / base_sample
                if abs(metric["value"] - expected) > EPSILON:
                    report.error(f"{location}.metrics.{metric_key}.value: count/rate mismatch; expected {expected:.6f}")
            nps_metric = metrics.get("nps")
            base_nps = summary.get("nps", {}).get("score") if isinstance(summary.get("nps"), dict) else None
            if isinstance(nps_metric, dict) and nps_metric.get("value") != base_nps:
                report.error(f"{location}.metrics.nps.value: does not match dashboardSummary.nps.score {base_nps}")


def _validate_issue_register(root: Path, listed_months: set[str], report: ValidationReport) -> None:
    payload = _load_json(root / "data" / "p3" / "issues.json", report, "issue register")
    if not isinstance(payload, dict):
        return
    issues = payload.get("issues")
    if not isinstance(issues, list):
        report.error("issue register.issues: expected array")
        return
    seen: set[str] = set()
    for index, issue in enumerate(issues):
        location = f"issues[{index}]"
        if not isinstance(issue, dict):
            report.error(f"{location}: expected object")
            continue
        issue_id = issue.get("id")
        if not isinstance(issue_id, str) or not issue_id:
            report.error(f"{location}.id: required non-empty string")
        elif issue_id in seen:
            report.error(f"{location}.id: duplicate issue id {issue_id}")
        seen.add(issue_id)
        for field_name in ("category", "priority", "status"):
            allowed = {"category": ISSUE_CATEGORIES, "priority": ISSUE_PRIORITIES, "status": ISSUE_STATUSES}[field_name]
            if issue.get(field_name) not in allowed:
                report.error(f"{location}.{field_name}: invalid enum {issue.get(field_name)!r}")
        first = issue.get("firstSeenMonth")
        last = issue.get("lastSeenMonth")
        if not _is_month(first) or not _is_month(last):
            report.error(f"{location}: firstSeenMonth and lastSeenMonth must be YYYYMM")
        elif first > last:
            report.error(f"{location}: reverse observation window")
        for collection_name in ("trackingMetrics", "monthlySnapshots"):
            collection = issue.get(collection_name, [])
            if not isinstance(collection, list):
                report.error(f"{location}.{collection_name}: expected array")
                continue
            for item_index, item in enumerate(collection):
                if not isinstance(item, dict):
                    report.error(f"{location}.{collection_name}[{item_index}]: expected object")
                    continue
                period = item.get("period")
                if period not in listed_months:
                    report.error(f"{location}.{collection_name}[{item_index}].period: unlisted month {period!r}")
        for ref_index, ref in enumerate(issue.get("sourceRefs", [])):
            if not isinstance(ref, dict) or ref.get("month") not in listed_months:
                report.error(f"{location}.sourceRefs[{ref_index}].month: unlisted month")
            if not isinstance(ref, dict) or not isinstance(ref.get("path"), str) or not ref["path"]:
                report.error(f"{location}.sourceRefs[{ref_index}].path: required non-empty path")


def validate_p3(root: Path, selected_months: list[str] | None) -> ValidationReport:
    """Validate P3 artifacts without writing to the repository."""
    root = Path(root)
    report = ValidationReport()
    manifest = _load_json(root / "data" / "months.json", report, "manifest")
    if not isinstance(manifest, dict):
        return report
    months = manifest.get("months")
    if not isinstance(months, list):
        report.error("manifest.months: expected array")
        return report
    listed_months: list[str] = []
    entries: dict[str, dict[str, Any]] = {}
    for index, entry in enumerate(months):
        if not isinstance(entry, dict) or not _is_month(entry.get("key")):
            report.error(f"manifest.months[{index}].key: expected YYYYMM")
            continue
        key = entry["key"]
        if key in entries:
            report.error(f"manifest.months[{index}].key: duplicate month {key}")
        listed_months.append(key)
        entries[key] = entry
        p3 = entry.get("p3")
        if not isinstance(p3, dict):
            report.error(f"manifest.{key}.p3: required")
            continue
        if p3.get("status") not in P3_STATUSES:
            report.error(f"manifest.{key}.p3.status: invalid enum {p3.get('status')!r}")
        path_value = p3.get("path")
        if not isinstance(path_value, str) or not path_value:
            report.error(f"manifest.{key}.p3.path: required non-empty path")
            continue
        snapshot_path = root / "data" / path_value
        try:
            snapshot_path.resolve().relative_to((root / "data").resolve())
        except ValueError:
            report.error(f"manifest.{key}.p3.path: path escapes data directory")
            continue
        if p3.get("status") == "ready" and not snapshot_path.is_file():
            report.error(f"manifest.{key}.p3.path: missing {path_value}")

    all_months = set(listed_months)
    _validate_issue_register(root, all_months, report)
    selected = listed_months if selected_months is None else selected_months
    for month in selected:
        if month not in entries:
            report.error(f"selected month is not listed: {month}")
            continue
        report.checkedMonths.append(month)
        p3 = entries[month].get("p3", {})
        if p3.get("status") != "ready":
            report.warning(f"manifest.{month}.p3: unavailable")
            continue
        snapshot = _load_json(root / "data" / p3["path"], report, f"p3/{month}")
        if snapshot is not None:
            _validate_snapshot(root, month, snapshot, all_months, report)
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate the P3 analytics data layer.")
    parser.add_argument("months", nargs="*", help="specific YYYYMM month keys")
    parser.add_argument("--all", action="store_true", help="validate every manifest month")
    parser.add_argument("--strict-warnings", action="store_true", help="return non-zero when warnings exist")
    parser.add_argument("--json", action="store_true", help="emit exact machine-readable JSON fields")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1], help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.all and args.months:
        parser.error("use --all or explicit months, not both")
    if not args.all and not args.months:
        parser.error("use --all or explicit months")
    selected = None if args.all else args.months
    report = validate_p3(args.root, selected)
    failed = bool(report.errors or (args.strict_warnings and report.warnings))
    if failed:
        report.status = "fail"
    payload = report.to_dict()
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print(json.dumps(payload, ensure_ascii=False))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
