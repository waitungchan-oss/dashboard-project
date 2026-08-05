# Fix A Review

Status: APPROVED

Reviewed commit: `d0bc2b3` (`fix: remove legacy key driver fallback data`)

## Scope check

- Commit diff only touches:
  - `app.js`
  - `scripts/tests/test_p2_ux_contract.py`
  - `.superpowers/sdd/2026-08-05-p2-ux-improvement/fix-a-report.md`
- No `data/*.json` changes.
- No `index.html` changes.
- No unrelated tab files changed.

## Spec / report alignment

- Spec requires missing Key Driver data to show unavailable state and never fabricate fallback business points.
- Fix report states `202604` should clear ranked/list/detail/chart interaction and keep canonical months rendering.
- Repository data matches that assumption:
  - `data/202604.json` has no `npsCorrelationData`
  - `data/202605.json` has `npsCorrelationData` with 9 points

## Evidence

### 1. No fabricated ranked points / list / detail for legacy month

`app.js` removes the hard-coded fallback dataset and normalizes only canonical points from `DataStore.npsCorrelationData.points` ([app.js](/Users/chanwaitung2025/Downloads/.worktrees/dashboard-project-p2/app.js:1603)).

When no valid points exist, `renderNpsDriverUnavailableState()`:

- clears `npsDriverRankedPoints`
- resets `npsDriverIndexByName`
- clears `npsSelectedDriverName`
- writes the unavailable message into chart notice, list, detail, and legend

See [app.js](/Users/chanwaitung2025/Downloads/.worktrees/dashboard-project-p2/app.js:291) and [app.js](/Users/chanwaitung2025/Downloads/.worktrees/dashboard-project-p2/app.js:1620).

### 2. Stale selection / chart interaction clears on month switch

Month switch still runs `fetchMonthData()`, destroys old charts, then re-renders and re-initializes charts ([app.js](/Users/chanwaitung2025/Downloads/.worktrees/dashboard-project-p2/app.js:1112)).

For the NPS area specifically:

- `selectNpsDriver()` is a no-op when ranked points are empty ([app.js](/Users/chanwaitung2025/Downloads/.worktrees/dashboard-project-p2/app.js:1491))
- missing-data path empties selection state before chart init ([app.js](/Users/chanwaitung2025/Downloads/.worktrees/dashboard-project-p2/app.js:291))
- chart `onClick` returns early when there is no driver data ([app.js](/Users/chanwaitung2025/Downloads/.worktrees/dashboard-project-p2/app.js:1647))
- crosshair and datalabels are disabled when there is no driver data ([app.js](/Users/chanwaitung2025/Downloads/.worktrees/dashboard-project-p2/app.js:1659))

This is consistent with stale interactive state being cleared rather than reused across month changes.

### 3. Canonical months still render

When valid driver points exist, the code rebuilds ranked points, index map, default selection, legend, and selection sync path ([app.js](/Users/chanwaitung2025/Downloads/.worktrees/dashboard-project-p2/app.js:1615)).

Because `data/202605.json` still contains 9 canonical points and the render path is unchanged for `hasNpsDriverData === true`, canonical months keep the existing ranked-list / detail / tooltip behavior.

### 4. Focused tests and syntax check

Executed successfully:

- `python3 -m unittest scripts.tests.test_p2_ux_contract.P2UxContractTests.test_key_driver_does_not_fabricate_fallback_points scripts.tests.test_p2_ux_contract.P2UxContractTests.test_key_driver_has_unavailable_state_for_missing_legacy_data -v`
  - PASS
- `python3 -m unittest scripts.tests.test_p2_ux_contract -v`
  - PASS (`Ran 7 tests`)
- `node --check app.js`
  - PASS

Focused regression coverage added in [scripts/tests/test_p2_ux_contract.py](/Users/chanwaitung2025/Downloads/.worktrees/dashboard-project-p2/scripts/tests/test_p2_ux_contract.py:74).

## Notes

- I did not find evidence of data JSON changes or unrelated tab behavior edits in this commit.
- I did not run browser/Hermes validation because the request explicitly asked for focused contract tests plus `node --check`; approval here is based on diff inspection, data inspection, and those requested checks.
