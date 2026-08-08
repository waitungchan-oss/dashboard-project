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

    def test_issue_tracker_tab_has_local_controls_and_renderer_wiring(self) -> None:
        for needle in (
            'data-tab-id="p3_issue_tracker"',
            'id="p3_issue_tracker"',
            'id="p3IssueCategoryFilter"',
            'id="p3IssueDepartmentFilter"',
            'id="p3IssueStatusFilter"',
            'id="p3IssuePriorityFilter"',
            'id="p3IssueGrid"',
            'id="p3IssueResultCount"',
            'renderP3IssueTracker',
            'renderP3IssueTrackerUnavailable',
            'filterP3Issues',
        ):
            with self.subTest(needle=needle):
                self.assertIn(needle, self.index + self.app)

    def test_issue_tracker_does_not_reuse_global_feedback_filters(self) -> None:
        self.assertIn("p3IssueTrackerState", self.app)
        self.assertIn("P3State.issuesError", self.app)
        self.assertIn("p3_issue_tracker:", self.app)
        self.assertNotIn("tabFilterMenu", self.index[self.index.index('id="p3_issue_tracker"'):self.index.index('id="p3_comparison"')])

    def test_issue_tracker_print_manifest_uses_direct_children(self) -> None:
        manifest = self.app[self.app.index("p3_issue_tracker:"):]
        manifest = manifest[:manifest.index("\n        }", 1)]
        self.assertIn("path: [0]", manifest)
        self.assertIn("path: [1]", manifest)
        self.assertNotIn("path: [2]", manifest)

    def test_customer_value_chain_tab_has_standalone_contract(self) -> None:
        for needle in (
            'data-tab-id="p3_customer_value_chain"',
            'id="p3_customer_value_chain"',
            'id="p3ValueChainMonthSelector"',
            'id="p3ValueChainStatus"',
            'id="p3ValueChainStages"',
            'id="p3ValueChainLinks"',
            'id="p3ValueChainUnavailable"',
            'getP3CustomerValueChainViewModel',
            'renderP3CustomerValueChain',
            'renderP3CustomerValueChainUnavailable',
        ):
            with self.subTest(needle=needle):
                self.assertIn(needle, self.index + self.app)

    def test_customer_value_chain_uses_manifest_and_refreshes_on_p3_update(self) -> None:
        self.assertIn('p3ValueChainMonthSelector', self.app)
        self.assertIn('MonthCatalog.months', self.app)
        self.assertIn("if (tabId === 'p3_customer_value_chain')", self.app)
        self.assertIn('renderP3CustomerValueChainUnavailable', self.app)

    def test_customer_value_chain_does_not_claim_repeat_purchase_without_source(self) -> None:
        renderer = (ROOT / "js" / "p3-renderers.js").read_text(encoding="utf-8")
        self.assertNotIn('repeat_purchase', renderer)
        self.assertIn('sourceRefs', renderer)

    def test_provider_field_deltas_and_rank_fields_are_renderer_contract(self) -> None:
        renderer = (ROOT / "js" / "p3-renderers.js").read_text(encoding="utf-8")
        for needle in ("scoreDelta", "nDelta", "valueDelta", "rateDelta", "countDelta", "rankDelta"):
            with self.subTest(needle=needle):
                self.assertIn(needle, renderer)
        self.assertNotIn("row?.delta", renderer)

    def test_inactive_p3_update_is_stale_and_reopen_refreshes(self) -> None:
        self.assertIn("p3ComparisonState.stale = true", self.app)
        self.assertIn("refreshP3ComparisonOnOpen", self.app)
        self.assertIn("if (tabId === 'p3_comparison')", self.app)
        hook = self.app[self.app.index("P3State.onUpdate"):]
        self.assertLess(hook.index("p3ComparisonState.stale = true"), hook.index("if (!section?.classList.contains('active')) return;"))
        switch = self.app[self.app.index("switchTab: function(tabId"):]
        self.assertLess(switch.index("refreshP3ComparisonOnOpen()"), switch.index("document.querySelectorAll('.tab-content')"))

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
