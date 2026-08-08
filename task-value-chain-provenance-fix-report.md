# P3 Customer Value-Chain Provenance Fix

## Scope

- Added non-empty stage-level `sourceRefs` to the 202604, 202605, 202606, and 202607 P3 snapshots.
- Used observed base paths for promoter count, promo consent, store signup, member-consent rows, and repeat customer segments where present.
- Kept 202607 without a repeat stage because `customerSegments` is absent.
- Strengthened the P3 month schema and validator for stage fields and provenance.
- Made the customer value-chain view model/rendering fail closed for stages without valid same-month source references.
- Added focused schema, validator, and renderer regression coverage.

## Verification

- `python3 -m unittest discover -s scripts/tests -p 'test_p3*.py'`: 41 passed.
- `node --test scripts/tests/test_p3_provider.mjs`: 19 passed.
- `python3 scripts/validate_p3.py --all --strict-warnings --json`: PASS; 0 errors, 0 warnings.
- `python3 scripts/validate_month_schema.py --all --strict-warnings`: PASS.
- `python3 scripts/validate_dashboard.py`: PASS.
- `python3 scripts/check_month_consistency.py --all --strict-warnings`: PASS.
- `node --check app.js`: PASS.
- `python3 scripts/check_print_report_static.py`: PASS.
- `python3 scripts/check_screen_layout_static.py`: PASS.
- `python3 scripts/hermes_dashboard_check.py --json`: PASS; HTTP checks passed and server stopped.
- `git diff --check`: PASS.
- Changed JSON snapshots and schema parse successfully with `python3 -m json.tool`.

## Boundary

- No Obsidian files were modified.
- `task-6-report.md` was not modified or removed.
- No unrelated tabs or documentation were changed.
