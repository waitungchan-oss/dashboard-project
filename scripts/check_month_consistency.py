#!/usr/bin/env python3
"""Check calculated-field consistency for one dashboard month JSON file."""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
MONTH_KEY_RE = re.compile(r"^20\d{4}$")
VALID_FEEDBACK_TYPES = {"positive", "suggestion", "negative"}
SENTIMENT_ORDER = ("positive", "suggestion", "negative")
SENTIMENT_LABELS = {
    "positive": "positive",
    "suggestion": "suggestion",
    "negative": "negative",
}


class ConsistencyReport:
    def __init__(self, month: str) -> None:
        self.month = month
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self.infos: list[str] = []

    def error(self, message: str) -> None:
        self.errors.append(message)

    def warn(self, message: str) -> None:
        self.warnings.append(message)

    def info(self, message: str) -> None:
        self.infos.append(message)

    def print(self) -> None:
        print(f"Month consistency check: {self.month}")
        for message in self.infos:
            print(f"INFO: {message}")
        for message in self.warnings:
            print(f"WARNING: {message}")
        for message in self.errors:
            print(f"ERROR: {message}")
        if self.errors:
            print(f"Result: FAIL ({len(self.errors)} errors, {len(self.warnings)} warnings)")
        elif self.warnings:
            print(f"Result: PASS with warnings ({len(self.warnings)} warnings)")
        else:
            print("Result: PASS")


def is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def pct(count: int, total: int) -> str:
    if total <= 0:
        return "0.0%"
    return f"{(count / total) * 100:.1f}%"


def path_label(path: Path) -> str:
    return str(path.relative_to(ROOT))


def load_month(month: str, report: ConsistencyReport) -> dict[str, Any]:
    if not MONTH_KEY_RE.match(month):
        report.error(f"month key must be YYYYMM, got {month!r}")
        return {}
    path = DATA_DIR / f"{month}.json"
    if not path.exists():
        report.error(f"{path_label(path)} does not exist")
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001 - CLI should show the exact parse failure.
        report.error(f"{path_label(path)} cannot be parsed as JSON: {exc}")
        return {}
    if not isinstance(value, dict):
        report.error(f"{path_label(path)} must contain a JSON object")
        return {}
    return value


def collect_sentiments(items: Any, field_name: str, report: ConsistencyReport) -> Counter[str]:
    counts: Counter[str] = Counter()
    if items is None:
        report.warn(f"{field_name} is missing")
        return counts
    if not isinstance(items, list):
        report.error(f"{field_name} must be an array")
        return counts

    for index, item in enumerate(items):
        if not isinstance(item, dict):
            report.error(f"{field_name}[{index}] must be an object")
            continue
        item_type = item.get("type")
        if item_type not in VALID_FEEDBACK_TYPES:
            report.error(f"{field_name}[{index}].type is invalid: {item_type!r}")
            continue
        counts[item_type] += 1
    return counts


def summarize_sentiments(counts: Counter[str]) -> str:
    total = sum(counts.values())
    parts = [f"total={total}"]
    for sentiment in SENTIMENT_ORDER:
        label = SENTIMENT_LABELS[sentiment]
        count = counts.get(sentiment, 0)
        parts.append(f"{label}={count} ({pct(count, total)})")
    return ", ".join(parts)


def check_raw_feedbacks(data: dict[str, Any], report: ConsistencyReport) -> None:
    counts = collect_sentiments(data.get("rawFeedbacks"), "rawFeedbacks", report)
    if counts:
        report.info(f"rawFeedbacks frontend sentiment basis: {summarize_sentiments(counts)}")


def raw_feedback_contents(data: dict[str, Any]) -> list[str]:
    feedbacks = data.get("rawFeedbacks")
    if not isinstance(feedbacks, list):
        return []
    contents: list[str] = []
    for item in feedbacks:
        if isinstance(item, dict) and isinstance(item.get("content"), str):
            contents.append(item["content"])
    return contents


def count_occurrences(texts: Iterable[str], keyword: str) -> int:
    if not keyword:
        return 0
    return sum(text.count(keyword) for text in texts)


def check_keyword_cloud(data: dict[str, Any], report: ConsistencyReport) -> None:
    keywords = data.get("feedbackKeywordCloud")
    if keywords is None:
        report.info("feedbackKeywordCloud is absent; frontend will use fallback keywords if needed")
        return
    if not isinstance(keywords, list):
        report.error("feedbackKeywordCloud must be an array")
        return

    contents = raw_feedback_contents(data)
    lower_than_actual: list[str] = []
    for index, item in enumerate(keywords):
        if not isinstance(item, dict):
            report.error(f"feedbackKeywordCloud[{index}] must be an object")
            continue
        keyword = item.get("text")
        stored_count = item.get("count")
        if not isinstance(keyword, str) or not keyword.strip():
            report.error(f"feedbackKeywordCloud[{index}].text must be a non-empty string")
            continue
        if stored_count is None:
            report.warn(f"feedbackKeywordCloud[{index}] {keyword!r} has no count field")
            continue
        if not isinstance(stored_count, int) or isinstance(stored_count, bool) or stored_count < 0:
            report.error(f"feedbackKeywordCloud[{index}] {keyword!r}.count must be a non-negative integer")
            continue
        actual_count = count_occurrences(contents, keyword)
        if stored_count < actual_count:
            lower_than_actual.append(f"{keyword}: stored={stored_count}, actual={actual_count}")

    if lower_than_actual:
        report.warn(
            "feedbackKeywordCloud.count is lower than rawFeedbacks exact occurrence count for "
            + "; ".join(lower_than_actual)
        )
    else:
        report.info("feedbackKeywordCloud.count is not lower than exact rawFeedbacks occurrences")


def check_branch_feedbacks(data: dict[str, Any], report: ConsistencyReport) -> None:
    counts = collect_sentiments(data.get("branchRawFeedbacks"), "branchRawFeedbacks", report)
    branch_feedbacks = data.get("branchRawFeedbacks")
    if isinstance(branch_feedbacks, list):
        report.info(
            "branchRawFeedbacks frontend total basis: "
            f"length={len(branch_feedbacks)}, {summarize_sentiments(counts)}"
        )


def check_branch_leaderboard_total(data: dict[str, Any], report: ConsistencyReport) -> None:
    branches = data.get("branchLeaderboardData")
    declared_total = data.get("branchLeaderboardTotal")
    if not isinstance(branches, list):
        if branches is None:
            report.warn("branchLeaderboardData is missing")
        else:
            report.error("branchLeaderboardData must be an array")
        return

    sum_n = 0
    valid_n = True
    for index, item in enumerate(branches):
        if not isinstance(item, dict):
            report.error(f"branchLeaderboardData[{index}] must be an object")
            valid_n = False
            continue
        n_value = item.get("n")
        if not isinstance(n_value, int) or isinstance(n_value, bool) or n_value < 0:
            report.error(f"branchLeaderboardData[{index}].n must be a non-negative integer")
            valid_n = False
            continue
        sum_n += n_value

    if not valid_n:
        return

    if declared_total is None:
        report.info(f"branchLeaderboardTotal is absent; frontend fallback sum(branchLeaderboardData.n)={sum_n}")
        return
    if not is_number(declared_total):
        report.error("branchLeaderboardTotal must be numeric when present")
        return
    if int(declared_total) != declared_total:
        report.error("branchLeaderboardTotal must be an integer-valued number")
        return
    declared_total_int = int(declared_total)
    if declared_total_int < sum_n:
        report.warn(
            "branchLeaderboardTotal is lower than sum(branchLeaderboardData.n): "
            f"branchLeaderboardTotal={declared_total_int}, sum={sum_n}. "
            "This suggests the displayed total is smaller than scored branch samples."
        )
    elif declared_total_int > sum_n:
        report.info(
            "branchLeaderboardTotal is a broader total than sum(branchLeaderboardData.n): "
            f"branchLeaderboardTotal={declared_total_int}, sum={sum_n}. "
            "Treat branchLeaderboardTotal as total survey N and branch n as scored branch sample counts."
        )
    else:
        report.info(f"branchLeaderboardTotal matches sum(branchLeaderboardData.n)={sum_n}")


def iter_strings(value: Any, path: str = "$") -> Iterable[tuple[str, str]]:
    if isinstance(value, str):
        yield path, value
    elif isinstance(value, list):
        for index, item in enumerate(value):
            yield from iter_strings(item, f"{path}[{index}]")
    elif isinstance(value, dict):
        for key, item in value.items():
            yield from iter_strings(item, f"{path}.{key}")


def is_user_comment_path(path: str) -> bool:
    return path.startswith("$.rawFeedbacks[") or path.startswith("$.branchRawFeedbacks[")


def month_phrase_variants(year: int, month: int, short: bool) -> list[str]:
    variants = [
        f"{year} 年 {month} 月",
        f"{year}年{month}月",
        f"{year} 年 {month:02d} 月",
        f"{year}年{month:02d}月",
        f"{year}年 {month:02d}月",
        f"{year}年 {month}月",
    ]
    if short:
        variants.extend(
            [
                f"{month} 月份",
                f"{month}月份",
                f"{month} 月",
                f"{month:02d} 月",
            ]
        )
    return variants


def snippet(text: str, phrase: str, radius: int = 18) -> str:
    index = text.find(phrase)
    if index < 0:
        return text[: radius * 2]
    start = max(0, index - radius)
    end = min(len(text), index + len(phrase) + radius)
    prefix = "..." if start else ""
    suffix = "..." if end < len(text) else ""
    return prefix + text[start:end] + suffix


def check_wrong_month_text(data: dict[str, Any], month: str, report: ConsistencyReport) -> None:
    year = int(month[:4])
    current_month = int(month[4:6])
    found: list[str] = []

    full_variants: list[tuple[int, str]] = []
    short_variants: list[tuple[int, str]] = []
    for candidate_month in range(1, 13):
        if candidate_month == current_month:
            continue
        for phrase in month_phrase_variants(year, candidate_month, short=False):
            full_variants.append((candidate_month, phrase))
        for phrase in month_phrase_variants(year, candidate_month, short=True):
            short_variants.append((candidate_month, phrase))

    for path, text in iter_strings(data):
        for candidate_month, phrase in full_variants:
            if phrase in text:
                found.append(
                    f"{path}: found {phrase!r} while checking {month}; snippet={snippet(text, phrase)!r}"
                )
        if is_user_comment_path(path):
            continue
        for candidate_month, phrase in short_variants:
            if phrase in text:
                found.append(
                    f"{path}: found short month phrase {phrase!r} while checking {month}; "
                    f"snippet={snippet(text, phrase)!r}"
                )

    if found:
        for item in found:
            report.warn(f"possible residual wrong-month text: {item}")
    else:
        report.info("No same-year wrong-month text was found outside current month labels")


def check_month(month: str) -> ConsistencyReport:
    report = ConsistencyReport(month)
    data = load_month(month, report)
    if not data:
        return report
    check_raw_feedbacks(data, report)
    check_keyword_cloud(data, report)
    check_branch_feedbacks(data, report)
    check_branch_leaderboard_total(data, report)
    check_wrong_month_text(data, month, report)
    return report


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Check one dashboard month JSON file for calculated-field consistency."
    )
    parser.add_argument("month", help="Month key in YYYYMM format, for example 202606")
    parser.add_argument(
        "--strict-warnings",
        action="store_true",
        help="Return exit code 1 when warnings are present.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    report = check_month(args.month)
    report.print()
    if report.errors:
        return 1
    if args.strict_warnings and report.warnings:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
