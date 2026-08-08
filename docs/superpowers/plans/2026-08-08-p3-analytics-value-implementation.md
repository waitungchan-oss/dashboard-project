# P3 分析價值提升 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 在維持 portable JSON-only 架構的前提下，新增月份比較、營運問題追蹤與客戶價值鏈路三個獨立 tab，並建立可驗證、可持續更新、日後可替換 API/database provider 的 P3 derived analysis layer。

**Architecture:** 既有 data/YYYYMM.json 繼續負責單月 dashboard raw/derived display data；新增 data/p3/monthly/YYYYMM.json 保存標準化 P3 snapshot，data/p3/issues.json 保存跨月份 issue register。前端透過 JsonP3DataProvider 載入 P3 資料，純比較、篩選與展示邏輯分別放在 provider、comparison helper 和三個 renderer，避免把 P3 交叉計算散落在 app.js。

**Tech Stack:** Vanilla JavaScript ES modules、Chart.js 既有 runtime、純 JSON、Python 3 validation、Node.js syntax/test runner、既有 HTTP serve.py、GitHub Actions、Hermes read-only checks。

## Global Constraints

- 維持 Portable JSON-only；本計畫不引入 database、API、登入、權限或即時同步。
- 不修改既有 data/202604.json legacy raw fields，也不把 P3 欄位硬塞入既有月份 JSON。
- P3 使用 data/p3/monthly/YYYYMM.json、data/p3/issues.json；所有 JSON 只放純資料。
- 保留所有既有 tab id、canvas id、月份 selector、print manifest 與既有 tab 行為。
- P3 新 tab 必須各自有獨立 DOM id、資料容器與 renderer，不把內容混入其他 tab。
- 不在 P3 UI 由邊際比例推導未觀察的聯合轉化人數；無聯合資料必須顯示 partial 或 unavailable。
- 所有新增資料必須有 source reference、月份、樣本口徑與 calculation note。
- 所有 dashboard 驗收使用 HTTP server，不使用 file://。
- 每個 task 完成後執行其局部測試並建立獨立 commit；不可覆蓋 backups/ 或 prototypes/。
- 正式收尾順序固定為：驗證通過 -> Hermes read-only 驗收 -> Obsidian 回填 -> Git stage/commit。
- 不因 P3 順便進行 P1 CDN 離線化、Vue/React 遷移或全面 app.js 重寫。

---

## File Map

### Data and schemas

- Create: data/p3/monthly/202604.json through data/p3/monthly/202607.json — normalized P3 snapshots; 202604 may have partial/unavailable fields but must not mutate legacy source.
- Create: data/p3/issues.json — stable cross-month issue register for shopping, hotel, dining and ground service.
- Create: data/schema/p3-month.schema.json — JSON shape and allowed enum contract for monthly P3 snapshots.
- Create: data/schema/p3-issues.schema.json — issue register schema.
- Modify: data/months.json — add p3.path and p3.status per manifest entry.
- Modify: data/schema/manifest.schema.json — validate optional P3 metadata.

### Validation and Hermes

- Create: scripts/validate_p3.py — read-only manifest, schema, arithmetic, reference and cross-month validation.
- Create: scripts/tests/test_p3_contract.py — validator behavior tests using temporary fixtures.
- Create: scripts/tests/test_p3_provider.mjs — provider/comparison pure-function tests using Node built-in assert.
- Modify: scripts/hermes_dashboard_check.py — run validate_p3.py --all --strict-warnings as required read-only check.
- Modify: .github/workflows/dashboard-validation.yml — run P3 validation and provider tests.
- Modify: DASHBOARD_HERMES_MONITORING.md — document P3 validation output and failure boundaries.

### Frontend

- Create: js/p3-data-provider.js — JSON provider, snapshot normalization and comparison diff builder.
- Create: js/p3-renderers.js — renderer functions for comparison, issue tracker and customer value chain; no fetch and no global DataStore mutation.
- Modify: app.js — initialize provider, load P3 snapshots, wire month selectors, tab refresh and print integration.
- Modify: index.html — add three tab buttons and independent tab containers; preserve existing contracts.
- Create: scripts/tests/test_p3_frontend_contract.py — static DOM/import/print contract checks.
- Test: existing screen/print static checkers remain read-only regression gates; no checker source change is planned.

### Documentation and operational handoff

- Modify: MONTHLY_DATA_IMPORT.md — add P3 monthly snapshot and issue update procedure.
- Modify: SYSTEM_MAP.md — mark P3 scope and completed P3 data layer accurately.
- Modify: DASHBOARD_PROJECT_HANDOFF.md — add P3 provider, validation and tab boundaries.
- Modify: Obsidian Dashboard Project 系統總覽.md, 驗證命令與測試矩陣.md, Hermes Monitoring Contract.md — backfill design, validation and closeout receipt after implementation.

---

## Task 1: Add P3 manifest metadata and JSON schemas

**Files:**
- Create: data/schema/p3-month.schema.json
- Create: data/schema/p3-issues.schema.json
- Modify: data/schema/manifest.schema.json
- Modify: data/months.json
- Test: scripts/tests/test_p3_contract.py

**Interfaces:**
- Manifest P3 entry:
    {
      "p3": {
        "status": "ready",
        "path": "p3/monthly/202607.json"
      }
    }
- P3 month status enum: complete, partial, unavailable.
- Issue enums: category shopping/hotel/dining/ground_service; priority low/medium/high; status open/monitoring/resolved.

- [ ] Step 1: Write failing schema contract tests.
  Create temporary fixtures using the unittest style from test_validate_month_schema.py. Assert that the four P3 schema files are present, parse as JSON objects, expose the required root properties, and that the manifest fixture can carry a p3 object without changing current/legacy fields.

- [ ] Step 2: Run the focused test to verify the schema files are absent.
  Run:
    python3 -m unittest scripts.tests.test_p3_contract -v
  Expected: FAIL because the P3 schema files do not exist.

- [ ] Step 3: Define the schemas.
  p3-month.schema.json requires version, period, sampleSize, metrics, branchRanking, destinationDemand, sentiment, customerValueChain, sourceRefs and calculationNotes. Metric objects require value, unit, n and definition. Branch and destination rows require stable keys. Sentiment rows require key, label, count and rate. Customer chain requires status, stages, links and unavailable.
  p3-issues.schema.json requires version and issue fields id, category, title, ownerDepartment, priority, status, recommendedAction, trackingMetrics, firstSeenMonth, lastSeenMonth, monthlySnapshots and sourceRefs.
  Extend manifest.schema.json with optional p3.status and p3.path while keeping current/legacy entries valid when P3 is absent.

- [ ] Step 4: Add P3 metadata to all manifest months.
  Add a P3 metadata object with status unavailable for 202604, 202605, 202606 and 202607 before the snapshot files exist. Task 2 changes each entry to ready only after its snapshot exists. Do not change month schema, status, label or description.

- [ ] Step 5: Run schema and JSON parsing checks.
  Run:
    python3 -m unittest scripts.tests.test_p3_contract -v
    python3 -m json.tool data/months.json >/dev/null
    python3 -m json.tool data/schema/p3-month.schema.json >/dev/null
    python3 -m json.tool data/schema/p3-issues.schema.json >/dev/null
  Expected: PASS.

- [ ] Step 6: Commit.
    git add data/months.json data/schema/manifest.schema.json data/schema/p3-month.schema.json data/schema/p3-issues.schema.json scripts/tests/test_p3_contract.py
    git commit -m "feat: define P3 analysis data contracts"

---

## Task 2: Create derived P3 monthly snapshots and issue register

**Files:**
- Create: data/p3/monthly/202604.json
- Create: data/p3/monthly/202605.json
- Create: data/p3/monthly/202606.json
- Create: data/p3/monthly/202607.json
- Create: data/p3/issues.json
- Test: scripts/tests/test_p3_contract.py

**Interfaces:**
- Consumes existing monthly files through documented keys; do not edit source monthly JSON.
- Produces snapshots satisfying p3-month.schema.json.
- Produces issue IDs ISSUE-SHOPPING-001, ISSUE-HOTEL-001, ISSUE-DINING-001 and ISSUE-GROUND-SERVICE-001.
- Each sourceRefs item contains month, section and stable recordKey or documented path.

- [ ] Step 1: Add source-reference fixture tests.
  Reject a snapshot whose file month and period disagree, a source reference pointing to an unlisted month, an issue firstSeenMonth later than lastSeenMonth, and duplicate issue IDs.

- [ ] Step 2: Build each snapshot from observed source fields.
  Use dashboardSummary for sampleSize, the documented NPS summary for nps, valid 10-point average data for overall_satisfaction, branchLeaderboardData for branchRanking, futureDestData for destinationDemand, rawFeedbacks and explicit sentiment labels for sentiment, and observed member/recommendation/consent/customer segment data for customerValueChain stages.
  Use unavailable for missing 202604 fields and for July repeat-purchase linkage when no joint source exists. Never infer a joint conversion count from independent percentages.

- [ ] Step 3: Create the four initial issue records.
  Seed shopping from shopping schedule/time/transparency feedback; hotel from room/location/breakfast/hardware feedback; dining from taste/portion/meal quality feedback; ground_service from local guide communication/pressure/safety/response feedback.
  Each issue must have an owner department, priority, status, recommended action, at least one tracking metric, first/last observed month, monthly snapshots and source references. Do not add claims that cannot be located in a monthly source field.

- [ ] Step 4: Run fixture, schema and JSON tests.
  Run:
    python3 -m unittest scripts.tests.test_p3_contract -v
    for file in data/p3/monthly/*.json data/p3/issues.json; do python3 -m json.tool "$file" >/dev/null || exit 1; done
  Expected: PASS.

- [ ] Step 5: Commit.
    git add data/p3
    git commit -m "feat: add P3 monthly snapshots and issue register"

---

## Task 3: Implement P3 validator and wire CI/Hermes

**Files:**
- Create: scripts/validate_p3.py
- Modify: scripts/hermes_dashboard_check.py
- Modify: .github/workflows/dashboard-validation.yml
- Modify: scripts/tests/test_p3_contract.py
- Test: scripts/tests/test_p3_contract.py

**Interfaces:**
- CLI: python3 scripts/validate_p3.py --all --strict-warnings
- CLI: python3 scripts/validate_p3.py 202607 --json
- Output fields: status, checkedMonths, errors, warnings.
- Hermes check name: validate_p3_all.

- [ ] Step 1: Write failing validator tests.
  Cover all manifest P3 snapshots passing; missing P3 path failing; period mismatch failing; invalid issue enum failing; duplicate issue ID failing; non-numeric branch score failing; metric count/rate mismatch failing; partial chain with explicit unavailable reasons passing; strict warnings returning non-zero.

- [ ] Step 2: Run the focused test to verify failure.
    python3 -m unittest scripts.tests.test_p3_contract -v
  Expected: FAIL because scripts/validate_p3.py is absent.

- [ ] Step 3: Implement read-only validation.
  Implement validate_p3(root: Path, selected_months: list[str] | None) -> ValidationReport. Load data/months.json, select one or all manifest months, load P3 schemas, resolve manifest paths without guessing alternates, validate the issue register once, validate period/references/enums/duplicates/arithmetic, and never modify JSON.

- [ ] Step 4: Add validator to Hermes and GitHub Actions.
  Add python3 scripts/validate_p3.py --all --strict-warnings before dashboard rendering checks in scripts/hermes_dashboard_check.py and .github/workflows/dashboard-validation.yml. Hermes reports failures and never remediates.

- [ ] Step 5: Run focused and existing checks.
    python3 -m unittest scripts.tests.test_p3_contract -v
    python3 -m unittest scripts.tests.test_hermes_schema_contract -v
    python3 scripts/validate_p3.py --all --strict-warnings
    python3 scripts/hermes_dashboard_check.py --json
  Expected: all pass and Hermes JSON includes a successful validate_p3_all check.

- [ ] Step 6: Commit.
    git add scripts/validate_p3.py scripts/tests/test_p3_contract.py scripts/hermes_dashboard_check.py .github/workflows/dashboard-validation.yml
    git commit -m "feat: validate P3 analysis layer in CI and Hermes"

---

## Task 4: Implement JsonP3DataProvider and comparison diff builder

**Files:**
- Create: js/p3-data-provider.js
- Create: scripts/tests/test_p3_provider.mjs
- Modify: app.js
- Test: scripts/tests/test_p3_provider.mjs

**Interfaces:**
- Export createJsonP3DataProvider({ basePath, getMonthEntry, fetchImpl }).
- getMonthEntry(monthKey) returns the normalized manifest entry containing the P3 path.
- Provider methods:
    loadP3Month(monthKey)
    loadP3Issues()
    loadP3MonthComparison(baseMonth, compareMonth)
- Export pure buildP3Comparison(baseSnapshot, compareSnapshot).
- Comparison output includes baseMonth, compareMonth, metrics, branchRanking, destinationDemand, sentiment and customerValueChain.
- Row statuses are exactly both, added, removed and unavailable.

- [ ] Step 1: Write failing Node tests.
  Using Node built-in assert, test manifest-path request, month-key error on failed response, metric delta as compare.value minus base.value, stable-key alignment for branches/destinations, added/removed statuses, and unavailable customer chain without fabricated links.

- [ ] Step 2: Run the test to verify failure.
    node scripts/tests/test_p3_provider.mjs
  Expected: FAIL because js/p3-data-provider.js is absent.

- [ ] Step 3: Implement provider.
  Use injected fetchImpl with cache no-store and the configured path. Normalize only structural defaults; never alter metric values or definitions. Return structured errors for missing files and malformed JSON.

- [ ] Step 4: Implement comparison diff.
  Implement buildP3Comparison(baseSnapshot, compareSnapshot). Calculate metric delta as compare.value - base.value; omit percentage delta when base is zero/unavailable; align branch/destination/sentiment rows by key; preserve customer chain status and unavailable reasons.

- [ ] Step 5: Integrate provider lifecycle into app.js.
  Instantiate one provider during initialization and keep P3 state separate from DataStore. On month changes refresh the active P3 tab and retain a clear unavailable state when a P3 path is absent. Do not change fetchMonthData or existing tab renderers.

- [ ] Step 6: Run tests and syntax.
    node scripts/tests/test_p3_provider.mjs
    node --check app.js
  Expected: PASS.

- [ ] Step 7: Commit.
    git add js/p3-data-provider.js scripts/tests/test_p3_provider.mjs app.js
    git commit -m "feat: add P3 JSON provider and comparison model"

---

## Task 5: Build the standalone 月份比較 tab

**Files:**
- Modify: index.html
- Create or modify: js/p3-renderers.js
- Modify: app.js
- Modify: scripts/tests/test_p3_frontend_contract.py
- Test: scripts/tests/test_p3_provider.mjs

**Interfaces:**
- Export renderP3Comparison(container, comparison, options).
- Export renderP3ComparisonUnavailable(container, message).
- New ids: p3_comparison, p3BaseMonthSelector, p3CompareMonthSelector, p3ComparisonStatus, p3MetricCards, p3BranchComparison, p3DestinationComparison, p3SentimentComparison.

- [ ] Step 1: Write failing static contract tests.
  Assert the new tab button, p3_comparison, both selectors, comparison containers, renderer import and print-manifest entry exist. Assert existing tab IDs remain unchanged.

- [ ] Step 2: Run static tests to verify failure.
    python3 -m unittest scripts.tests.test_p3_frontend_contract -v
  Expected: FAIL because the tab and renderer contract are absent.

- [ ] Step 3: Add tab shell and controls.
  Add a new tab button and standalone section. Use existing CSS conventions, stable responsive dimensions, accessible labels and an aria-live status region.

- [ ] Step 4: Implement renderer.
  Render metric cards with base/compare/delta/unit/sample/definition; branch table with rank/score/sample deltas; destination table with count/rate/rank deltas; sentiment comparison with total and category counts/rates. Show added, removed and unavailable states visibly. Escape data text and do not add business calculations beyond provider output.

- [ ] Step 5: Wire selectors and refresh.
  Populate selectors from MonthCatalog.months. Prevent selecting the same month. On either change call loadP3MonthComparison and render loading/error states without changing globalMonthSelector. Refresh the active P3 tab after global month changes.

- [ ] Step 6: Run checks.
    python3 -m unittest scripts.tests.test_p3_frontend_contract -v
    node --check app.js
    python3 scripts/check_screen_layout_static.py
  Expected: PASS.

- [ ] Step 7: Commit.
    git add index.html js/p3-renderers.js app.js scripts/tests/test_p3_frontend_contract.py
    git commit -m "feat: add monthly comparison tab"

---

## Task 6: Build the standalone 營運問題追蹤 tab

**Files:**
- Modify: index.html
- Modify: js/p3-renderers.js
- Modify: app.js
- Modify: scripts/tests/test_p3_frontend_contract.py
- Test: scripts/tests/test_p3_provider.mjs

**Interfaces:**
- Export filterP3Issues(issues, filters).
- Export renderP3IssueTracker(container, issues, filters).
- Export renderP3IssueTrackerUnavailable(container, message).
- New ids: p3_issue_tracker, p3IssueCategoryFilter, p3IssueDepartmentFilter, p3IssueStatusFilter, p3IssuePriorityFilter, p3IssueGrid, p3IssueResultCount.

- [ ] Step 1: Add failing issue renderer tests.
  Test category shopping filtering, open status filtering, no-filter full result, incomplete issue omission with validation error visibility, and rendered department/action/tracking metric fields.

- [ ] Step 2: Run tests to verify failure.
    node scripts/tests/test_p3_provider.mjs
  Expected: FAIL because issue renderer/filter functions are absent.

- [ ] Step 3: Add tab shell and local filters.
  Add a separate tab and four filters. Keep issue filter state local; do not reuse tabFilterMenu, filterCheckboxes or raw feedback filter state.

- [ ] Step 4: Implement issue cards.
  Show stable issue ID/title, category/priority/status, owner department, evidence/source month, recommended action, tracking metrics with value/target when available, first seen and last observed month. Escape all data text and show explicit empty/error states.

- [ ] Step 5: Wire issue loading and filters.
  Load data/p3/issues.json once through the provider and filter locally. A register failure affects only this tab. Global month changes update current observation labels but do not delete cross-month issues.

- [ ] Step 6: Run checks and commit.
    node scripts/tests/test_p3_provider.mjs
    python3 -m unittest scripts.tests.test_p3_frontend_contract -v
    node --check app.js
  Expected: PASS.
    git add index.html js/p3-renderers.js app.js scripts/tests/test_p3_frontend_contract.py
    git commit -m "feat: add operational issue tracker tab"

---

## Task 7: Build the standalone 客戶價值鏈路 tab

**Files:**
- Modify: index.html
- Modify: js/p3-renderers.js
- Modify: app.js
- Modify: scripts/tests/test_p3_frontend_contract.py
- Test: scripts/tests/test_p3_provider.mjs

**Interfaces:**
- Export getP3CustomerValueChainViewModel(snapshot).
- Export renderP3CustomerValueChain(container, snapshot).
- Export renderP3CustomerValueChainUnavailable(container, message).
- New ids: p3_customer_value_chain, p3ValueChainMonthSelector, p3ValueChainStatus, p3ValueChainStages, p3ValueChainLinks, p3ValueChainUnavailable.

- [ ] Step 1: Add failing value-chain tests.
  Test complete chain rendering, partial chain with unavailable notice, unavailable chain with no fabricated link, repeat_customer not being labeled repeat_purchase, and sourceRefs being required for links.

- [ ] Step 2: Run tests to verify failure.
    node scripts/tests/test_p3_provider.mjs
  Expected: FAIL because the value-chain renderer is absent.

- [ ] Step 3: Add tab shell and month control.
  Add a separate tab with manifest-backed month selector and a status banner distinguishing complete, partial and unavailable.

- [ ] Step 4: Implement honest chain rendering.
  Render observed stages and only supplied links. Show exact unavailable reasons and source limitations. Distinguish recommendation intention, long-feedback sentiment, member status, message consent, repeat customer segment and verified future repurchase.

- [ ] Step 5: Wire global month changes and isolation.
  Refresh the chain when the selected P3 month changes. Missing P3 data shows unavailable in this tab and leaves existing tabs usable.

- [ ] Step 6: Run checks and commit.
    node scripts/tests/test_p3_provider.mjs
    python3 -m unittest scripts.tests.test_p3_frontend_contract -v
    node --check app.js
    git add index.html js/p3-renderers.js app.js scripts/tests/test_p3_frontend_contract.py
    git commit -m "feat: add customer value chain tab"

---

## Task 8: Integrate print, screen layout and accessibility contracts

**Files:**
- Modify: app.js
- Modify: index.html
- Test: existing print/screen static checkers as read-only regression gates
- Modify: scripts/tests/test_p3_frontend_contract.py
- Test: check_print_report_static.py, check_screen_layout_static.py

- [ ] Step 1: Add failing print/layout assertions.
  Assert all three P3 tabs have data-print-title, PRINT_SECTION_MANIFEST includes all three IDs, P3 containers remain hidden when another tab is active, print uses existing print-page flow, selectors have accessible labels and status regions use aria-live.

- [ ] Step 2: Run checks to verify missing integration.
    python3 scripts/check_print_report_static.py
    python3 scripts/check_screen_layout_static.py
    python3 -m unittest scripts.tests.test_p3_frontend_contract -v
  Expected: P3-specific assertions fail before integration.

- [ ] Step 3: Add print manifest entries and layout rules.
  Add print specs for monthly comparison, issue tracker and customer value chain using existing static/chunk helpers. Do not expose interactive controls as the only print content. Add responsive CSS only in existing scoped sections.

- [ ] Step 4: Run static checks and HTTP smoke test.
  Run:
    python3 scripts/check_print_report_static.py
    python3 scripts/check_screen_layout_static.py
    DASHBOARD_NO_BROWSER=1 python3 serve.py
  In a separate shell request index.html, app.js, js/p3-data-provider.js, data/p3/monthly/202607.json and data/p3/issues.json with curl -fsS. Stop the server after checks. Expected: HTTP 200 and no background server remains.

- [ ] Step 5: Commit.
    git add app.js index.html scripts/check_print_report_static.py scripts/check_screen_layout_static.py scripts/tests/test_p3_frontend_contract.py
    git commit -m "test: cover P3 screen and print contracts"

---

## Task 9: Update monthly SOP, system map and Obsidian handoff

**Files:**
- Modify: MONTHLY_DATA_IMPORT.md
- Modify: SYSTEM_MAP.md
- Modify: DASHBOARD_PROJECT_HANDOFF.md
- Modify: Obsidian Dashboard Project 系統總覽.md
- Modify: Obsidian 驗證命令與測試矩陣.md
- Modify: Obsidian Hermes Monitoring Contract.md
- Test: documentation grep and final validation commands

- [ ] Step 1: Document the P3 monthly workflow.
  Document:
    1. Clean and verify monthly source data.
    2. Create/update data/YYYYMM.json without changing legacy semantics.
    3. Create data/p3/monthly/YYYYMM.json.
    4. Update data/p3/issues.json when an issue appears or changes.
    5. Update data/months.json p3 path/status.
    6. Run validate_month_schema.py, validate_p3.py and check_month_consistency.py.
    7. Run Hermes and HTTP/UI checks before commit.

- [ ] Step 2: Document boundaries.
  State that base monthly JSON is single-month data; P3 JSON is comparison/issue/value-chain data; unavailable is not zero; issue IDs persist; no API/database is introduced.

- [ ] Step 3: Backfill Obsidian.
  Use required fields:
    ## 修改目的
    ## 修改檔案
    ## 驗證命令與結果
    ## 是否影響核心邊界
    ## Hermes 驗收結果
    ## 後續觀察點
    ## 是否需要 ADR / Incident
  Record the P3 spec, implementation commits, final command output and partial/unavailable metrics.

- [ ] Step 4: Run documentation consistency checks.
    rg -n "data/p3|validate_p3.py|P3DataProvider|月份比較|營運問題追蹤|客戶價值鏈路" MONTHLY_DATA_IMPORT.md SYSTEM_MAP.md DASHBOARD_PROJECT_HANDOFF.md
  Expected: all three documents describe the same paths and commands.

- [ ] Step 5: Commit.
    git add MONTHLY_DATA_IMPORT.md SYSTEM_MAP.md DASHBOARD_PROJECT_HANDOFF.md
    git commit -m "docs: document P3 monthly analysis workflow"

---

## Task 10: Run full verification and prepare review

**Files:**
- Read-only: all project files
- Test: existing validation suite, P3 tests, HTTP and Hermes

- [ ] Step 1: Run unit and contract tests.
    python3 -m unittest discover -s scripts/tests -p 'test_*.py' -v
    node scripts/tests/test_p3_provider.mjs
    node --check app.js
  Expected: all pass.

- [ ] Step 2: Run all data and static validators.
    python3 scripts/validate_month_schema.py --all --strict-warnings
    python3 scripts/validate_p3.py --all --strict-warnings
    python3 scripts/validate_dashboard.py
    python3 scripts/check_month_consistency.py --all --strict-warnings
    python3 scripts/check_print_report_static.py
    python3 scripts/check_screen_layout_static.py
    python3 -m json.tool data/months.json >/dev/null
  Expected: all commands exit 0.

- [ ] Step 3: Run Hermes read-only acceptance.
    python3 scripts/hermes_dashboard_check.py --json
  Expected: overall PASS including validate_p3_all, with no production file changes.

- [ ] Step 4: Run HTTP resource and month smoke checks.
  Start DASHBOARD_NO_BROWSER=1 python3 serve.py. Request index.html, app.js, all imported JS modules, data/months.json, all four P3 monthly files and data/p3/issues.json. Through the local HTTP URL verify:
  - 202604 shows honest partial/unavailable state;
  - a 202605 versus 202606 comparison renders;
  - issue filters work;
  - customer chain shows partial/unavailable where applicable;
  - switching back to existing tabs preserves content;
  - print report includes P3 sections.
  Stop the server after verification.

- [ ] Step 5: Inspect final Git boundary.
    git status --short --branch
    git diff --stat
    git log --oneline --decorate -12
  Confirm only P3 implementation, tests and documentation are included. Preserve unrelated backups/ and prototypes/ changes.

- [ ] Step 6: Request code review before merge.
  Review findings must prioritize fabricated or misaligned metrics, month leakage, issue source/reference errors, cross-tab regression, print/layout breakage and missing unavailable states.

- [ ] Step 7: Final closeout.
  After review is resolved: rerun full verification, rerun Hermes, backfill Obsidian with final commit hash/results, stage and commit only approved P3 changes, then push/create PR only after local verification is green.
