# P3 Tab Navigation Regression Report

## Observed state

After the three P3 tabs were added, desktop tab buttons could shrink inside the flex navigation container. The existing `.tab-btn` rules also used `min-width: 0` and `overflow: hidden`, allowing labels to be clipped.

## Scoped fix

- Added a focused static contract for the desktop navigation container and buttons.
- Constrained the desktop tab container to its available width while keeping horizontal scrolling enabled.
- Preserved intrinsic button width and disabled button clipping in the desktop screen-only scope.
- Kept mobile rules, existing tab IDs, print layout, data files, `app.js`, Obsidian, and unrelated worktree files unchanged.

## Verification

- `python3 -m unittest scripts/tests/test_p3_frontend_contract.py` -> 17 tests passed.
- `python3 scripts/check_screen_layout_static.py` -> passed.
- `python3 scripts/check_print_report_static.py` -> passed.
- `node --check app.js` -> passed.
- `git diff --check` -> passed.

## Boundary note

Obsidian backfill was intentionally not performed because the task explicitly forbids Obsidian changes.

## Commit

Commit message: `fix: preserve P3 tab navigation labels`
