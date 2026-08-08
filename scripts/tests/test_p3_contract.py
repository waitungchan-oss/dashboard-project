#!/usr/bin/env python3
"""Contract tests for the P3 manifest metadata and JSON schemas."""

from __future__ import annotations

import json
import re
import tempfile
import unittest
from copy import deepcopy
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

    def resolve_schema_ref(self, schema: dict, value: dict) -> dict:
        ref = value.get("$ref")
        if not ref:
            return value
        current = schema
        for part in ref.removeprefix("#/").split("/"):
            current = current[part]
        return current

    def contract_errors(self, schema: dict, value: object, contract: dict, path: str = "$") -> list[str]:
        contract = self.resolve_schema_ref(schema, contract)
        errors: list[str] = []
        expected_type = contract.get("type")
        types = expected_type if isinstance(expected_type, list) else [expected_type]
        if expected_type:
            matches = {
                "object": isinstance(value, dict),
                "array": isinstance(value, list),
                "string": isinstance(value, str),
                "integer": isinstance(value, int) and not isinstance(value, bool),
                "number": isinstance(value, (int, float)) and not isinstance(value, bool),
                "boolean": isinstance(value, bool),
                "null": value is None,
            }
            if not any(matches.get(item, False) for item in types):
                return [f"{path}: expected {types}"]
        if "enum" in contract and value not in contract["enum"]:
            errors.append(f"{path}: enum mismatch")
        if isinstance(value, str) and "pattern" in contract and not re.search(contract["pattern"], value):
            errors.append(f"{path}: pattern mismatch")
        if isinstance(value, dict):
            for required in contract.get("required", []):
                if required not in value:
                    errors.append(f"{path}.{required}: required")
            for key, child in contract.get("properties", {}).items():
                if key in value:
                    errors.extend(self.contract_errors(schema, value[key], child, f"{path}.{key}"))
        if isinstance(value, list) and "items" in contract:
            for index, item in enumerate(value):
                errors.extend(self.contract_errors(schema, item, contract["items"], f"{path}[{index}]"))
        return errors

    def assert_fixture_valid(self, schema_name: str, fixture: dict) -> None:
        schema = self.load_json(SCHEMA_DIR / schema_name)
        errors = self.contract_errors(schema, fixture, schema)
        self.assertEqual(errors, [], "fixture errors: " + "; ".join(errors))

    def assert_fixture_invalid(self, schema_name: str, fixture: dict) -> None:
        schema = self.load_json(SCHEMA_DIR / schema_name)
        self.assertTrue(self.contract_errors(schema, fixture, schema))

    def test_p3_fixtures_enforce_required_type_and_enum_behavior(self) -> None:
        month_fixture = {
            "version": "1.0",
            "period": "202607",
            "sampleSize": 10,
            "metrics": {"nps": {"value": 80, "unit": "score", "n": 10, "definition": "score"}},
            "branchRanking": [{"key": "branch-a"}],
            "destinationDemand": [{"key": "destination-a"}],
            "sentiment": [{"key": "positive", "label": "Positive", "count": 8, "rate": 0.8}],
            "customerValueChain": {"status": "partial", "stages": [], "links": [], "unavailable": False},
            "sourceRefs": [],
            "calculationNotes": [],
        }
        issue_fixture = {
            "version": "1.0",
            "issues": [{
                "id": "issue-1",
                "category": "hotel",
                "title": "Hotel feedback",
                "ownerDepartment": "Operations",
                "priority": "medium",
                "status": "open",
                "recommendedAction": "Review supplier",
                "trackingMetrics": [{"key": "rate", "period": "202607", "value": 0.5}],
                "firstSeenMonth": "202607",
                "lastSeenMonth": "202607",
                "monthlySnapshots": [{"period": "202607", "value": 0.5}],
                "sourceRefs": [{"kind": "month", "path": "data/202607.json"}],
            }],
        }
        self.assert_fixture_valid("p3-month.schema.json", month_fixture)
        self.assert_fixture_valid("p3-issues.schema.json", issue_fixture)

        missing_required = deepcopy(issue_fixture)
        del missing_required["issues"][0]["title"]
        self.assert_fixture_invalid("p3-issues.schema.json", missing_required)
        invalid_enum = deepcopy(issue_fixture)
        invalid_enum["issues"][0]["status"] = "closed"
        self.assert_fixture_invalid("p3-issues.schema.json", invalid_enum)
        invalid_issue_items = deepcopy(issue_fixture)
        invalid_issue_items["issues"][0]["trackingMetrics"] = [{"key": "rate", "period": "202607"}]
        self.assert_fixture_invalid("p3-issues.schema.json", invalid_issue_items)
        invalid_type = deepcopy(month_fixture)
        invalid_type["sampleSize"] = "10"
        self.assert_fixture_invalid("p3-month.schema.json", invalid_type)

    def test_manifest_fixtures_preserve_current_and_legacy_fields_with_optional_p3(self) -> None:
        base_months = [
            {"key": "202607", "label": "2026年 07月", "schema": "current", "status": "ready", "description": "current"},
            {"key": "202604", "label": "2026年 04月", "schema": "legacy", "status": "ready", "description": "legacy"},
        ]
        with tempfile.TemporaryDirectory(prefix="dashboard-p3-contract-") as temp_dir:
            for include_p3 in (False, True):
                fixture = {"defaultMonth": "202607", "months": deepcopy(base_months)}
                if include_p3:
                    for month in fixture["months"]:
                        month["p3"] = {"status": "unavailable", "path": f"p3/monthly/{month['key']}.json"}
                fixture_path = Path(temp_dir) / f"months-{include_p3}.json"
                fixture_path.write_text(json.dumps(fixture), encoding="utf-8")
                loaded = self.load_json(fixture_path)
                self.assertEqual(
                    [{key: month[key] for key in ("key", "label", "schema", "status", "description")} for month in loaded["months"]],
                    base_months,
                )
                self.assertEqual(self.contract_errors(self.load_json(SCHEMA_DIR / "manifest.schema.json"), loaded, self.load_json(SCHEMA_DIR / "manifest.schema.json")), [])


if __name__ == "__main__":
    unittest.main()
