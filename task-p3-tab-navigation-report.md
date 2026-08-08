# P3 Tab Navigation Regression Report

## Observed state

After the three P3 tabs were added, desktop tab buttons could shrink inside the flex navigation container. The existing `.tab-btn` rules also used `min-width: 0` and `overflow: hidden`, allowing labels to be clipped.

## Scoped fix

- Strengthened the focused static contract by extracting the exact `@media screen and (min-width: 1024px)` block with balanced CSS braces.
- Asserted all three P3 navigation buttons and their visible labels: `月份比較`, `營運問題追蹤`, and `客戶價值鏈路`.
- Asserted the desktop container and button rules within that exact block.
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

Commit message: `test: strengthen P3 tab navigation contract`
