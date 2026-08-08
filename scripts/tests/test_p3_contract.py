#!/usr/bin/env python3
"""Contract tests for the P3 manifest metadata and JSON schemas."""

from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCHEMA_DIR = ROOT / "data" / "schema"


class P3ContractTests(unittest.TestCase):
    def load_json(self, path: Path) -> dict:
        self.assertTrue(path.is_file(), f"missing JSON contract: {path}")
        value = json.loads(path.read_text(encoding="utf-8"))
        self.assertIsInstance(value, dict)
        return value

    def test_p3_contract_files_expose_required_roots(self) -> None:
        month_schema = self.load_json(SCHEMA_DIR / "p3-month.schema.json")
        issue_schema = self.load_json(SCHEMA_DIR / "p3-issues.schema.json")
        manifest_schema = self.load_json(SCHEMA_DIR / "manifest.schema.json")
        manifest = self.load_json(ROOT / "data" / "months.json")

        self.assertEqual(
            month_schema["required"],
            [
                "version",
                "period",
                "sampleSize",
                "metrics",
                "branchRanking",
                "destinationDemand",
                "sentiment",
                "customerValueChain",
                "sourceRefs",
                "calculationNotes",
            ],
        )
        self.assertEqual(
            issue_schema["required"],
            ["version", "issues"],
        )
        self.assertEqual(
            issue_schema["properties"]["issues"]["items"]["required"],
            [
                "id",
                "category",
                "title",
                "ownerDepartment",
                "priority",
                "status",
                "recommendedAction",
                "trackingMetrics",
                "firstSeenMonth",
                "lastSeenMonth",
                "monthlySnapshots",
                "sourceRefs",
            ],
        )
        self.assertEqual(manifest_schema["properties"]["months"]["items"]["properties"]["p3"]["required"], ["status", "path"])
        self.assertEqual(manifest["defaultMonth"], "202605")
        self.assertEqual({month["key"] for month in manifest["months"]}, {"202604", "202605", "202606", "202607"})

    def test_manifest_p3_metadata_is_unavailable_until_snapshots_exist(self) -> None:
        manifest = self.load_json(ROOT / "data" / "months.json")

        for month in manifest["months"]:
            self.assertEqual(
                month["p3"],
                {"status": "unavailable", "path": f"p3/monthly/{month['key']}.json"},
            )

    def test_p3_enum_contracts_are_explicit(self) -> None:
        month_schema = self.load_json(SCHEMA_DIR / "p3-month.schema.json")
        issue_schema = self.load_json(SCHEMA_DIR / "p3-issues.schema.json")

        self.assertEqual(
            month_schema["properties"]["customerValueChain"]["properties"]["status"]["enum"],
            ["complete", "partial", "unavailable"],
        )
        issue_item = issue_schema["properties"]["issues"]["items"]
        self.assertEqual(issue_item["properties"]["category"]["enum"], ["shopping", "hotel", "dining", "ground_service"])
        self.assertEqual(issue_item["properties"]["priority"]["enum"], ["low", "medium", "high"])
        self.assertEqual(issue_item["properties"]["status"]["enum"], ["open", "monitoring", "resolved"])


if __name__ == "__main__":
    unittest.main()
