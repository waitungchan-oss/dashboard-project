#!/usr/bin/env python3
"""Validate monthly N, count, percentage and provenance relationships."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from month_governance import Finding, load_metric_contract, parse_percentage, resolve_json_path


ROOT = Path(__file__).resolve().parents[1]


def _is_non_negative_integer(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _percentage_tolerance(value: Any, minimum: float) -> float:
    if not isinstance(value, str):
        return minimum
    text = value.strip().replace("%", "")
    if "." not in text:
        return minimum
    decimal_places = len(text.split(".", 1)[1])
    return max(minimum, 0.5 * (10 ** -decimal_places))


def _finding(
    rule_id: str,
    severity: str,
    month: str,
    path: str,
    message: str,
    evidence: dict[str, Any],
) -> Finding:
    return Finding(rule_id, severity, month, path, message, evidence)


def _texts(data: dict[str, Any]) -> list[str]:
    feedbacks = data.get("rawFeedbacks")
    if not isinstance(feedbacks, list):
        return []
    return [
        item["content"]
        for item in feedbacks
        if isinstance(item, dict) and isinstance(item.get("content"), str)
    ]


def _check_percentage_pair(
    data: dict[str, Any],
    month: str,
    count_path: str,
    percentage_path: str,
    denominator_path: str,
    tolerance: float,
) -> list[Finding]:
    count = resolve_json_path(data, count_path)
    percentage = resolve_json_path(data, percentage_path)
    denominator = resolve_json_path(data, denominator_path)
    if count is None or percentage is None or denominator is None:
        return []
    if not _is_number(count) or not _is_number(denominator) or denominator <= 0:
        return []

    declared = parse_percentage(percentage)
    calculated = float(count) / float(denominator) * 100
    effective_tolerance = _percentage_tolerance(percentage, tolerance)
    if declared is None or abs(declared - calculated) > effective_tolerance:
        return [
            _finding(
                "METRIC-002",
                "ERROR",
                month,
                f"$.{percentage_path}",
                f"percentage does not match {count_path} / {denominator_path}",
                {
                    "declared": declared,
                    "calculated": round(calculated, 6),
                    "count": count,
                    "denominator": denominator,
                    "tolerance": effective_tolerance,
                },
            )
        ]
    return []


def _check_parallel_arrays(
    data: dict[str, Any],
    month: str,
    paths: list[str],
) -> list[Finding]:
    values = [resolve_json_path(data, path) for path in paths]
    if not all(isinstance(value, list) for value in values):
        return []
    lengths = {path: len(value) for path, value in zip(paths, values)}
    if len(set(lengths.values())) <= 1:
        return []
    return [
        _finding(
            "METRIC-003",
            "ERROR",
            month,
            f"$.{paths[0]}",
            "parallel metric arrays have different lengths",
            {"lengths": lengths},
        )
    ]


def _check_nps_distribution(data: dict[str, Any], month: str) -> list[Finding]:
    total = resolve_json_path(data, "dashboardSummary.totalRespondents")
    values = resolve_json_path(data, "npsDistData.values")
    if not _is_non_negative_integer(total) or not isinstance(values, list):
        return []
    if not all(_is_non_negative_integer(value) for value in values):
        return [
            _finding(
                "METRIC-001",
                "ERROR",
                month,
                "$.npsDistData.values",
                "NPS distribution must contain non-negative integers",
                {"values": values},
            )
        ]
    findings: list[Finding] = []
    distribution_total = sum(values)
    if distribution_total != total:
        findings.append(
            _finding(
                "METRIC-001",
                "ERROR",
                month,
                "$.npsDistData.values",
                "NPS distribution does not match survey N",
                {"declared": distribution_total, "calculated": total},
            )
        )

    promoter_count = resolve_json_path(data, "dashboardSummary.nps.promoterCount")
    detractor_count = resolve_json_path(data, "dashboardSummary.nps.detractorCount")
    if values and _is_non_negative_integer(promoter_count) and values[0] != promoter_count:
        findings.append(
            _finding(
                "METRIC-001",
                "ERROR",
                month,
                "$.dashboardSummary.nps.promoterCount",
                "promoter count does not match NPS distribution",
                {"declared": promoter_count, "calculated": values[0]},
            )
        )
    if len(values) > 1 and _is_non_negative_integer(detractor_count) and values[1] != detractor_count:
        findings.append(
            _finding(
                "METRIC-001",
                "ERROR",
                month,
                "$.dashboardSummary.nps.detractorCount",
                "detractor count does not match NPS distribution",
                {"declared": detractor_count, "calculated": values[1]},
            )
        )

    nps_pct = parse_percentage(resolve_json_path(data, "dashboardSummary.nps.npsPct"))
    if nps_pct is not None and _is_non_negative_integer(promoter_count) and _is_non_negative_integer(detractor_count):
        calculated_nps = (promoter_count - detractor_count) / total * 100 if total else 0.0
        if abs(nps_pct - calculated_nps) > 0.01:
            findings.append(
                _finding(
                    "METRIC-002",
                    "ERROR",
                    month,
                    "$.dashboardSummary.nps.npsPct",
                    "NPS percentage does not match promoter minus detractor share",
                    {
                        "declared": nps_pct,
                        "calculated": round(calculated_nps, 6),
                        "denominator": total,
                    },
                )
            )
    return findings


def _check_satisfaction_series(data: dict[str, Any], month: str) -> list[Finding]:
    labels = resolve_json_path(data, "satisfactionDistributionData.labels")
    datasets = resolve_json_path(data, "satisfactionDistributionData.datasets")
    if not isinstance(labels, list) or not isinstance(datasets, list):
        return []
    findings: list[Finding] = []
    for index, dataset in enumerate(datasets):
        values = dataset.get("data") if isinstance(dataset, dict) else None
        if not isinstance(values, list) or len(values) != len(labels):
            findings.append(
                _finding(
                    "METRIC-003",
                    "ERROR",
                    month,
                    f"$.satisfactionDistributionData.datasets[{index}].data",
                    "satisfaction dataset length does not match labels",
                    {"labels": len(labels), "data": len(values) if isinstance(values, list) else None},
                )
            )
    return findings


def _check_branch_contract(
    data: dict[str, Any],
    month: str,
    contract: dict[str, Any],
) -> list[Finding]:
    branches = resolve_json_path(data, "branchLeaderboardData")
    total = resolve_json_path(data, "branchLeaderboardTotal")
    if not isinstance(branches, list) or total is None:
        return []
    metric = next((item for item in contract.get("metrics", []) if item.get("id") == "branch_samples"), {})
    semantic = metric.get("totalSemantic")
    if not isinstance(semantic, str) or not semantic.strip():
        return [
            _finding(
                "METRIC-004",
                "ERROR",
                month,
                "$.branchLeaderboardTotal",
                "branch leaderboard total has no declared semantic",
                {"total": total},
            )
        ]
    branch_counts = [item.get("n") for item in branches if isinstance(item, dict)]
    if not all(_is_non_negative_integer(value) for value in branch_counts) or not _is_non_negative_integer(total):
        return []
    summed = sum(branch_counts)
    if total < summed:
        return [
            _finding(
                "METRIC-004",
                "ERROR",
                month,
                "$.branchLeaderboardTotal",
                "declared branch total is lower than branch sample sum",
                {"declared": total, "calculated": summed, "semantic": semantic},
            )
        ]
    if total > summed:
        return [
            _finding(
                "METRIC-004",
                "INFO",
                month,
                "$.branchLeaderboardTotal",
                "branch total uses a broader declared semantic than scored branch rows",
                {"declared": total, "calculated": summed, "semantic": semantic},
            )
        ]
    return []


def _check_keyword_floor(data: dict[str, Any], month: str) -> list[Finding]:
    keywords = data.get("feedbackKeywordCloud")
    if not isinstance(keywords, list):
        return []
    texts = _texts(data)
    findings: list[Finding] = []
    for index, item in enumerate(keywords):
        if not isinstance(item, dict) or not isinstance(item.get("text"), str):
            continue
        stored = item.get("count")
        if not _is_non_negative_integer(stored):
            continue
        keyword = item["text"]
        actual = sum(text.count(keyword) for text in texts)
        if stored < actual:
            findings.append(
                _finding(
                    "METRIC-005",
                    "ERROR",
                    month,
                    f"$.feedbackKeywordCloud[{index}].count",
                    "keyword count is lower than exact raw feedback occurrence count",
                    {"keyword": keyword, "declared": stored, "calculated": actual},
                )
            )
    return findings


def _approved_exception(
    contract: dict[str, Any],
    month: str,
    finding: Finding,
) -> dict[str, Any] | None:
    for exception in contract.get("approvedHistoricalExceptions", []):
        if not isinstance(exception, dict):
            continue
        if exception.get("month") != month or exception.get("ruleId") != finding.rule_id:
            continue
        if exception.get("path") == finding.path:
            return exception
        path_prefix = exception.get("pathPrefix")
        if isinstance(path_prefix, str) and finding.path.startswith(path_prefix):
            return exception
    return None


def _apply_approved_exceptions(
    findings: list[Finding],
    month: str,
    contract: dict[str, Any],
) -> list[Finding]:
    adjusted: list[Finding] = []
    for finding in findings:
        exception = _approved_exception(contract, month, finding)
        if exception is None or finding.severity not in {"ERROR", "WARN"}:
            adjusted.append(finding)
            continue
        evidence = {
            **finding.evidence,
            "exceptionId": exception.get("id"),
            "exceptionStatus": exception.get("status"),
            "exceptionReason": exception.get("reason"),
            "exceptionDenominator": exception.get("denominator"),
        }
        adjusted.append(
            Finding(
                rule_id=finding.rule_id,
                severity="INFO",
                month=finding.month,
                path=finding.path,
                message=f"approved historical exception: {exception.get('reason')}",
                evidence=evidence,
            )
        )
    return adjusted


def check_month_metrics(
    data: dict[str, Any],
    month: str,
    contract: dict[str, Any],
    source_label: str,
    p3_data: dict[str, Any] | None = None,
) -> list[Finding]:
    """Return deterministic metric findings without mutating the input data."""

    findings: list[Finding] = []
    total = resolve_json_path(data, "dashboardSummary.totalRespondents")
    if total is None or not _is_non_negative_integer(total):
        findings.append(
            _finding(
                "METRIC-000",
                "ERROR",
                month,
                "$.dashboardSummary.totalRespondents",
                "survey total must be a non-negative integer",
                {"value": total, "source": source_label},
            )
        )
    findings.extend(_check_nps_distribution(data, month))
    findings.extend(
        _check_percentage_pair(
            data,
            month,
            "dashboardSummary.promoConsent.count",
            "dashboardSummary.promoConsent.pct",
            "dashboardSummary.totalRespondents",
            0.01,
        )
    )
    findings.extend(
        _check_percentage_pair(
            data,
            month,
            "dashboardSummary.storeSignup.count",
            "dashboardSummary.storeSignup.pct",
            "dashboardSummary.totalRespondents",
            0.01,
        )
    )
    for prefix in ("sourceData", "channelData"):
        findings.extend(
            _check_parallel_arrays(
                data,
                month,
                [f"{prefix}.labels", f"{prefix}.values", f"{prefix}.pcts"],
            )
        )
        labels = resolve_json_path(data, f"{prefix}.labels")
        values = resolve_json_path(data, f"{prefix}.values")
        pcts = resolve_json_path(data, f"{prefix}.pcts")
        total_value = resolve_json_path(data, "dashboardSummary.totalRespondents")
        if isinstance(labels, list) and isinstance(values, list) and isinstance(pcts, list) and _is_number(total_value) and total_value > 0:
            for index, (count, percentage) in enumerate(zip(values, pcts)):
                declared = parse_percentage(percentage)
                calculated = float(count) / float(total_value) * 100 if _is_number(count) else None
                effective_tolerance = _percentage_tolerance(percentage, 0.01)
                if declared is None or calculated is None or abs(declared - calculated) > effective_tolerance:
                    findings.append(
                        _finding(
                            "METRIC-002",
                            "ERROR",
                            month,
                            f"$.{prefix}.pcts[{index}]",
                            f"{prefix} percentage does not match survey N denominator",
                            {
                                "declared": declared,
                                "calculated": round(calculated, 6) if calculated is not None else None,
                                "count": count,
                                "denominator": total_value,
                                "tolerance": effective_tolerance,
                            },
                        )
                    )
    findings.extend(_check_satisfaction_series(data, month))
    findings.extend(_check_branch_contract(data, month, contract))
    findings.extend(_check_keyword_floor(data, month))
    if isinstance(p3_data, dict) and p3_data.get("status") == "ready" and p3_data.get("period") != month:
        findings.append(
            _finding(
                "METRIC-006",
                "ERROR",
                month,
                "$.p3.period",
                "ready P3 snapshot period does not match base month",
                {"expected": month, "actual": p3_data.get("period")},
            )
        )
    return _apply_approved_exceptions(findings, month, contract)


def _manifest_months(root: Path) -> list[str]:
    manifest = json.loads((root / "data" / "months.json").read_text(encoding="utf-8"))
    return [item["key"] for item in manifest.get("months", []) if isinstance(item, dict) and isinstance(item.get("key"), str)]


def _load_month(root: Path, month: str) -> dict[str, Any]:
    return json.loads((root / "data" / f"{month}.json").read_text(encoding="utf-8"))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check monthly metric contracts.")
    parser.add_argument("month", nargs="?", help="single YYYYMM month")
    parser.add_argument("--all", action="store_true", help="check all manifest months")
    parser.add_argument("--strict-warnings", action="store_true", help="fail on warnings")
    parser.add_argument("--root", type=Path, default=ROOT, help=argparse.SUPPRESS)
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
    total_errors = 0
    total_warnings = 0
    for month in months:
        data = _load_month(root, month)
        findings = check_month_metrics(data, month, contract, f"data/{month}.json")
        errors = [finding for finding in findings if finding.severity == "ERROR"]
        warnings = [finding for finding in findings if finding.severity == "WARN"]
        total_errors += len(errors)
        total_warnings += len(warnings)
        print(f"Month metric check: {month}")
        for finding in findings:
            print(f"{finding.severity}: {finding.rule_id} {finding.path} {finding.message}")
        if not findings:
            print("PASS")
    if total_errors:
        return 1
    if args.strict_warnings and total_warnings:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
