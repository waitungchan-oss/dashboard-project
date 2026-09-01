from __future__ import annotations

import json
import sys
import tempfile
import unittest
from copy import deepcopy
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
from check_month_metrics import check_month_metrics  # noqa: E402


class MonthGovernancePrimitivesTests(unittest.TestCase):
    def setUp(self) -> None:
        self.month_data = json.loads(
            (ROOT / "data" / "202607.json").read_text(encoding="utf-8")
        )
        self.contract = load_metric_contract(
            ROOT / "data" / "schema" / "monthly-metric-contract.json"
        )

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

    def test_current_month_metrics_pass_against_202607_shape(self) -> None:
        findings = check_month_metrics(
            self.month_data,
            "202607",
            self.contract,
            "data/202607.json",
        )

        self.assertFalse([finding for finding in findings if finding.severity == "ERROR"])

    def test_nps_distribution_mismatch_is_reported(self) -> None:
        data = deepcopy(self.month_data)
        data["npsDistData"]["values"][0] = 102

        findings = check_month_metrics(data, "202607", self.contract, "candidate")

        self.assertTrue(any(finding.rule_id == "METRIC-001" for finding in findings))

    def test_percentage_mismatch_includes_denominator_evidence(self) -> None:
        data = deepcopy(self.month_data)
        data["dashboardSummary"]["promoConsent"]["pct"] = "50.00%"

        findings = check_month_metrics(data, "202607", self.contract, "candidate")
        mismatch = next(finding for finding in findings if finding.rule_id == "METRIC-002")

        self.assertEqual(mismatch.evidence["denominator"], 105)
        self.assertEqual(mismatch.evidence["declared"], 50.0)

    def test_one_decimal_percentage_rounding_is_not_a_metric_error(self) -> None:
        data = json.loads(
            (ROOT / "data" / "202604.json").read_text(encoding="utf-8")
        )

        findings = check_month_metrics(data, "202604", self.contract, "data/202604.json")

        self.assertFalse(
            [
                finding
                for finding in findings
                if finding.rule_id == "METRIC-002"
                and finding.path.startswith("$.channelData.pcts")
            ]
        )

    def test_approved_historical_exception_preserves_202605_and_is_traceable(self) -> None:
        data = json.loads(
            (ROOT / "data" / "202605.json").read_text(encoding="utf-8")
        )

        findings = check_month_metrics(data, "202605", self.contract, "data/202605.json")

        historical = [
            finding
            for finding in findings
            if finding.path == "$.dashboardSummary.nps.promoterCount"
            or finding.path.startswith("$.sourceData.pcts")
        ]
        self.assertTrue(historical)
        self.assertTrue(all(finding.severity == "INFO" for finding in historical))
        self.assertTrue(
            all(finding.evidence.get("exceptionId") for finding in historical)
        )
        self.assertFalse(
            [finding for finding in findings if finding.severity == "ERROR"]
        )

    def test_historical_exception_does_not_apply_to_a_new_month(self) -> None:
        data = deepcopy(self.month_data)
        data["dashboardSummary"]["nps"]["promoterCount"] = 102

        findings = check_month_metrics(data, "202607", self.contract, "candidate")

        self.assertTrue(
            any(
                finding.rule_id == "METRIC-001"
                and finding.path == "$.dashboardSummary.nps.promoterCount"
                and finding.severity == "ERROR"
                for finding in findings
            )
        )

    def test_parallel_array_mismatch_is_reported(self) -> None:
        data = deepcopy(self.month_data)
        data["sourceData"]["pcts"].pop()

        findings = check_month_metrics(data, "202607", self.contract, "candidate")

        self.assertTrue(any(finding.rule_id == "METRIC-003" for finding in findings))

    def test_branch_total_without_semantic_is_reported(self) -> None:
        contract = deepcopy(self.contract)
        branch_metric = next(item for item in contract["metrics"] if item["id"] == "branch_samples")
        branch_metric["totalSemantic"] = ""

        findings = check_month_metrics(self.month_data, "202607", contract, "candidate")

        self.assertTrue(any(finding.rule_id == "METRIC-004" for finding in findings))

    def test_keyword_count_below_exact_occurrence_is_reported(self) -> None:
        data = deepcopy(self.month_data)
        keyword = data["feedbackKeywordCloud"][0]["text"]
        data["feedbackKeywordCloud"][0]["count"] = 0

        findings = check_month_metrics(data, "202607", self.contract, "candidate")

        self.assertTrue(any(finding.rule_id == "METRIC-005" for finding in findings), keyword)

    def test_p3_period_mismatch_is_reported(self) -> None:
        p3_data = {"period": "202606", "status": "ready"}

        findings = check_month_metrics(
            self.month_data,
            "202607",
            self.contract,
            "candidate",
            p3_data=p3_data,
        )

        self.assertTrue(any(finding.rule_id == "METRIC-006" for finding in findings))


if __name__ == "__main__":
    unittest.main()
