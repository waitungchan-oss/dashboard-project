#!/usr/bin/env python3
"""Baseline contract tests for the P2 dashboard UX scope."""

from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
INDEX_HTML = ROOT / "index.html"
APP_JS = ROOT / "app.js"
MONTHS_JSON = ROOT / "data" / "months.json"

# Keep this allowlist limited to contracts that already exist in production.
REQUIRED_CONTRACTS = (
    "globalMonthSelector",
    "tabFilterContainer",
    "tabFilterMenu",
    "filterCheckboxes",
    "npsCorrelationChart",
    "nps-driver-legend",
    "feedbackGrid",
    "sentimentStatusBar",
    "branchFeedbackGrid",
    "strategic-summary-sections",
    "printReport",
)


def read_utf8(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def load_json(path: Path) -> dict:
    return json.loads(read_utf8(path))


def discover_manifest_month_paths(catalog: dict) -> list[Path]:
    return [ROOT / "data" / f"{month['key']}.json" for month in catalog.get("months", [])]


class P2UxContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.index_html = read_utf8(INDEX_HTML)
        cls.app_js = read_utf8(APP_JS)
        cls.catalog = load_json(MONTHS_JSON)

    def test_no_production_tab_contract_removed(self) -> None:
        source = f"{self.index_html}\n{self.app_js}"
        for token in REQUIRED_CONTRACTS:
            self.assertIn(token, source, f"Missing contract token: {token}")

    def test_manifest_month_files_are_present_and_json_parseable(self) -> None:
        months = self.catalog.get("months", [])
        self.assertIsInstance(months, list)
        self.assertGreater(len(months), 0)

        for month_path in discover_manifest_month_paths(self.catalog):
            with self.subTest(month_path=month_path.name):
                self.assertTrue(month_path.exists(), f"Missing month file: {month_path.name}")
                load_json(month_path)

    def test_key_driver_has_ranked_list_hook(self) -> None:
        self.assertIn('id="npsDriverList"', self.index_html)
        self.assertIn('id="npsDriverDetail"', self.index_html)
        self.assertIn("selectNpsDriver", self.app_js)
        self.assertIn("npsDriverList", self.app_js)
        self.assertIn('md:grid-cols-[3rem_minmax(0,1.6fr)_4.5rem_4.5rem_5rem]', self.index_html)
        self.assertIn('md:grid-cols-[3rem_minmax(0,1.6fr)_4.5rem_4.5rem_5rem]', self.app_js)

    def test_key_driver_does_not_fabricate_fallback_points(self) -> None:
        self.assertNotIn("隨團領隊' }, { x: 0.392", self.app_js)
        self.assertNotIn(
            "const npsCorrelationData = DataStore.npsCorrelationData || { threshold: npsThreshold, points:",
            self.app_js,
        )

    def test_key_driver_has_unavailable_state_for_missing_legacy_data(self) -> None:
        self.assertIn("此月份沒有可用驅動因素資料", self.app_js)
        self.assertIn("npsDriverRankedPoints = []", self.app_js)
        self.assertIn("npsDriverIndexByName = new Map()", self.app_js)
        self.assertIn("npsSelectedDriverName = ''", self.app_js)

    def test_feedback_markup_has_search_and_tour_number_hook(self) -> None:
        self.assertIn('id="feedbackSearch"', self.index_html)
        self.assertIn('id="feedbackResultCount"', self.index_html)
        self.assertIn('data-feedback-field="tourNo"', self.app_js)
        self.assertIn("feedbackSearch", self.app_js)
        self.assertIn("f.tourNo", self.app_js)

    def test_feedback_controls_keep_intermediate_width_wrap_contract(self) -> None:
        self.assertIn('data-ux="feedback-header"', self.index_html)
        self.assertIn('data-ux="feedback-controls"', self.index_html)
        self.assertIn('data-ux="feedback-search-row"', self.index_html)
        self.assertIn("xl:flex-row", self.index_html)
        self.assertIn("md:grid-cols-2", self.index_html)
        self.assertIn("xl:grid-cols-[minmax(0,19rem)_repeat(3,minmax(0,1fr))]", self.index_html)
        self.assertNotIn("md:flex-row justify-between items-center", self.index_html)

    def test_strategy_sections_have_summary_and_detail_hooks(self) -> None:
        self.assertIn('data-ux="strategy-section"', self.index_html)
        self.assertIn('data-ux="strategy-summary"', self.index_html)
        self.assertIn('data-ux="strategy-detail"', self.index_html)
        self.assertIn('data-ux="strategy-section"', self.app_js)
        self.assertIn('data-ux="strategy-summary"', self.app_js)
        self.assertIn('data-ux="strategy-detail"', self.app_js)

    def test_static_analysis_fallback_keeps_only_three_strategy_sections(self) -> None:
        analysis_start = self.index_html.index('<div id="analysis"')
        analysis_end = self.index_html.index("</div>\n\n    </div>\n\n    <div id=\"printReport\"", analysis_start)
        analysis_html = self.index_html[analysis_start:analysis_end]
        self.assertEqual(analysis_html.count('data-ux="strategy-section"'), 3)
        self.assertNotIn("綜合建議 (Comprehensive Recommendation)", analysis_html)
        self.assertIn("renderStrategicDisclosure", self.app_js)


if __name__ == "__main__":
    unittest.main()
