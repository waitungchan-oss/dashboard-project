#!/usr/bin/env python3
"""Static contract checks for the dashboard PDF print layout."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INDEX_HTML = ROOT / "index.html"
APP_JS = ROOT / "app.js"


def require(text: str, needle: str, label: str) -> None:
    if needle not in text:
        raise AssertionError(f"Missing {label}: {needle}")


def main() -> None:
    index = INDEX_HTML.read_text(encoding="utf-8")
    app = APP_JS.read_text(encoding="utf-8")

    require(index, 'id="printReport"', "dedicated print report container")
    require(index, "#printReport", "print report CSS selector")
    require(index, ".print-page", "fixed print page CSS")
    require(index, "body.print-mode #report-content", "screen dashboard print toggle")
    require(app, "buildPrintReport", "print report builder")
    require(app, "captureChartImage", "chart snapshot helper")
    require(app, "toBase64Image", "Chart.js image export")
    require(app, "print-report-chart-image", "non-canvas chart image output")

    print("Print report static checks passed.")


if __name__ == "__main__":
    main()
