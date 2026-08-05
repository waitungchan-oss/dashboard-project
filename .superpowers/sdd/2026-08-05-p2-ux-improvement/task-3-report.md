# Task 3 Report - P2 UX Feedback Search and Traceability

## Task

Implement only Task 3 for `dashboard-project` P2 UX:

- add keyword search for long feedback
- add result count / empty state
- preserve `tourNo` on every long-feedback card
- keep existing type / destination / leader filters and sentiment counts
- do not modify Key Driver, strategy, or any JSON data

## Changed files

- `index.html`
- `app.js`
- `scripts/tests/test_p2_ux_contract.py`

## Implementation summary

### `index.html`

- Added `#feedbackSearch` search input in the `#feedback_analysis` filter row
- Added clear button wired to `DashboardApp.clearFeedbackSearch()`
- Added `#feedbackResultCount` live status element
- Preserved existing `typeFilter`, `destFilter`, `leaderFilter`, `sentimentStatusBar`, and `feedbackGrid` ids

### `app.js`

- Extended `renderFeedbackFilters()` to reset the search input on month rebuild
- Added `clearFeedbackSearch()` helper
- Extended `filterFeedback()` to search across:
  - `dest`
  - `leader`
  - `tourNo`
  - `content`
- Kept existing type / destination / leader filter logic
- Kept the filtered array as the basis for sentiment counts and card rendering
- Added result count text for full / partial matches
- Added explicit empty state text when no records match
- Changed long-feedback card footer to always render traceability fields, including:
  - destination
  - leader
  - `tourNo`
- Added `data-feedback-field="tourNo"` hook
- Used escaped rendered values; did not derive `tourNo` from `content`

### `scripts/tests/test_p2_ux_contract.py`

- Added focused contract coverage for:
  - `feedbackSearch`
  - `feedbackResultCount`
  - `data-feedback-field="tourNo"`
  - `f.tourNo`

## TDD / verification record

### RED

Ran:

```sh
python3 -m unittest scripts.tests.test_p2_ux_contract.P2UxContractTests.test_feedback_markup_has_search_and_tour_number_hook -v
```

Result:

- FAIL as expected before implementation
- Missing `id="feedbackSearch"` in `index.html`

### GREEN / focused verification

Ran:

```sh
python3 -m unittest scripts.tests.test_p2_ux_contract.P2UxContractTests.test_feedback_markup_has_search_and_tour_number_hook -v
python3 -m unittest scripts.tests.test_p2_ux_contract -v
node --check app.js
python3 scripts/check_month_consistency.py --all --strict-warnings
```

Result:

- Focused Task 3 contract test: PASS
- Full `scripts.tests.test_p2_ux_contract`: PASS (`4` tests)
- `node --check app.js`: PASS
- `check_month_consistency.py --all --strict-warnings`: PASS for `202605`, `202607`, `202606`, `202604`

## JSON / scope boundary check

- No `data/*.json` files modified
- No Key Driver changes
- No strategic summary changes
- Existing feedback filter ids preserved

## Commit

- Commit hash: `f2a6cfb`
- Branch: `codex/p2-ux`

## Concerns / follow-up notes

- This task used focused contract and consistency checks only; no browser-level HTTP / Hermes validation was run in this implementation pass.
- Search currently performs case-insensitive substring matching on normalized strings and intentionally does not tokenize or fuzzy-match Chinese text beyond direct substring lookup.
