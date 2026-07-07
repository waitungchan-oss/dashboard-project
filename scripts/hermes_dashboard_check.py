#!/usr/bin/env python3
"""Read-only Hermes validation runner for dashboard-project.

This script intentionally does not modify production dashboard files. It gathers
Git state, runs existing validators, checks JSON / frontend contracts, starts the
local HTTP server, verifies static resources, then stops the server.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
MANIFEST_PATH = DATA_DIR / "months.json"
MONTH_KEY_RE = re.compile(r"^\d{6}$")
FORBIDDEN_TOKENS = ("function", "formatter", "onClick", "=>")
VALID_SCHEMAS = {"current", "legacy"}

BASE_COMMAND_CHECKS: list[tuple[str, list[str], bool]] = [
    ("validate_dashboard", ["python3", "scripts/validate_dashboard.py"], False),
    ("check_month_consistency_all", ["python3", "scripts/check_month_consistency.py", "--all", "--strict-warnings"], False),
    ("check_print_report_static", ["python3", "scripts/check_print_report_static.py"], False),
    ("check_screen_layout_static", ["python3", "scripts/check_screen_layout_static.py"], False),
    ("node_check_app_js", ["node", "--check", "app.js"], True),
    ("json_tool_months", ["python3", "-m", "json.tool", "data/months.json"], False),
]

BASE_HTTP_PATHS = [
    "/index.html",
    "/app.js",
    "/js/dom-utils.js",
    "/js/csv-export.js",
    "/js/dashboard-utils.js",
    "/data/months.json",
]

REQUIRED_INDEX_IDS = [
    "globalMonthSelector",
    "printReport",
    "tabFilterContainer",
    "tabFilterMenu",
    "filterCheckboxes",
    "dashboard",
    "sales_forecast",
    "nps_zone",
    "tourleader",
    "records",
    "feedback_analysis",
    "branch_feedback",
    "analysis",
    "genderChart",
    "ageChart",
    "memberConsentCrossChart",
    "satisfactionChart",
    "destAgeCrossChart",
    "sourceChart",
    "channelChart",
    "salesForecastChart",
    "rfmChart",
    "satisfactionCrossChart",
    "npsCorrelationChart",
    "topDestChart",
    "durationDistChart",
    "futureDestChart",
    "npsDistChart",
    "npsScoreChart",
]

REQUIRED_APP_TOKENS = [
    "PRINT_SECTION_MANIFEST",
    "printReport: async function",
    "fetchMonthCatalog",
    "fetchMonthData",
]


@dataclass
class Check:
    name: str
    status: str
    detail: str = ""
    command: str | None = None
    exitCode: int | None = None
    stdout: str = ""
    stderr: str = ""


@dataclass
class Report:
    overallStatus: str = "pass"
    checks: list[dict[str, Any]] = field(default_factory=list)
    git: dict[str, Any] = field(default_factory=dict)
    commands: list[dict[str, Any]] = field(default_factory=list)
    http: dict[str, Any] = field(default_factory=lambda: {"server": {}, "checks": []})
    boundaryChecks: dict[str, Any] = field(default_factory=dict)
    findings: list[dict[str, str]] = field(default_factory=list)
    recommendation: str = "accept"

    def add_check(self, check: Check) -> None:
        item: dict[str, Any] = {
            "name": check.name,
            "status": check.status,
            "detail": check.detail,
        }
        if check.command is not None:
            item["command"] = check.command
        if check.exitCode is not None:
            item["exitCode"] = check.exitCode
        if check.stdout:
            item["stdout"] = trim(check.stdout)
        if check.stderr:
            item["stderr"] = trim(check.stderr)
        self.checks.append(item)
        if check.status == "fail":
            self.overallStatus = "fail"
        elif check.status == "warn" and self.overallStatus == "pass":
            self.overallStatus = "warn"

    def finding(self, level: str, message: str) -> None:
        self.findings.append({"level": level, "message": message})
        if level == "FAIL":
            self.overallStatus = "fail"
        elif level == "WARN" and self.overallStatus == "pass":
            self.overallStatus = "warn"

    def finalize(self) -> None:
        if self.overallStatus == "fail":
            self.recommendation = "block; request Codex follow-up before accepting changes"
        elif self.overallStatus == "warn":
            self.recommendation = "accept with noted warnings if they match project policy"
        else:
            self.recommendation = "accept; monitoring checks passed"


def trim(text: str, limit: int = 4000) -> str:
    text = text.strip()
    if len(text) <= limit:
        return text
    return text[:limit] + "\n... [trimmed]"


def run(cmd: list[str], timeout: int = 60) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env.setdefault("PYTHONDONTWRITEBYTECODE", "1")
    return subprocess.run(
        cmd,
        cwd=ROOT,
        text=True,
        capture_output=True,
        timeout=timeout,
        env=env,
        check=False,
    )


def run_git(args: list[str]) -> subprocess.CompletedProcess[str]:
    return run(["git", *args], timeout=30)


def collect_git(report: Report) -> None:
    root = run_git(["rev-parse", "--show-toplevel"])
    branch = run_git(["branch", "--show-current"])
    head = run_git(["rev-parse", "HEAD"])
    status = run_git(["status", "--short", "--branch"])
    diff_stat = run_git(["diff", "--stat"])

    report.git = {
        "repoRoot": root.stdout.strip() if root.returncode == 0 else None,
        "branch": branch.stdout.strip() if branch.returncode == 0 else None,
        "head": head.stdout.strip() if head.returncode == 0 else None,
        "statusShortBranch": status.stdout.strip(),
        "diffStat": diff_stat.stdout.strip(),
        "gitAvailable": root.returncode == 0,
    }
    report.add_check(Check("git_state", "pass" if root.returncode == 0 else "fail", report.git["statusShortBranch"]))


def manifest_month_keys(manifest: dict[str, Any] | None) -> list[str]:
    if not isinstance(manifest, dict) or not isinstance(manifest.get("months"), list):
        return []
    keys: list[str] = []
    seen: set[str] = set()
    for item in manifest["months"]:
        if not isinstance(item, dict):
            continue
        key = item.get("key")
        if isinstance(key, str) and MONTH_KEY_RE.match(key) and key not in seen:
            seen.add(key)
            keys.append(key)
    return keys


def build_command_checks(manifest: dict[str, Any] | None) -> list[tuple[str, list[str], bool]]:
    commands = list(BASE_COMMAND_CHECKS)
    for month_key in manifest_month_keys(manifest):
        commands.append((f"json_tool_{month_key}", ["python3", "-m", "json.tool", f"data/{month_key}.json"], False))
    return commands


def build_http_paths(manifest: dict[str, Any] | None) -> list[str]:
    paths = list(BASE_HTTP_PATHS)
    paths.extend(f"/data/{month_key}.json" for month_key in manifest_month_keys(manifest))
    return paths


def run_command_checks(report: Report, manifest: dict[str, Any] | None) -> None:
    for name, cmd, node_optional in build_command_checks(manifest):
        command_str = " ".join(cmd)
        if node_optional and shutil.which(cmd[0]) is None:
            detail = "node command not found; node --check app.js was not executed"
            entry = {"name": name, "command": command_str, "status": "warn", "detail": detail}
            report.commands.append(entry)
            report.add_check(Check(name, "warn", detail, command_str))
            report.finding("WARN", detail)
            continue
        try:
            proc = run(cmd, timeout=90)
            stdout = proc.stdout
            # json.tool emits full JSON to stdout; report only success/failure.
            if name.startswith("json_tool_") and proc.returncode == 0:
                stdout = "JSON parsed successfully."
            status = "pass" if proc.returncode == 0 else "fail"
            detail = "passed" if proc.returncode == 0 else "failed"
            entry = {
                "name": name,
                "command": command_str,
                "status": status,
                "exitCode": proc.returncode,
                "stdout": trim(stdout),
                "stderr": trim(proc.stderr),
            }
            report.commands.append(entry)
            report.add_check(Check(name, status, detail, command_str, proc.returncode, stdout, proc.stderr))
            if proc.returncode != 0:
                report.finding("FAIL", f"Command failed: {command_str}")
        except subprocess.TimeoutExpired as exc:
            detail = f"command timed out after {exc.timeout}s"
            report.commands.append({"name": name, "command": command_str, "status": "fail", "detail": detail})
            report.add_check(Check(name, "fail", detail, command_str))
            report.finding("FAIL", f"Command timed out: {command_str}")


def load_manifest(report: Report) -> dict[str, Any] | None:
    try:
        return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        report.finding("FAIL", f"Cannot parse data/months.json: {exc}")
        report.add_check(Check("manifest_parse", "fail", str(exc)))
        return None


def check_json_purity(report: Report, manifest: dict[str, Any] | None) -> None:
    paths = [MANIFEST_PATH]
    if isinstance(manifest, dict) and isinstance(manifest.get("months"), list):
        for item in manifest["months"]:
            if isinstance(item, dict) and isinstance(item.get("key"), str):
                paths.append(DATA_DIR / f"{item['key']}.json")

    failures: list[str] = []
    checked: list[str] = []
    for path in paths:
        rel = path.relative_to(ROOT).as_posix()
        if not path.exists():
            failures.append(f"{rel} missing")
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        checked.append(rel)
        for token in FORBIDDEN_TOKENS:
            if token in text:
                failures.append(f"{rel} contains forbidden token {token!r}")
    status = "fail" if failures else "pass"
    report.boundaryChecks["jsonPurity"] = {"status": status, "checked": checked, "failures": failures}
    report.add_check(Check("json_purity", status, "; ".join(failures) if failures else f"checked {len(checked)} JSON files"))
    for failure in failures:
        report.finding("FAIL", failure)


def check_manifest_contract(report: Report, manifest: dict[str, Any] | None) -> None:
    failures: list[str] = []
    warnings: list[str] = []
    month_keys: list[str] = []

    if not isinstance(manifest, dict):
        failures.append("manifest must be a JSON object")
    else:
        default_month = manifest.get("defaultMonth")
        months = manifest.get("months")
        if not isinstance(default_month, str) or not MONTH_KEY_RE.match(default_month):
            failures.append("defaultMonth must be YYYYMM")
        if not isinstance(months, list):
            failures.append("months must be an array")
        else:
            seen: set[str] = set()
            for idx, item in enumerate(months):
                if not isinstance(item, dict):
                    failures.append(f"months[{idx}] must be object")
                    continue
                key = item.get("key")
                schema = item.get("schema")
                if not isinstance(key, str) or not MONTH_KEY_RE.match(key):
                    failures.append(f"months[{idx}].key must be YYYYMM")
                    continue
                if key in seen:
                    failures.append(f"duplicate month key: {key}")
                seen.add(key)
                month_keys.append(key)
                if schema not in VALID_SCHEMAS:
                    failures.append(f"{key} schema must be current or legacy")
                if not (DATA_DIR / f"{key}.json").exists():
                    failures.append(f"data/{key}.json is missing")
            if isinstance(default_month, str) and default_month not in seen:
                failures.append(f"defaultMonth {default_month} is not listed in months[]")
            if not month_keys:
                warnings.append("months[] is empty")

    status = "fail" if failures else "warn" if warnings else "pass"
    report.boundaryChecks["manifest"] = {
        "status": status,
        "monthKeys": month_keys,
        "failures": failures,
        "warnings": warnings,
    }
    detail = "; ".join(failures + warnings) if failures or warnings else f"months={', '.join(month_keys)}"
    report.add_check(Check("manifest_contract", status, detail))
    for failure in failures:
        report.finding("FAIL", failure)
    for warning in warnings:
        report.finding("WARN", warning)


def has_id(text: str, element_id: str) -> bool:
    return re.search(rf"\bid\s*=\s*(['\"])" + re.escape(element_id) + r"\1", text) is not None


def check_frontend_contract(report: Report) -> None:
    failures: list[str] = []
    index = (ROOT / "index.html").read_text(encoding="utf-8", errors="replace")
    app = (ROOT / "app.js").read_text(encoding="utf-8", errors="replace")

    for element_id in REQUIRED_INDEX_IDS:
        if not has_id(index, element_id):
            failures.append(f"index.html missing id={element_id}")

    for token in REQUIRED_APP_TOKENS:
        if token not in app:
            failures.append(f"app.js missing token: {token}")

    # The external contract is DashboardApp.printReport(). In current source this
    # is represented as a printReport method on the DashboardApp object.
    if "window.DashboardApp" not in app or "printReport" not in app:
        failures.append("app.js missing DashboardApp.printReport contract")

    status = "fail" if failures else "pass"
    report.boundaryChecks["frontendContract"] = {
        "status": status,
        "requiredIndexIds": REQUIRED_INDEX_IDS,
        "requiredAppTokens": REQUIRED_APP_TOKENS,
        "failures": failures,
    }
    report.add_check(Check("frontend_dom_js_contract", status, "; ".join(failures) if failures else "required DOM ids and JS tokens exist"))
    for failure in failures:
        report.finding("FAIL", failure)


def start_server_and_check_http(report: Report, manifest: dict[str, Any] | None) -> None:
    env = os.environ.copy()
    env["DASHBOARD_NO_BROWSER"] = "1"
    env["PYTHONUNBUFFERED"] = "1"
    proc = subprocess.Popen(
        ["python3", "serve.py"],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env=env,
    )
    output_lines: list[str] = []
    url: str | None = None
    try:
        deadline = time.time() + 10
        assert proc.stdout is not None
        while time.time() < deadline:
            line = proc.stdout.readline()
            if line:
                output_lines.append(line.rstrip())
                match = re.search(r"Open URL:\s*(http://127\.0\.0\.1:\d+/index\.html)", line)
                if match:
                    url = match.group(1)
                    break
            elif proc.poll() is not None:
                break
            else:
                time.sleep(0.05)

        if not url:
            remaining = "\n".join(output_lines)
            report.http["server"] = {"status": "fail", "output": remaining, "pid": proc.pid}
            report.add_check(Check("http_server_start", "fail", "could not read Open URL from serve.py output"))
            report.finding("FAIL", "HTTP server did not provide Open URL")
            return

        base = url.removesuffix("/index.html")
        report.http["server"] = {"status": "pass", "url": url, "pid": proc.pid, "output": "\n".join(output_lines)}
        report.add_check(Check("http_server_start", "pass", url))

        failures: list[str] = []
        http_paths = build_http_paths(manifest)
        for path in http_paths:
            target = base + path
            item: dict[str, Any] = {"path": path, "url": target}
            try:
                request = urllib.request.Request(target, method="GET")
                with urllib.request.urlopen(request, timeout=10) as response:
                    body = response.read(512)
                    item.update(
                        {
                            "status": response.status,
                            "contentType": response.headers.get("Content-Type"),
                            "cacheControl": response.headers.get("Cache-Control"),
                            "bytesSampled": len(body),
                            "result": "pass" if response.status == 200 else "fail",
                        }
                    )
                    if response.status != 200:
                        failures.append(f"{path} returned HTTP {response.status}")
                    if response.headers.get("Cache-Control") != "no-store":
                        failures.append(f"{path} missing Cache-Control: no-store")
            except (urllib.error.URLError, TimeoutError) as exc:
                item.update({"result": "fail", "error": str(exc)})
                failures.append(f"{path} request failed: {exc}")
            report.http["checks"].append(item)

        status = "fail" if failures else "pass"
        report.add_check(Check("http_resource_checks", status, "; ".join(failures) if failures else f"checked {len(http_paths)} resources"))
        for failure in failures:
            report.finding("FAIL", failure)
    finally:
        if proc.poll() is None:
            proc.send_signal(signal.SIGINT)
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait(timeout=5)
        report.http["server"]["stopped"] = proc.poll() is not None


def render_human(report: Report) -> str:
    lines = [
        "# Hermes Dashboard Project Report",
        "",
        f"Status: {report.overallStatus.upper()}",
        f"Repo: {ROOT}",
        f"Branch: {report.git.get('branch')}",
        f"HEAD: {report.git.get('head')}",
        f"URL: {report.http.get('server', {}).get('url', 'not started')}",
        "",
        "## Git",
        f"- repo root: {report.git.get('repoRoot')}",
        f"- status: {report.git.get('statusShortBranch', '').replace(chr(10), ' / ')}",
        f"- diff stat: {report.git.get('diffStat') or '(empty)'}",
        "",
        "## Commands Run",
    ]
    for command in report.commands:
        lines.append(f"- [{command['status'].upper()}] {command['command']}")
        if command.get("stdout"):
            lines.append(f"  stdout: {command['stdout'].splitlines()[0]}")
        if command.get("stderr"):
            lines.append(f"  stderr: {command['stderr'].splitlines()[0]}")

    lines.extend(["", "## HTTP Checks"])
    server = report.http.get("server", {})
    lines.append(f"- server: {server.get('status')} {server.get('url', '')}; stopped={server.get('stopped')}")
    for item in report.http.get("checks", []):
        lines.append(
            f"- [{item.get('result', 'unknown').upper()}] {item.get('path')} "
            f"status={item.get('status')} content-type={item.get('contentType')} cache-control={item.get('cacheControl')}"
        )

    lines.extend(["", "## Boundary Checks"])
    for name, item in report.boundaryChecks.items():
        lines.append(f"- {name}: {item.get('status')}")
        for failure in item.get("failures", []):
            lines.append(f"  - FAIL: {failure}")
        for warning in item.get("warnings", []):
            lines.append(f"  - WARN: {warning}")

    lines.extend(["", "## Findings"])
    if report.findings:
        for finding in report.findings:
            lines.append(f"- [{finding['level']}] {finding['message']}")
    else:
        lines.append("- No findings.")

    lines.extend(["", "## Recommendation", f"- {report.recommendation}"])
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run read-only Hermes dashboard checks.")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON report.")
    args = parser.parse_args()

    report = Report()
    collect_git(report)
    manifest = load_manifest(report)
    run_command_checks(report, manifest)
    check_json_purity(report, manifest)
    check_manifest_contract(report, manifest)
    check_frontend_contract(report)
    start_server_and_check_http(report, manifest)
    report.finalize()

    payload = {
        "overallStatus": report.overallStatus,
        "checks": report.checks,
        "git": report.git,
        "commands": report.commands,
        "http": report.http,
        "boundaryChecks": report.boundaryChecks,
        "findings": report.findings,
        "recommendation": report.recommendation,
    }

    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print(render_human(report))
    return 1 if report.overallStatus == "fail" else 0


if __name__ == "__main__":
    sys.exit(main())
