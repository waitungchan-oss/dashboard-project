#!/usr/bin/env python3
"""Behavior tests for the manifest-driven month schema validator."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "validate_month_schema.py"


class ValidateMonthSchemaTests(unittest.TestCase):
    def run_validator(self, project: Path, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCRIPT), "--root", str(project), *args],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )

    def make_fixture(self) -> Path:
        temp_dir = Path(tempfile.mkdtemp(prefix="dashboard-schema-test-"))
        data_dir = temp_dir / "data"
        data_dir.mkdir()
        shutil.copytree(ROOT / "data" / "schema", data_dir / "schema")
        shutil.copy(ROOT / "data" / "202607.json", data_dir / "202607.json")
        shutil.copy(ROOT / "data" / "202604.json", data_dir / "202604.json")
        (data_dir / "months.json").write_text(
            json.dumps(
                {
                    "defaultMonth": "202607",
                    "months": [
                        {"key": "202607", "label": "2026年 07月", "schema": "current", "status": "ready"},
                        {"key": "202604", "label": "2026年 04月", "schema": "legacy", "status": "ready"},
                    ],
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        return temp_dir

    def test_existing_manifest_months_pass_strict_validation(self) -> None:
        result = self.run_validator(ROOT, "--all", "--strict-warnings")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("Months checked", result.stdout)

    def test_unknown_chart_or_insight_fields_are_allowed(self) -> None:
        project = self.make_fixture()
        try:
            month_path = project / "data" / "202607.json"
            data = json.loads(month_path.read_text(encoding="utf-8"))
            data["futureChartExperiment"] = {"labels": ["new"], "values": [1]}
            data["newInsightBlock"] = {"arbitrary": ["content"]}
            month_path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

            result = self.run_validator(project, "202607", "--strict-warnings")
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        finally:
            shutil.rmtree(project)

    def test_current_month_missing_required_root_field_fails(self) -> None:
        project = self.make_fixture()
        try:
            month_path = project / "data" / "202607.json"
            data = json.loads(month_path.read_text(encoding="utf-8"))
            data.pop("dashboardSummary", None)
            month_path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

            result = self.run_validator(project, "202607")
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("dashboardSummary", result.stdout)
        finally:
            shutil.rmtree(project)

    def test_legacy_missing_optional_field_warns_without_strict_mode(self) -> None:
        project = self.make_fixture()
        try:
            month_path = project / "data" / "202604.json"
            data = json.loads(month_path.read_text(encoding="utf-8"))
            data.pop("recordsInsights", None)
            month_path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

            result = self.run_validator(project, "202604")
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn("WARNING", result.stdout)

            strict_result = self.run_validator(project, "202604", "--strict-warnings")
            self.assertNotEqual(strict_result.returncode, 0)
        finally:
            shutil.rmtree(project)

    def test_manifest_missing_month_file_fails(self) -> None:
        project = self.make_fixture()
        try:
            manifest_path = project / "data" / "months.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["months"].append(
                {"key": "202608", "label": "2026年 08月", "schema": "current", "status": "ready"}
            )
            manifest_path.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")

            result = self.run_validator(project, "--all")
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("202608", result.stdout)
        finally:
            shutil.rmtree(project)


if __name__ == "__main__":
    unittest.main()
