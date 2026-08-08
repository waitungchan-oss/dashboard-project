#!/usr/bin/env python3
"""Contract tests for the P3 manifest metadata and JSON schemas."""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
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

    def test_manifest_p3_metadata_is_ready_when_snapshots_exist(self) -> None:
        manifest = self.load_json(ROOT / "data" / "months.json")

        for month in manifest["months"]:
            self.assertEqual(
                month["p3"],
                {"status": "ready", "path": f"p3/monthly/{month['key']}.json"},
            )
            self.assertTrue((ROOT / "data" / month["p3"]["path"]).is_file())

    def test_manifest_unavailable_fixture_requires_missing_snapshot(self) -> None:
        with tempfile.TemporaryDirectory(prefix="dashboard-p3-manifest-") as temp_dir:
            temp_root = Path(temp_dir)
            fixture = {"p3": {"status": "unavailable", "path": "p3/monthly/209901.json"}}
            self.assertFalse((temp_root / "data" / fixture["p3"]["path"]).is_file())

    def test_observed_customer_value_links_have_source_fields_and_base_values(self) -> None:
        expected_months = {
            "202605": (18, 6),
            "202606": (17, 6),
            "202607": (9, 7),
        }
        for month, (expected_count, expected_disagree) in expected_months.items():
            snapshot = self.load_json(ROOT / "data" / "p3" / "monthly" / f"{month}.json")
            base = self.load_json(ROOT / "data" / f"{month}.json")
            links = snapshot["customerValueChain"]["links"]
            self.assertEqual(len(links), 1)
            link = links[0]
            for field in ("from", "to", "count", "n", "sourceRefs"):
                self.assertIn(field, link)
            self.assertEqual(link["from"], "member_status:是會員")
            self.assertEqual(link["to"], "consent:同意")
            self.assertEqual(link["count"], base["memberConsentCrossData"]["datasets"][0]["data"][0])
            self.assertEqual(link["n"], expected_count + expected_disagree)
            self.assertEqual(link["count"], expected_count)
            self.assertEqual(len(link["sourceRefs"]), 2)
            for source_ref in link["sourceRefs"]:
                self.assertEqual(source_ref["month"], month)
                self.assertEqual(source_ref["section"], "memberConsentCrossData")
                self.assertTrue(source_ref.get("recordKey"))
                self.assertTrue(source_ref.get("path"))
            self.assertEqual(
                {source_ref["path"] for source_ref in link["sourceRefs"]},
                {
                    f"data/{month}.json#/memberConsentCrossData/datasets/0/data/0",
                    f"data/{month}.json#/memberConsentCrossData/datasets/1/data/0",
                },
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

    def source_ref_errors(self, ref: dict, period: str, listed_months: set[str]) -> list[str]:
        errors = []
        if ref.get("month") != period:
            errors.append("month mismatch")
        if ref.get("month") not in listed_months:
            errors.append("unlisted month")
        if not (ref.get("recordKey") or ref.get("path")):
            errors.append("missing stable source locator")
        return errors

    def issue_register_errors(self, issues: list[dict]) -> list[str]:
        errors = []
        ids = [issue.get("id") for issue in issues]
        if len(ids) != len(set(ids)):
            errors.append("duplicate issue id")
        for issue in issues:
            if issue.get("firstSeenMonth", "") > issue.get("lastSeenMonth", ""):
                errors.append("reverse observation window")
        return errors

    def test_source_reference_fixtures_reject_month_and_period_mismatches(self) -> None:
        mismatched_file = Path("202606.json")
        mismatched_snapshot = {"period": "202607"}
        self.assertNotEqual(mismatched_file.stem, mismatched_snapshot["period"])

        snapshot = {
            "period": "202607",
            "sourceRefs": [{
                "kind": "month",
                "month": "202606",
                "section": "dashboardSummary",
                "recordKey": "dashboardSummary.totalRespondents",
                "path": "data/202606.json#/dashboardSummary/totalRespondents",
            }],
        }
        listed_months = {"202606", "202607"}
        self.assertIn("month mismatch", self.source_ref_errors(snapshot["sourceRefs"][0], snapshot["period"], listed_months))

        source_ref = deepcopy(snapshot["sourceRefs"][0])
        source_ref["month"] = "202607"
        source_ref["path"] = "data/202607.json#/dashboardSummary/totalRespondents"
        self.assertEqual(self.source_ref_errors(source_ref, snapshot["period"], listed_months), [])

    def test_source_reference_fixture_rejects_unlisted_month(self) -> None:
        manifest = self.load_json(ROOT / "data" / "months.json")
        listed_months = {month["key"] for month in manifest["months"]}
        source_ref = {
            "kind": "month",
            "month": "202699",
            "section": "dashboardSummary",
            "recordKey": "dashboardSummary.totalRespondents",
            "path": "data/202699.json#/dashboardSummary/totalRespondents",
        }
        self.assertIn("unlisted month", self.source_ref_errors(source_ref, "202699", listed_months))

    def test_issue_fixture_rejects_reverse_observation_window_and_duplicate_ids(self) -> None:
        issue_fixture = {
            "issues": [
                {"id": "ISSUE-SHOPPING-001", "firstSeenMonth": "202607", "lastSeenMonth": "202604"},
                {"id": "ISSUE-SHOPPING-001", "firstSeenMonth": "202604", "lastSeenMonth": "202607"},
            ]
        }
        errors = self.issue_register_errors(issue_fixture["issues"])
        self.assertIn("reverse observation window", errors)
        self.assertIn("duplicate issue id", errors)

    def test_produced_snapshots_and_issue_register_have_traceable_sources(self) -> None:
        manifest = self.load_json(ROOT / "data" / "months.json")
        listed_months = {month["key"] for month in manifest["months"]}
        monthly_dir = ROOT / "data" / "p3" / "monthly"
        snapshot_files = sorted(monthly_dir.glob("*.json"))
        self.assertEqual({path.stem for path in snapshot_files}, listed_months)

        for path in snapshot_files:
            snapshot = self.load_json(path)
            self.assertEqual(snapshot["period"], path.stem)
            for source_ref in snapshot["sourceRefs"]:
                self.assertEqual(self.source_ref_errors(source_ref, snapshot["period"], listed_months), [])

        issues = self.load_json(ROOT / "data" / "p3" / "issues.json")["issues"]
        ids = [issue["id"] for issue in issues]
        self.assertEqual(ids, [
            "ISSUE-SHOPPING-001",
            "ISSUE-HOTEL-001",
            "ISSUE-DINING-001",
            "ISSUE-GROUND-SERVICE-001",
        ])
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(self.issue_register_errors(issues), [])
        for issue in issues:
            self.assertLessEqual(issue["firstSeenMonth"], issue["lastSeenMonth"])
            for source_ref in issue["sourceRefs"]:
                self.assertIn(source_ref["month"], listed_months)
                self.assertTrue(source_ref.get("recordKey") or source_ref.get("path"))

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

    def copy_validator_fixture(self) -> Path:
        temp_dir = Path(tempfile.mkdtemp(prefix="dashboard-p3-validator-"))
        shutil.copytree(ROOT / "data", temp_dir / "data")
        return temp_dir

    def run_validator(self, root: Path, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "validate_p3.py"), "--root", str(root), *args],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )

    def test_validate_p3_all_snapshots_pass_and_json_fields_are_exact(self) -> None:
        from scripts.validate_p3 import validate_p3

        report = validate_p3(ROOT, None)
        self.assertEqual(set(report), {"status", "checkedMonths", "errors", "warnings"})
        self.assertEqual(report["status"], "pass")
        self.assertEqual(report["checkedMonths"], ["202605", "202607", "202606", "202604"])
        self.assertEqual(report["errors"], [])

    def test_validate_p3_cli_rejects_no_selection(self) -> None:
        result = self.run_validator(ROOT, "--json")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("use --all or explicit months", result.stderr)
        self.assertNotIn('"status": "pass"', result.stdout)

    def test_validate_p3_rejects_missing_manifest_p3_path(self) -> None:
        root = self.copy_validator_fixture()
        try:
            manifest_path = root / "data" / "months.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["months"][0]["p3"]["path"] = "p3/monthly/missing.json"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            result = self.run_validator(root, "--all")
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("missing", result.stdout)
        finally:
            shutil.rmtree(root)

    def test_validate_p3_rejects_period_mismatch(self) -> None:
        root = self.copy_validator_fixture()
        try:
            path = root / "data" / "p3" / "monthly" / "202607.json"
            snapshot = json.loads(path.read_text(encoding="utf-8"))
            snapshot["period"] = "202606"
            path.write_text(json.dumps(snapshot), encoding="utf-8")
            result = self.run_validator(root, "202607")
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("period", result.stdout)
        finally:
            shutil.rmtree(root)

    def test_validate_p3_rejects_invalid_issue_enum(self) -> None:
        root = self.copy_validator_fixture()
        try:
            path = root / "data" / "p3" / "issues.json"
            issues = json.loads(path.read_text(encoding="utf-8"))
            issues["issues"][0]["status"] = "closed"
            path.write_text(json.dumps(issues), encoding="utf-8")
            result = self.run_validator(root, "--all")
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("status", result.stdout)
        finally:
            shutil.rmtree(root)

    def test_validate_p3_rejects_duplicate_issue_id(self) -> None:
        root = self.copy_validator_fixture()
        try:
            path = root / "data" / "p3" / "issues.json"
            issues = json.loads(path.read_text(encoding="utf-8"))
            issues["issues"][1]["id"] = issues["issues"][0]["id"]
            path.write_text(json.dumps(issues), encoding="utf-8")
            result = self.run_validator(root, "--all")
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("duplicate", result.stdout)
        finally:
            shutil.rmtree(root)

    def test_validate_p3_rejects_non_numeric_branch_score(self) -> None:
        root = self.copy_validator_fixture()
        try:
            path = root / "data" / "p3" / "monthly" / "202607.json"
            snapshot = json.loads(path.read_text(encoding="utf-8"))
            snapshot["branchRanking"][0]["score"] = "4.6"
            path.write_text(json.dumps(snapshot), encoding="utf-8")
            result = self.run_validator(root, "202607")
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("score", result.stdout)
        finally:
            shutil.rmtree(root)

    def test_validate_p3_rejects_metric_count_rate_mismatch(self) -> None:
        root = self.copy_validator_fixture()
        try:
            path = root / "data" / "p3" / "monthly" / "202607.json"
            snapshot = json.loads(path.read_text(encoding="utf-8"))
            snapshot["metrics"]["promo_consent"]["value"] = 0.99
            path.write_text(json.dumps(snapshot), encoding="utf-8")
            result = self.run_validator(root, "202607")
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("rate", result.stdout)
        finally:
            shutil.rmtree(root)

    def test_validate_p3_allows_partial_chain_with_explicit_unavailable_reasons(self) -> None:
        from scripts.validate_p3 import validate_p3

        report = validate_p3(ROOT, ["202604"])
        self.assertEqual(report["status"], "pass")
        self.assertEqual(report["errors"], [])

    def test_validate_p3_strict_warnings_return_nonzero(self) -> None:
        root = self.copy_validator_fixture()
        try:
            path = root / "data" / "p3" / "monthly" / "202607.json"
            snapshot = json.loads(path.read_text(encoding="utf-8"))
            snapshot["customerValueChain"]["status"] = "unavailable"
            snapshot["customerValueChain"]["unavailable"] = True
            snapshot["customerValueChain"]["unavailableLinks"] = ["recommendation_to_consent"]
            path.write_text(json.dumps(snapshot), encoding="utf-8")
            result = self.run_validator(root, "202607", "--strict-warnings", "--json")
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('"warnings"', result.stdout)
        finally:
            shutil.rmtree(root)


if __name__ == "__main__":
    unittest.main()
