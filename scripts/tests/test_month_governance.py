from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from month_governance import (  # noqa: E402
    Finding,
    load_metric_contract,
    parse_percentage,
    resolve_json_path,
)
from check_month_consistency import check_month_data  # noqa: E402


class MonthGovernancePrimitivesTests(unittest.TestCase):
    def test_finding_serializes_evidence_without_losing_rule_context(self) -> None:
        finding = Finding(
            rule_id="MONTH-001",
            severity="ERROR",
            month="202608",
            path="$.dashboardSummary.totalRespondents",
            message="month mismatch",
            evidence={"expected": "202608", "actual": "202607"},
        )

        self.assertEqual(finding.to_dict()["ruleId"], "MONTH-001")
        self.assertEqual(finding.to_dict()["evidence"]["actual"], "202607")

    def test_resolve_json_path_reads_nested_values(self) -> None:
        data = {"dashboardSummary": {"totalRespondents": 105}}

        self.assertEqual(
            resolve_json_path(data, "dashboardSummary.totalRespondents"),
            105,
        )

    def test_parse_percentage_accepts_display_string_and_number(self) -> None:
        self.assertEqual(parse_percentage("44.76%"), 44.76)
        self.assertEqual(parse_percentage(44.76), 44.76)

    def test_metric_contract_contains_stable_monthly_metrics(self) -> None:
        contract = load_metric_contract(ROOT / "data" / "schema" / "monthly-metric-contract.json")
        metric_ids = {item["id"] for item in contract["metrics"]}

        self.assertTrue(
            {
                "survey_total",
                "promo_consent_count",
                "nps_promoter_count",
                "nps_detractor_count",
                "store_signup_count",
                "source_mentions",
                "channel_mentions",
                "nps_distribution",
                "satisfaction_distribution",
                "branch_samples",
                "raw_feedbacks",
                "branch_feedbacks",
                "keyword_counts",
            }.issubset(metric_ids)
        )

    def test_metric_contract_is_json_data_only(self) -> None:
        contract_path = ROOT / "data" / "schema" / "monthly-metric-contract.json"
        payload = json.loads(contract_path.read_text(encoding="utf-8"))

        self.assertIsInstance(payload, dict)
        self.assertNotIn("function", contract_path.read_text(encoding="utf-8"))
        self.assertNotIn("onClick", contract_path.read_text(encoding="utf-8"))

    def test_summary_with_previous_month_is_a_structured_error(self) -> None:
        data = {
            "dashboardSummary": {
                "text": "根據 2026 年 7 月問卷數據整理。",
            },
            "rawFeedbacks": [],
            "branchRawFeedbacks": [],
        }

        report = check_month_data(data, "202608", "candidate-202608.json")

        self.assertTrue(report.errors)
        self.assertTrue(any(finding.rule_id == "MONTH-001" for finding in report.findings))
        self.assertTrue(any(finding.severity == "ERROR" for finding in report.findings))

    def test_previous_month_inside_raw_feedback_is_not_a_month_error(self) -> None:
        data = {
            "dashboardSummary": {"text": "2026 年 8 月問卷數據。"},
            "rawFeedbacks": [
                {"type": "suggestion", "content": "旅客提到 7 月行程曾經太趕。"}
            ],
            "branchRawFeedbacks": [],
        }

        report = check_month_data(data, "202608", "candidate-202608.json")

        self.assertFalse(any(finding.rule_id == "MONTH-001" for finding in report.findings))


if __name__ == "__main__":
    unittest.main()
