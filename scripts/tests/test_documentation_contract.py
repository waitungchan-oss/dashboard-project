from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class DocumentationContractTests(unittest.TestCase):
    def test_monthly_sop_documents_candidate_and_full_governance_flow(self) -> None:
        sop = (ROOT / "MONTHLY_DATA_IMPORT.md").read_text(encoding="utf-8")
        required = [
            "validate_month_schema.py --candidate",
            "check_month_consistency.py",
            "validate_month_governance.py",
            "--all --strict",
            "hermes_dashboard_check.py --json",
            "不等於 0",
            "不修改 manifest",
        ]

        for token in required:
            self.assertIn(token, sop)

    def test_docs_define_history_exception_boundary(self) -> None:
        docs = "\n".join(
            (ROOT / filename).read_text(encoding="utf-8")
            for filename in (
                "README_START.md",
                "MONTHLY_DATA_IMPORT.md",
                "DASHBOARD_HERMES_MONITORING.md",
                "DASHBOARD_PROJECT_HANDOFF.md",
            )
        )

        self.assertIn("approvedHistoricalExceptions", docs)
        self.assertIn("新月份不會繼承", docs)


if __name__ == "__main__":
    unittest.main()
