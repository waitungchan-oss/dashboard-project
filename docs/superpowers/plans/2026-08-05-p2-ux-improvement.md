# P2 改善使用體驗 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改變月份資料與既有 tab contract 的前提下，改善推薦意願、長評回饋與綜合意見三個 tab 的可讀性、查找效率與行動導向。

**Architecture:** 延續現有 Vanilla JS + Chart.js 架構。`index.html` 只承擔局部 markup、class 與控制項；`app.js` 承擔 Key Driver selection、長評搜尋／篩選與策略展開狀態；`data/*.json` 維持 canonical pure data。每個 tab 以獨立 commit 與獨立驗證收尾。

**Tech Stack:** HTML、Tailwind utility classes、原生 JavaScript、Chart.js、Python validation scripts、local HTTP server。

## Global Constraints

- 不修改 `data/months.json` 或任何 `data/YYYYMM.json` 的業務數字。
- 保留 `globalMonthSelector`、所有既有 tab ids、canvas ids、`printReport` 與 `PRINT_SECTION_MANIFEST`。
- 長評卡片必須保留 `rawFeedbacks[].tourNo`；缺少團號時顯示「團號：未提供」。
- 不在 JSON 加入 function、formatter、onClick、`=>` 或 Chart.js runtime logic。
- 每個 tab 的 production 改動分開提交；不可把其它 tab 的 UI 改動混進同一個 tab commit。
- 每個 task 完成後先跑對應測試，再進行完整 Hermes 驗收。
- 正式驗收必須使用 HTTP URL，不使用 `file://`。
- 完成所有 task 後，固定執行 Hermes read-only 驗收、Obsidian 回填，再按專案 Git 流程提交整合變更。

---

### Task 1: 建立 P2 UX contract 測試基礎

**Files:**
- Create: `scripts/tests/test_p2_ux_contract.py`
- Modify: none; the test module is run by the normal test discovery command and Hermes remains read-only

**Interfaces:**
- Consumes: `index.html`, `app.js`, `data/months.json`, all manifest month JSON files。
- Produces: deterministic static checks for tab-local UX contracts。

- [ ] **Step 1: Write the baseline contract tests**

建立 Python `unittest`，檢查：

```python
def test_no_production_tab_contract_removed():
    for token in REQUIRED_CONTRACTS:
        assert token in INDEX_HTML.read_text(encoding="utf-8") or token in APP_JS.read_text(encoding="utf-8")

def test_manifest_month_files_are_present_and_json_parseable():
    catalog = json.loads((ROOT / "data/months.json").read_text(encoding="utf-8"))
    for month in catalog["months"]:
        json.loads((ROOT / "data" / f"{month['key']}.json").read_text(encoding="utf-8"))
```

- [ ] **Step 2: Run the baseline tests**

Run:

```sh
python3 -m unittest scripts.tests.test_p2_ux_contract -v
```

Expected: PASS for the existing DOM and manifest contracts. New P2-specific assertions are introduced together with their corresponding tab implementation, so no committed baseline test suite is intentionally left red.

- [ ] **Step 3: Add only the reusable test helpers**

Implement path constants, UTF-8 file loading, manifest month discovery and the existing DOM/canvas contract allowlist. Do not add production code in this step.

- [ ] **Step 4: Run the test module again**

Run the same command and confirm the baseline tests pass.

- [ ] **Step 5: Commit the passing test baseline**

```sh
git add scripts/tests/test_p2_ux_contract.py
git commit -m "test: define P2 dashboard UX contracts"
```

### Task 2: P2-1 推薦意願專區 Key Driver 可讀性

**Files:**
- Modify: `index.html` near `#nps_zone` and existing `npsCorrelationChart` canvas
- Modify: `app.js` near the Key Driver chart initialization around the `npsCorrelationChart` builder
- Test: `scripts/tests/test_p2_ux_contract.py`

**Interfaces:**
- Consumes: `DataStore.npsCorrelationData`, existing point fields `item`, `x`, `y`, `recommendationCorrelation` and existing quadrant threshold。
- Produces: `#npsDriverList`, `#npsDriverDetail`, `DashboardApp.selectNpsDriver(name)` and bidirectional chart/list highlight。

- [ ] **Step 1: Extend failing contract tests**

Add assertions for:

```python
assert 'id="npsDriverList"' in html
assert 'id="npsDriverDetail"' in html
assert "selectNpsDriver" in source
assert "npsDriverList" in source
```

- [ ] **Step 2: Run the focused test to verify the current implementation is missing the contract**

```sh
python3 -m unittest scripts.tests.test_p2_ux_contract.P2UxContractTests.test_key_driver_has_ranked_list_hook -v
```

Expected: FAIL before the markup and renderer changes, then PASS after Steps 3–5.

- [ ] **Step 3: Add ranked list markup beside the chart**

Keep `canvas#npsCorrelationChart` unchanged. Add a responsive two-column wrapper and a stable list container with columns for service item, average satisfaction, importance, and zone. Do not remove the canvas id or existing print container.

- [ ] **Step 4: Add the minimal selection renderer**

Create one function with the exact behavior:

```js
DashboardApp.selectNpsDriver = function(name) {
    // find the canonical point by item name
    // toggle active state on list row and chart point
    // update #npsDriverDetail with x, y, recommendationCorrelation and action note
};
```

Use Chart.js active element APIs or a small chart plugin hook already available in `app.js`; do not recompute quadrant values in the UI.

- [ ] **Step 5: Remove only collision-prone full labels**

Change the chart datalabel formatter to display a short rank marker or no full text, while preserving the tooltip with the complete service name and all three values. The ranked list is the canonical visible label surface.

- [ ] **Step 6: Run focused checks**

```sh
python3 -m unittest scripts.tests.test_p2_ux_contract.P2UxContractTests.test_key_driver_has_ranked_list_hook -v
node --check app.js
```

Expected: PASS.

- [ ] **Step 7: Commit this tab only**

```sh
git add index.html app.js scripts/tests/test_p2_ux_contract.py
git commit -m "feat: improve key driver readability"
```

### Task 3: P2-2 出團長評回饋搜尋、篩選與團號追溯

**Files:**
- Modify: `index.html` near `#feedback_analysis`, filter controls and `#feedbackGrid`
- Modify: `app.js` in `renderFeedbackFilters()` and `filterFeedback()`
- Test: `scripts/tests/test_p2_ux_contract.py`

**Interfaces:**
- Consumes: `DataStore.rawFeedbacks[]` with `dest`, `leader`, `tourNo`, `type`, `content`。
- Produces: `#feedbackSearch`, `#feedbackResultCount`, searchable filtered cards, and explicit `data-feedback-field="tourNo"` markup。

- [ ] **Step 1: Add failing tests for search and tour number**

Add assertions:

```python
assert 'id="feedbackSearch"' in html
assert 'id="feedbackResultCount"' in html
assert 'data-feedback-field="tourNo"' in source
assert "feedbackSearch" in source
assert "f.tourNo" in source
```

- [ ] **Step 2: Run focused test to verify the current implementation is missing the contract**

```sh
python3 -m unittest scripts.tests.test_p2_ux_contract.P2UxContractTests.test_feedback_markup_has_search_and_tour_number_hook -v
```

Expected: FAIL before the search and tour-number changes, then PASS after Steps 3–6.

- [ ] **Step 3: Add search control and result status**

Add an accessible search input with `id="feedbackSearch"`, a clear button using a familiar close icon, and a result status with `id="feedbackResultCount"`. Keep existing `typeFilter`, `destFilter`, and `leaderFilter` ids.

- [ ] **Step 4: Extend filtering without changing the data source**

Update `filterFeedback()` to normalize one search string and match it against `dest`, `leader`, `tourNo`, and `content`. Keep existing type/destination/leader matching. The filtered array remains the only input for both the sentiment bar and card rendering.

- [ ] **Step 5: Render the complete traceability header**

Render every card with escaped values for type, destination, leader, and:

```js
const tourLabel = f.tourNo ? f.tourNo : '未提供';
```

Add `data-feedback-field="tourNo"` to the tour-number element so static and browser checks can confirm it is present. Never parse a tour number out of `content` to overwrite `f.tourNo`.

- [ ] **Step 6: Rebuild filter options on month change and reset stale values**

Use the existing `renderFeedbackFilters()` flow. After rebuilding each select, preserve the value only when it exists in the new month; otherwise reset to `all`. Reset the search input when the month changes.

- [ ] **Step 7: Run focused checks**

```sh
python3 -m unittest scripts.tests.test_p2_ux_contract.P2UxContractTests.test_feedback_markup_has_search_and_tour_number_hook -v
node --check app.js
python3 scripts/check_month_consistency.py --all --strict-warnings
```

Expected: PASS; no JSON file changes.

- [ ] **Step 8: Commit this tab only**

```sh
git add index.html app.js scripts/tests/test_p2_ux_contract.py
git commit -m "feat: make long feedback searchable and traceable"
```

### Task 4: P2-3 綜合意見摘要與展開收合

**Files:**
- Modify: `index.html` inside `#analysis`
- Modify: `app.js` only if the existing month render path needs to reapply the default open state
- Test: `scripts/tests/test_p2_ux_contract.py`

**Interfaces:**
- Consumes: existing analysis section content rendered for the selected month。
- Produces: stable `details`/summary hooks for three strategy blocks and the comprehensive recommendation block。

- [ ] **Step 1: Add failing structure tests**

Assert that `#analysis` contains explicit hooks:

```python
assert 'data-ux="strategy-section"' in html
assert 'data-ux="strategy-summary"' in html
assert 'data-ux="strategy-detail"' in html
```

- [ ] **Step 2: Run focused test to verify the current implementation is missing the contract**

```sh
python3 -m unittest scripts.tests.test_p2_ux_contract.P2UxContractTests.test_strategy_sections_have_summary_and_detail_hooks -v
```

Expected: FAIL before the disclosure markup, then PASS after Steps 3–4.

- [ ] **Step 3: Convert only the strategy sub-sections to accessible disclosure blocks**

Keep the existing text and values. Use native `<details>` and `<summary>` or equivalent buttons with `aria-expanded` and `aria-controls`. The first operational-pain section is open by default; product, growth and comprehensive recommendation sections are initially closed.

- [ ] **Step 4: Preserve month render behavior**

Verify that switching months does not duplicate the blocks. If `app.js` rebuilds `#analysis`, apply the default state after rebuild without copying content from another month.

- [ ] **Step 5: Run focused checks**

```sh
python3 -m unittest scripts.tests.test_p2_ux_contract.P2UxContractTests.test_strategy_sections_have_summary_and_detail_hooks -v
node --check app.js
```

Expected: PASS.

- [ ] **Step 6: Commit this tab only**

```sh
git add index.html app.js scripts/tests/test_p2_ux_contract.py
git commit -m "feat: make strategic recommendations collapsible"
```

### Task 5: Cross-tab screen, print and month verification

**Files:**
- Modify: `scripts/tests/test_p2_ux_contract.py` only if a discovered contract needs an explicit regression assertion
- No production data changes

**Interfaces:**
- Consumes: completed Tasks 1–4 and manifest months from `data/months.json`。
- Produces: verification evidence and a Hermes-ready working tree。

- [ ] **Step 1: Run all static and schema checks**

```sh
python3 scripts/validate_dashboard.py
python3 scripts/check_month_consistency.py --all --strict-warnings
python3 scripts/check_print_report_static.py
python3 scripts/check_screen_layout_static.py
python3 scripts/validate_month_schema.py --all --strict-warnings
node --check app.js
python3 -m unittest discover -s scripts/tests -v
```

Expected: all required checks pass; legacy warnings are reported but not hidden.

- [ ] **Step 2: Run HTTP resource checks**

Start the project server with:

```sh
DASHBOARD_NO_BROWSER=1 python3 serve.py
```

Check HTTP 200 and `Cache-Control: no-store` for `/index.html`, `/app.js`, `/data/months.json`, `/data/202604.json`, `/data/202605.json`, `/data/202606.json`, and `/data/202607.json`, then stop the server.

- [ ] **Step 3: Perform browser checks at desktop and mobile widths**

Verify for 2026-04, 2026-05, 2026-06 and 2026-07:

```text
nps_zone: nine items readable, selection syncs, no overlap
feedback_analysis: search by VKAC works, tourNo remains visible, count matches cards
analysis: summary visible, details expand/collapse, no duplicate blocks after tab switch
```

- [ ] **Step 4: Verify print output**

Use the existing `列印 PDF` flow. Confirm Key Driver remains legible, long-feedback pages include the tour number, and normal screen layout is not replaced by print markup.

- [ ] **Step 5: Run Hermes read-only acceptance**

```sh
python3 scripts/hermes_dashboard_check.py --json
```

Expected: PASS, or an explicitly documented WARN for a known environment limitation. Hermes must not modify files.

- [ ] **Step 6: Backfill Obsidian**

Create a Dashboard Project Knowledge backfill note using the required headings:

```markdown
## 修改目的
## 修改檔案
## 驗證命令與結果
## 是否影響核心邊界
## Hermes 驗收結果
## 後續觀察點
## 是否需要 ADR / Incident
```

Include the three tab boundaries, the preserved `tourNo` contract, Hermes result and final commit hashes.

- [ ] **Step 7: Record verification and Obsidian backfill**

Write the required backfill note directly at:

```text
/Users/chanwaitung2025/Documents/Obsidian Vault/Dashboard_Project_Knowledge/70_Codex_Briefs/2026-08-05 P2 UX 改善回填.md
```

The Obsidian note is outside this Git repository and must not be staged into the dashboard repo. The implementation commits from Tasks 2–4 plus the final verification evidence are the Git record; do not add a new untracked report directory solely for this backfill.

## Execution Order

Execute Tasks 1–5 sequentially. Tasks 2, 3 and 4 are intentionally separate because each changes a different tab and must be reviewable independently. Do not start the next tab until the current tab's focused test and `node --check app.js` pass.

## Definition of Done

- All P2 contract tests and existing validation scripts pass.
- HTTP and browser verification cover all manifest months.
- Long feedback retains `tourNo` in screen and print output.
- No production JSON or unrelated tab data changed.
- Hermes read-only result is recorded.
- Obsidian backfill is complete before final Git integration.
