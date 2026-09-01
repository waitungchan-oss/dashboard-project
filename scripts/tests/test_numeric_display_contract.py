from __future__ import annotations

import json
import sys
import unittest
from copy import deepcopy
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from check_numeric_display_contract import (  # noqa: E402
    check_chart_series,
    check_frontend_bindings,
    check_numeric_fields,
    check_sentinel_display,
)
from month_governance import load_metric_contract  # noqa: E402


class NumericDisplayContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.month_data = json.loads(
            (ROOT / "data" / "202607.json").read_text(encoding="utf-8")
        )
        self.contract = load_metric_contract(
            ROOT / "data" / "schema" / "monthly-metric-contract.json"
        )
        self.app_source = (ROOT / "app.js").read_text(encoding="utf-8")

    def test_current_month_numeric_fields_pass(self) -> None:
        findings = check_numeric_fields(self.month_data, "202607", self.contract)

        self.assertFalse(findings)

    def test_null_numeric_value_is_reported(self) -> None:
        data = deepcopy(self.month_data)
        data["dashboardSummary"]["totalRespondents"] = None

        findings = check_numeric_fields(data, "202607", self.contract)

        self.assertTrue(
            any(
                finding.rule_id == "DISPLAY-001"
                and finding.path == "$.dashboardSummary.totalRespondents"
                for finding in findings
            )
        )

    def test_negative_count_is_reported(self) -> None:
        data = deepcopy(self.month_data)
        data["dashboardSummary"]["promoConsent"]["count"] = -1

        findings = check_numeric_fields(data, "202607", self.contract)

        self.assertTrue(any(finding.rule_id == "NUMERIC-002" for finding in findings))

    def test_chart_series_length_mismatch_is_reported(self) -> None:
        data = deepcopy(self.month_data)
        data["futureDestData"]["values"].pop()

        findings = check_chart_series(data, "202607", self.contract)

        self.assertTrue(any(finding.rule_id == "DISPLAY-002" for finding in findings))

    def test_frontend_binding_must_reference_contract_data_path(self) -> None:
        source = self.app_source.replace("DataStore.futureDestData", "DataStore.removedFutureDestData")

        findings = check_frontend_bindings(source, self.contract, "202607")

        self.assertTrue(
            any(
                finding.rule_id == "BINDING-001"
                and finding.path == "$.futureDestData"
                for finding in findings
            )
        )

    def test_non_zero_sentinel_cannot_render_as_blank_or_zero(self) -> None:
        fixture = json.loads(
            (ROOT / "scripts" / "tests" / "fixtures" / "month-governance-sentinel.json").read_text(
                encoding="utf-8"
            )
        )

        fixture["rendered"]["$.dashboardSummary.totalRespondents"] = "—"
        findings = check_sentinel_display(fixture, "202607")

        self.assertTrue(any(finding.rule_id == "DISPLAY-001" for finding in findings))


if __name__ == "__main__":
    unittest.main()
