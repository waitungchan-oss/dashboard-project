#!/usr/bin/env python3
"""Static checks for normal screen layout isolation from PDF/alternate layouts."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INDEX_HTML = ROOT / "index.html"


def require(text: str, needle: str, label: str) -> None:
    if needle not in text:
        raise AssertionError(f"Missing {label}: {needle}")


def main() -> None:
    index = INDEX_HTML.read_text(encoding="utf-8")

    require(index, "Normal screen dashboard layout guard", "screen layout guard comment")
    require(index, "@media screen and (min-width: 1024px)", "desktop screen guard media query")
    require(index, "#tabFilterContainer::before", "sidebar pseudo element neutralizer")
    require(index, "position: static !important", "normal navigation positioning")
    require(index, "body:not(.print-mode) #printReport", "print report hidden outside print mode")

    print("Screen layout static checks passed.")


if __name__ == "__main__":
    main()
