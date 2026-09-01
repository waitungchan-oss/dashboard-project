#!/usr/bin/env python3
"""Contract tests for schema validation in the Hermes runner."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path


SCRIPTS_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS_DIR))

from hermes_dashboard_check import BASE_COMMAND_CHECKS  # noqa: E402


class HermesSchemaContractTests(unittest.TestCase):
    def test_hermes_runs_manifest_driven_month_schema_validation(self) -> None:
        names = [name for name, _command, _node_optional in BASE_COMMAND_CHECKS]
        self.assertIn("validate_month_schema_all", names)

        command = next(command for name, command, _optional in BASE_COMMAND_CHECKS if name == "validate_month_schema_all")
        self.assertEqual(command, ["python3", "scripts/validate_month_schema.py", "--all", "--strict-warnings"])

    def test_hermes_runs_unified_monthly_governance(self) -> None:
        names = [name for name, _command, _node_optional in BASE_COMMAND_CHECKS]
        self.assertIn("validate_month_governance_all", names)

        command = next(command for name, command, _optional in BASE_COMMAND_CHECKS if name == "validate_month_governance_all")
        self.assertEqual(command, ["python3", "scripts/validate_month_governance.py", "--all", "--strict"])

    def test_github_actions_has_independent_governance_step(self) -> None:
        workflow = (SCRIPTS_DIR.parent / ".github" / "workflows" / "dashboard-validation.yml").read_text(
            encoding="utf-8"
        )

        self.assertIn("name: Run monthly data governance", workflow)
        self.assertIn("python3 scripts/validate_month_governance.py --all --strict", workflow)


if __name__ == "__main__":
    unittest.main()
