#!/usr/bin/env python3
"""Static contract tests for the standalone P3 month comparison tab."""

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]


class P3FrontendContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.index = (ROOT / "index.html").read_text(encoding="utf-8")
        cls.app = (ROOT / "app.js").read_text(encoding="utf-8")

    def test_comparison_tab_shell_and_controls_exist(self) -> None:
        for needle in (
            'data-tab-id="p3_comparison"',
            'id="p3_comparison"',
            'id="p3BaseMonthSelector"',
            'id="p3CompareMonthSelector"',
            'id="p3ComparisonStatus"',
            'id="p3MetricCards"',
            'id="p3BranchComparison"',
            'id="p3DestinationComparison"',
            'id="p3SentimentComparison"',
            'aria-live="polite"',
        ):
            with self.subTest(needle=needle):
                self.assertIn(needle, self.index)

    def test_renderer_and_print_contract_exist(self) -> None:
        self.assertIn("./js/p3-renderers.js", self.app)
        self.assertIn("renderP3Comparison", self.app)
        self.assertIn("p3_comparison:", self.app)

    def test_existing_tab_and_dom_contract_remains(self) -> None:
        for needle in (
            'id="globalMonthSelector"',
            'id="printReport"',
            'id="tabFilterContainer"',
            'id="tabFilterMenu"',
            'id="filterCheckboxes"',
            'id="dashboard"',
            'id="sales_forecast"',
            'id="nps_zone"',
            'id="tourleader"',
            'id="records"',
            'id="feedback_analysis"',
            'id="branch_feedback"',
            'id="analysis"',
            'id="genderChart"',
            'id="satisfactionCrossChart"',
            'id="npsCorrelationChart"',
        ):
            with self.subTest(needle=needle):
                self.assertIn(needle, self.index)


if __name__ == "__main__":
    unittest.main()
