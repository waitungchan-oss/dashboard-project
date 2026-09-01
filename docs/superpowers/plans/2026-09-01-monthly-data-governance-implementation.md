# 8 月月份資料治理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立一個不修改來源資料、可檢查候選月份與全 manifest 月份的治理 gate，阻擋月份錯置、口徑不一致與合法數字被吞後才進入 commit / PR。

**Architecture:** 保留現有 `data/YYYYMM.json`、`data/months.json`、current / legacy schema 與 P3 derived layer。新增可讀取的 monthly metric contract、共用治理 finding/report model、候選月份 CLI，以及 numeric/display contract；既有 schema、consistency、P3 與 Hermes 檢查繼續各自負責，統一 CLI 只做編排與結果匯總。

**Tech Stack:** Python 3.12 standard library、JSON Schema-like project schemas、Vanilla JavaScript、Chart.js、GitHub Actions、HTTP server、Hermes read-only checks、unittest / Node test。

**Spec:** `docs/superpowers/specs/2026-09-01-monthly-data-governance-design.md`

## Global Constraints

- 不引入 database、API 或正式 backend。
- 不由 validator 自動修改來源數字或 JSON。
- 不把未知值補成 0。
- 不重建 `202604` legacy 資料，也不把 P3 欄位塞回 base monthly JSON。
- 不把 Chart.js config、formatter、event handler 或 rendering logic 放入 JSON。
- 不改動與 8 月資料治理無關的 tab、DOM contract 或既有 production 資料。
- Hermes 只能讀取、執行檢查與報告，不得修資料、改 manifest 或留下 fixture。
- 所有正式修改完成後，依序完成驗證、Hermes read-only acceptance、Obsidian 回填，再進行 Git stage / commit。
- 保留現有 `backups/`、`prototypes/` 與其他 unrelated dirty changes。

---

## File Map

### 新增

- `data/schema/monthly-metric-contract.json`：穩定核心 metric 的來源 path、metric class、分母、計算關係、四捨五入容許值與缺失資料政策。
- `scripts/month_governance.py`：共用 finding、report、JSON path、百分比解析與 contract loader，不執行檔案修改。
- `scripts/check_month_metrics.py`：依 metric contract 檢查 N、count、percentage、情緒、keyword、排行榜與 P3 對應關係。
- `scripts/check_numeric_display_contract.py`：檢查 numeric field、chart series、table rows 及 frontend data binding。
- `scripts/validate_month_governance.py`：候選月份／全 manifest 統一入口、exit code 與 JSON report。
- `scripts/tests/test_month_governance.py`：共用 model、月份錯置、metric contract 與治理報告測試。
- `scripts/tests/test_numeric_display_contract.py`：合法數字遺失、陣列長度、fallback 與 frontend binding 測試。
- `scripts/tests/test_documentation_contract.py`：確認月更 SOP、Hermes 文件與 handoff 使用新的治理命令與判讀規則。
- `scripts/tests/fixtures/month-governance-sentinel.json`：非業務資料的非零 sentinel fixture，不加入正式 manifest。

### 修改

- `scripts/validate_month_schema.py`：增加候選 JSON path 與指定 schema profile 的可重用驗證入口。
- `scripts/check_month_consistency.py`：抽出可重用的 data-level API，支援候選檔，並把明確單月錯置從 warning 升級為 error。
- `scripts/hermes_dashboard_check.py`：加入 manifest-wide monthly governance command check。
- `.github/workflows/dashboard-validation.yml`：在 PR / main pipeline 加入 governance gate。
- `scripts/tests/test_validate_month_schema.py`：覆蓋候選月份與 profile 行為。
- `scripts/tests/test_hermes_schema_contract.py`：覆蓋 Hermes 的 governance command contract。
- `MONTHLY_DATA_IMPORT.md`：加入 202608 候選檔 preflight、metric class、report 與 gate 流程。
- `DASHBOARD_HERMES_MONITORING.md`：記錄治理 command、read-only 邊界與報告判讀。
- `DASHBOARD_PROJECT_HANDOFF.md`：更新目前治理能力與 8 月導入順序。

### 實作完成後回填

- `/Users/chanwaitung2025/Documents/Obsidian Vault/Dashboard_Project_Knowledge/10_System/Dashboard Project 系統總覽.md`
- `/Users/chanwaitung2025/Documents/Obsidian Vault/Dashboard_Project_Knowledge/40_Testing/驗證命令與測試矩陣.md`
- `/Users/chanwaitung2025/Documents/Obsidian Vault/Dashboard_Project_Knowledge/60_Hermes/Hermes Monitoring Contract.md`
- `/Users/chanwaitung2025/Documents/Obsidian Vault/Dashboard_Project_Knowledge/70_Codex_Briefs/2026-09-01-8月資料治理導入 Brief.md`

---

### Task 1: 建立共用治理 finding 與 metric contract

**Files:**
- Create: `data/schema/monthly-metric-contract.json`
- Create: `scripts/month_governance.py`
- Create: `scripts/tests/test_month_governance.py`

**Interfaces:**
- Consumes: monthly JSON object、`data/months.json` month key、metric contract JSON。
- Produces: `Finding(rule_id, severity, month, path, message, evidence)`、`GovernanceReport`、`resolve_json_path(data, path)`、`parse_percentage(value)`、`load_metric_contract(path)`。

- [ ] **Step 1: Write failing tests for the report model and contract loader**

  在 `scripts/tests/test_month_governance.py` 建立測試，確認：

  ```python
  finding = Finding(
      rule_id="MONTH-001",
      severity="ERROR",
      month="202608",
      path="$.dashboardSummary.totalRespondents",
      message="month mismatch",
      evidence={"expected": "202608", "actual": "202607"},
  )
  assert finding.to_dict()["evidence"]["actual"] == "202607"
  assert resolve_json_path({"dashboardSummary": {"totalRespondents": 105}},
                           "dashboardSummary.totalRespondents") == 105
  assert parse_percentage("44.76%") == 44.76
  ```

  同時測試 contract 必須包含以下穩定 metric：

  - `dashboardSummary.totalRespondents`
  - `dashboardSummary.promoConsent.count` / `pct`
  - `dashboardSummary.nps.promoterCount` / `detractorCount` / `promoterPct` / `npsPct`
  - `dashboardSummary.storeSignup.count` / `pct` / `pureCount` / `purePct`
  - `sourceData.values` / `pcts`
  - `channelData.values` / `pcts`
  - `npsDistData.values`
  - `satisfactionDistributionData.datasets[].data`
  - `branchLeaderboardData[].n` / `branchLeaderboardTotal`
  - `rawFeedbacks`, `branchRawFeedbacks`, `feedbackKeywordCloud[].count`

- [ ] **Step 2: Run the focused tests and verify they fail**

  Run:

  ```sh
  python3 -m unittest scripts.tests.test_month_governance -v
  ```

  Expected: FAIL because the shared module and contract do not exist.

- [ ] **Step 3: Add the contract and shared report primitives**

  `monthly-metric-contract.json` 的每個 metric entry 必須包含 `id`、`path`、
  `metricClass`、`denominator` 或 `denominatorPath`、`rule`、`tolerance` 與
  `missingPolicy`。`branchLeaderboardTotal` 必須明確使用 `surveyN` 或
  `branchN` semantic，不可依欄位名稱猜測。

  `scripts/month_governance.py` 必須：

  - 只讀取 JSON，不寫入任何資料檔。
  - 對 rule id、severity (`ERROR`, `WARN`, `INFO`)、month、path 與 evidence 提供穩定欄位。
  - 對不存在 path 回傳明確 finding，不把缺失值轉成 0。
  - 對 `unavailable` 保存原因，不把它當成錯誤數字。

- [ ] **Step 4: Run the focused tests and inspect the contract**

  Run:

  ```sh
  python3 -m unittest scripts.tests.test_month_governance -v
  python3 -m json.tool data/schema/monthly-metric-contract.json >/dev/null
  ```

  Expected: PASS，且 contract 只包含純 JSON 資料與規則字串，沒有 function、Chart.js config 或 event handler。

- [ ] **Step 5: Commit the self-contained contract layer**

  ```sh
  git add data/schema/monthly-metric-contract.json scripts/month_governance.py scripts/tests/test_month_governance.py
  git commit -m "feat: define monthly data governance contracts"
  ```

---

### Task 2: 支援候選月份與嚴格月份一致性檢查

**Files:**
- Modify: `scripts/validate_month_schema.py:149-250`
- Modify: `scripts/check_month_consistency.py:94-423`
- Modify: `scripts/tests/test_validate_month_schema.py`
- Modify: `scripts/tests/test_month_governance.py`

**Interfaces:**
- Consumes: `--month YYYYMM`、`--candidate PATH`、current / legacy schema profile。
- Produces: `validate_candidate(root, candidate_path, month, schema_profile)`、`check_month_data(data, month, source_label)`，並保留既有 `--all` 與單月 CLI 行為。

- [ ] **Step 1: Add failing tests for candidate validation and month mismatch severity**

  測試 temporary project：

  - 候選 `202608` JSON 尚未加入 `data/months.json`，仍可指定 `--candidate` 驗證。
  - 候選資料摘要寫「2026 年 7 月」時，finding rule id 為 `MONTH-001` 且 severity 為 `ERROR`。
  - `rawFeedbacks[].content` 內提到 7 月時，不產生 `MONTH-001` error。
  - `202604` 仍使用 legacy optional-field warning，不因 current 欄位缺失而 error。

- [ ] **Step 2: Run the focused tests and verify they fail**

  ```sh
  python3 -m unittest scripts.tests.test_validate_month_schema scripts.tests.test_month_governance -v
  ```

  Expected: FAIL because candidate path API and structured month findings are not available。

- [ ] **Step 3: Implement candidate loading without manifest mutation**

  在 `validate_month_schema.py` 增加 `--candidate PATH` 與 `--schema-profile current|legacy`，
  要求 candidate 同時提供 `--month YYYYMM`。candidate mode 直接載入指定檔案，使用
  selected profile，不把暫存月份加入 `data/months.json`。

  在 `check_month_consistency.py` 把現有單月檢查抽成：

  ```python
  def check_month_data(
      data: dict[str, Any],
      month: str,
      source_label: str,
  ) -> ConsistencyReport:
      ...
  ```

  `check_month()` 改為載入後呼叫此 API；`--all` 仍只依 manifest month keys 執行。

- [ ] **Step 4: Implement explicit wrong-month classification**

  `check_wrong_month_text()` 保留 raw feedback allowlist，對摘要、洞察、subtitle、
  table description、metadata 與 P3 period 的同年非當月文字產生 `MONTH-001 ERROR`。
  每筆 finding 必須保存 path、expected month、actual phrase 與 snippet。跨月份比較只
  在明確 historical / comparison path 產生 `INFO`。

- [ ] **Step 5: Run candidate and full-month tests**

  ```sh
  python3 -m unittest scripts.tests.test_validate_month_schema scripts.tests.test_month_governance -v
  python3 scripts/check_month_consistency.py --all --strict-warnings
  ```

  Expected: focused tests PASS；現有 manifest 月份沒有新增 error，`202604` legacy 語義保持不變。

- [ ] **Step 6: Commit the candidate and month consistency layer**

  ```sh
  git add scripts/validate_month_schema.py scripts/check_month_consistency.py scripts/tests/test_validate_month_schema.py scripts/tests/test_month_governance.py
  git commit -m "feat: validate candidate months and reject stale month text"
  ```

---

### Task 3: 實作 N、count、percentage 與 P3 對應的 metric checks

**Files:**
- Create: `scripts/check_month_metrics.py`
- Modify: `scripts/tests/test_month_governance.py`
- Test: `scripts/tests/test_month_governance.py`

**Interfaces:**
- Consumes: `dict[str, Any]` monthly data、`monthly-metric-contract.json`、month key。
- Produces: `check_month_metrics(data, month, contract, source_label, p3_data=None) -> list[Finding]`。

- [ ] **Step 1: Add failing invariant tests using 202607-shaped data**

  The tests must cover these exact failures:

  - `dashboardSummary.totalRespondents` differs from `npsDistData.values` sum.
  - `promoConsent.pct` cannot be recalculated from `count / totalRespondents`.
  - NPS promoter / detractor counts do not match `npsDistData.values`.
  - `npsPct` differs from promoter percentage minus detractor percentage.
  - `sourceData.values` and `sourceData.pcts` use different denominators.
  - satisfaction dataset data length differs from `satisfactionDistributionData.labels`.
  - `branchLeaderboardTotal` is present without a declared semantic or with invalid numeric type.
  - `feedbackKeywordCloud[].count` is lower than exact count from raw feedback content.
  - P3 snapshot `period` differs from base month when a P3 file is declared ready.

- [ ] **Step 2: Run the focused tests and verify they fail**

  ```sh
  python3 -m unittest scripts.tests.test_month_governance -v
  ```

  Expected: FAIL because `check_month_metrics()` does not exist。

- [ ] **Step 3: Implement contract-driven metric checks**

  Implement deterministic checks for `surveyN`、`answeredN`、`scoredN`、`mentionN`、
  `branchN` 與 `feedbackN`。每個 mismatch finding 必須包含：

  ```text
  rule_id
  source path
  declared value
  calculated value
  denominator
  metricClass
  tolerance
  ```

  百分比以 contract tolerance 驗證；未知或無法從來源證明的指標回傳
  `unavailable` evidence，不補零。`branchLeaderboardTotal` 與分社 `n` 不同時，只有
  contract 有較廣／較窄口徑說明才允許 `INFO`，否則產生 `METRIC-004 ERROR`。

  已確認的既有口徑差異不得改寫月資料；以 `approvedHistoricalExceptions` 登記
  指定月份、rule id 與 path / path prefix。命中例外時只降為可追蹤的 `INFO`，保留
  declared、calculated、denominator 與批准理由。新月份不繼承歷史例外，仍按新規則
  檢查。

  同時提供獨立 CLI，保留與統一治理入口相同的資料讀取規則：

  ```sh
  python3 scripts/check_month_metrics.py --month 202607 --strict-warnings
  python3 scripts/check_month_metrics.py --all --strict-warnings
  ```

  CLI 只回報 findings，不修改 JSON；`--all` 只讀取 `data/months.json` 的月份。

- [ ] **Step 4: Run against current repository months**

  ```sh
  python3 -m unittest scripts.tests.test_month_governance -v
  python3 scripts/check_month_metrics.py --all --strict-warnings
  ```

  Expected: all tests PASS；`202604` legacy optional fields 仍可被 profile-aware policy 解釋，
  `202605` 的批准歷史口徑例外以 `INFO` 留下證據，`202606`-`202607` 的現有口徑不被改寫。

- [ ] **Step 5: Commit metric checks**

  ```sh
  git add data/schema/monthly-metric-contract.json scripts/check_month_metrics.py scripts/tests/test_month_governance.py
  git commit -m "feat: enforce monthly metric invariants"
  ```

---

### Task 4: 建立 numeric / display contract，防止數字被吞

**Files:**
- Create: `scripts/check_numeric_display_contract.py`
- Create: `scripts/tests/test_numeric_display_contract.py`
- Create: `scripts/tests/fixtures/month-governance-sentinel.json`
- Modify: `data/schema/monthly-metric-contract.json`

**Interfaces:**
- Consumes: monthly JSON、metric contract、`app.js` source、sentinel fixture。
- Produces: `check_numeric_fields(data, month, contract) -> list[Finding]`、`check_chart_series(data, month, contract) -> list[Finding]`、`check_frontend_bindings(app_source, contract) -> list[Finding]`。

- [ ] **Step 1: Write failing tests for swallowed-number cases**

  覆蓋：

  - required numeric value is `null`、`""`、布林值或非數字。
  - count 是負數或非整數。
  - percentage 缺失、超出 0-100 或與 count / denominator 不符。
  - chart labels 與 dataset data 長度不同。
  - table row 缺少 contract 指定的 numeric field。
  - source data 有非零值，但 frontend binding 缺少對應 `DataStore.*` path。
  - sentinel fixture 的合法數字若被表示為 `—`、空白或 0，產生 `DISPLAY-001 ERROR`。

- [ ] **Step 2: Run focused tests and verify they fail**

  ```sh
  python3 -m unittest scripts.tests.test_numeric_display_contract -v
  ```

  Expected: FAIL because the numeric/display checker and fixture do not exist。

- [ ] **Step 3: Implement data and frontend binding checks**

  contract 增加 `numericFields`、`chartSeries` 與 `frontendBindings` section，至少覆蓋：

  - dashboard summary KPI。
  - `npsDistData`、`npsScoreData`、`sourceData`、`channelData`。
  - `satisfactionDistributionData`、`destAgeCrossData`、`futureDestData`。
  - branch leaderboard、keyword cloud、P3 monthly metric values。

  `check_numeric_display_contract.py` 只檢查 source / contract，不執行 Chart.js；
  frontend static binding 只確認 renderer 仍讀取指定 DataStore path，避免把 runtime
  logic 複製到 Python。

- [ ] **Step 4: Run focused tests and existing dashboard validation**

  ```sh
  python3 -m unittest scripts.tests.test_numeric_display_contract -v
  python3 scripts/validate_dashboard.py
  python3 scripts/check_screen_layout_static.py
  node --check app.js
  ```

  Expected: PASS；不改變任何既有 tab、canvas、print 或月份 selector contract。

- [ ] **Step 5: Commit numeric/display checks**

  ```sh
  git add scripts/check_numeric_display_contract.py scripts/tests/test_numeric_display_contract.py scripts/tests/fixtures/month-governance-sentinel.json data/schema/monthly-metric-contract.json
  git commit -m "feat: guard monthly numeric display contracts"
  ```

---

### Task 5: 建立統一 governance CLI 與 JSON report

**Files:**
- Create: `scripts/validate_month_governance.py`
- Modify: `scripts/tests/test_month_governance.py`
- Modify: `scripts/validate_month_schema.py`
- Modify: `scripts/check_month_consistency.py`

**Interfaces:**
- Consumes: `--month YYYYMM`、`--all`、`--candidate PATH`、`--root PATH`、`--report PATH`、`--strict`。
- Produces: `run_governance(root, selection) -> GovernanceReport`，以及 exit code `0`（pass）、`1`（error 或 strict warning）、`2`（CLI usage error）。

- [ ] **Step 1: Add failing CLI and report tests**

  測試：

  - `--month 202608 --candidate /tmp/dashboard-candidate-202608.json` 回傳 candidate report，且不修改 manifest。
  - `--all --strict` 檢查 manifest 所有月份。
  - error report exit code 為 1。
  - non-strict warning report exit code 為 0；strict warning report exit code 為 1。
  - `--month` 與 `--all` 同時提供回傳 2。
  - `--report <path>` 只寫治理報告，不寫入 data JSON。
  - report 包含 `version`、`status`、`checkedMonths`、四個 check statuses、`errors`、`warnings`、`evidence`。

- [ ] **Step 2: Run the CLI tests and verify they fail**

  ```sh
  python3 -m unittest scripts.tests.test_month_governance -v
  ```

  Expected: FAIL because the unified CLI does not exist。

- [ ] **Step 3: Implement orchestration without duplicating rules**

  `run_governance()` 依序執行：

  ```text
  schema -> check_month_consistency -> check_month_metrics -> check_numeric_display
  ```

  既有 validators 透過可重用 Python API 或明確 command adapter 呼叫；不得用文字搜尋
  取代結構化 finding。每個 check status 由實際 finding 計算，並保留 source label
  (`manifest` 或 `candidate`)。

- [ ] **Step 4: Run candidate, all-month and report checks**

  ```sh
  python3 scripts/validate_month_governance.py --all --strict
  python3 scripts/validate_month_governance.py --month 202607 --strict --report /tmp/dashboard-governance-202607.json
  python3 -m json.tool /tmp/dashboard-governance-202607.json >/dev/null
  ```

  Expected: all current months pass；report 是合法 JSON，且 `/tmp` report 之外沒有 production data mutation。

- [ ] **Step 5: Commit the unified governance CLI**

  ```sh
  git add scripts/validate_month_governance.py scripts/month_governance.py scripts/validate_month_schema.py scripts/check_month_consistency.py scripts/check_month_metrics.py scripts/check_numeric_display_contract.py scripts/tests/test_month_governance.py
  git commit -m "feat: add monthly data governance gate"
  ```

---

### Task 6: 接入 GitHub Actions 與 Hermes read-only acceptance

**Files:**
- Modify: `.github/workflows/dashboard-validation.yml`
- Modify: `scripts/hermes_dashboard_check.py:33-230`
- Modify: `scripts/tests/test_hermes_schema_contract.py`

**Interfaces:**
- Consumes: `python3 scripts/validate_month_governance.py --all --strict`。
- Produces: CI governance step 與 Hermes `validate_month_governance_all` check。

- [ ] **Step 1: Add failing contract tests**

  在 `test_hermes_schema_contract.py` 確認 `BASE_COMMAND_CHECKS` 包含：

  ```python
  (
      "validate_month_governance_all",
      ["python3", "scripts/validate_month_governance.py", "--all", "--strict"],
      False,
  )
  ```

  同時讀取 workflow，確認 PR / push job 有獨立的 `Run monthly data governance` step。

- [ ] **Step 2: Run the contract tests and verify they fail**

  ```sh
  python3 -m unittest scripts.tests.test_hermes_schema_contract -v
  ```

  Expected: FAIL because CI and Hermes do not yet reference the governance command。

- [ ] **Step 3: Add the CI and Hermes command**

  workflow 將 governance step 放在 `validate_dashboard.py` 後、P3 與 layout checks 前。
  Hermes 使用既有 command result/status model，並把 governance stdout / JSON report
  納入 read-only summary；不新增任何檔案寫入或 fixture 留存行為。

- [ ] **Step 4: Run local CI-equivalent checks**

  ```sh
  python3 -m unittest scripts.tests.test_hermes_schema_contract -v
  python3 scripts/validate_month_governance.py --all --strict
  python3 scripts/hermes_dashboard_check.py --json
  ```

  Expected: focused tests、governance 與 Hermes PASS；Hermes 報告列出 governance check。

- [ ] **Step 5: Commit CI and Hermes integration**

  ```sh
  git add .github/workflows/dashboard-validation.yml scripts/hermes_dashboard_check.py scripts/tests/test_hermes_schema_contract.py
  git commit -m "ci: gate pull requests with monthly governance"
  ```

---

### Task 7: 更新月更 SOP、Hermes 文件與 Obsidian receipt

**Files:**
- Create: `scripts/tests/test_documentation_contract.py`
- Modify: `MONTHLY_DATA_IMPORT.md`
- Modify: `DASHBOARD_HERMES_MONITORING.md`
- Modify: `DASHBOARD_PROJECT_HANDOFF.md`
- Create: `/Users/chanwaitung2025/Documents/Obsidian Vault/Dashboard_Project_Knowledge/70_Codex_Briefs/2026-09-01-8月資料治理導入 Brief.md`
- Modify: `/Users/chanwaitung2025/Documents/Obsidian Vault/Dashboard_Project_Knowledge/10_System/Dashboard Project 系統總覽.md`
- Modify: `/Users/chanwaitung2025/Documents/Obsidian Vault/Dashboard_Project_Knowledge/40_Testing/驗證命令與測試矩陣.md`
- Modify: `/Users/chanwaitung2025/Documents/Obsidian Vault/Dashboard_Project_Knowledge/60_Hermes/Hermes Monitoring Contract.md`

**Interfaces:**
- Consumes: implemented CLI、實際驗證命令、Hermes result、commit hash。
- Produces: 可直接照做的 202608 SOP 與符合固定 headings 的 Obsidian receipt。

- [ ] **Step 1: Add documentation checks before editing**

  建立文件測試或 static assertions，確認 SOP 包含以下命令與順序：

  ```text
  validate_month_schema.py --candidate
  check_month_consistency.py
  validate_month_governance.py --month 202608 --strict
  validate_month_governance.py --all --strict
  hermes_dashboard_check.py --json
  ```

  同時確認文件說明 `unavailable` 不等於 0、候選檔不修改 manifest、原始留言月份不誤判。

- [ ] **Step 2: Run documentation checks and verify they fail**

  ```sh
  python3 -m unittest discover -s scripts/tests -p 'test_*documentation*.py' -v
  ```

  Expected: FAIL until the new workflow is documented and the test file is added。

- [ ] **Step 3: Update repository docs and Obsidian brief**

  repository docs 記錄 command、report schema、錯誤分級、候選月份與全月份流程。
  Obsidian brief 使用固定 headings：

  ```markdown
  ## 修改目的
  ## 修改檔案
  ## 驗證命令與結果
  ## 是否影響核心邊界
  ## Hermes 驗收結果
  ## 後續觀察點
  ## 是否需要 ADR / Incident
  ```

  在尚未完成最終驗證前，receipt 不可填寫虛構的 pass、Hermes result 或 commit hash。

- [ ] **Step 4: Run documentation and repository checks**

  ```sh
  python3 -m unittest discover -s scripts/tests -p 'test_*.py' -v
  git diff --check
  ```

  Expected: all tests PASS，文件沒有 stale command、錯誤檔案路徑或與 spec 衝突的流程。

- [ ] **Step 5: Commit repository documentation only after review**

  ```sh
  git add MONTHLY_DATA_IMPORT.md DASHBOARD_HERMES_MONITORING.md DASHBOARD_PROJECT_HANDOFF.md
  git commit -m "docs: document monthly governance workflow"
  ```

  Obsidian 外部回填保留在所有 source / Hermes 驗收完成後，以實際結果補齊並保存。

---

### Task 8: 202608 dry-run、完整驗收與 final review

**Files:**
- Test: `scripts/tests/fixtures/month-governance-sentinel.json`
- Verify: `data/months.json`, `data/202604.json`, `data/202605.json`, `data/202606.json`, `data/202607.json`
- Verify: all repository files changed by Tasks 1-7

**Interfaces:**
- Consumes: 清洗後的候選 202608 JSON（若已提供）、governance CLI、CI config、Hermes。
- Produces: 202608 preflight evidence、全月份 regression evidence、Obsidian receipt 與 final review decision。

- [ ] **Step 1: Run the 202608 candidate dry-run**

  將使用者提供的清洗後 8 月 JSON 暫存為 `/tmp/dashboard-candidate-202608.json`，執行：

  ```sh
  python3 scripts/validate_month_governance.py --month 202608 --candidate /tmp/dashboard-candidate-202608.json --strict --report /tmp/dashboard-governance-202608.json
  ```

  驗證 candidate 未被寫入或自動修正，所有 finding 都能定位到 source path、分母或計算證據。

- [ ] **Step 2: Run all static, data and syntax gates**

  ```sh
  python3 -m unittest discover -s scripts/tests -p 'test_*.py' -v
  python3 scripts/validate_month_schema.py --all --strict-warnings
  python3 scripts/validate_dashboard.py
  python3 scripts/check_month_consistency.py --all --strict-warnings
  python3 scripts/validate_month_governance.py --all --strict
  python3 scripts/check_print_report_static.py
  python3 scripts/check_screen_layout_static.py
  node --check app.js
  python3 -m json.tool data/months.json >/dev/null
  ```

  Expected: all commands exit 0；既有 202604-202607 資料與 DOM contract 沒有回歸。

- [ ] **Step 3: Run HTTP and Hermes acceptance**

  啟動：

  ```sh
  DASHBOARD_NO_BROWSER=1 python3 serve.py
  ```

  以實際輸出的 HTTP URL 檢查 `/index.html`、`/app.js`、所有 imported JS、
  `data/months.json`、現有月份 JSON 與候選 202608 JSON（若已加入 manifest）。
  然後執行：

  ```sh
  python3 scripts/hermes_dashboard_check.py --json
  ```

  驗收完成後停止 server，確認沒有背景 process 或測試 fixture 留在正式 data / manifest。

- [ ] **Step 4: Complete Obsidian receipt and ADR / Incident decision**

  以實際 command output、Hermes status、修改檔案與 commit hash 回填 Obsidian。若發現
  規則改變資料語義、既有月份回歸或數字顯示異常，建立對應 ADR / Incident；沒有此類
  事件則明確記錄「不需要 ADR / Incident」及理由。

- [ ] **Step 5: Perform final review before integration**

  檢查：

  - spec 每一項 requirement 都有對應 task 與測試。
  - 所有 governance findings 都有穩定 rule id、severity、month、path 與 evidence。
  - schema、consistency、metric、numeric/display、P3、Hermes 責任沒有互相覆蓋。
  - 202604 legacy profile、202605-202607 current data、P3 derived layer、既有 tab / canvas / print IDs 都保留。
  - Git diff 沒有 unrelated production changes，也沒有新增 database / API。

- [ ] **Step 6: Prepare integration evidence**

  ```sh
  git status --short --branch
  git diff --stat
  git log -8 --oneline
  ```

  Integration 前只報告已由測試、HTTP、Hermes 與 Obsidian 實際證明的結果。

---

## Review Checkpoints

1. Task 1 完成後：review contract 是否只描述穩定語義，沒有把圖表 layout 綁死。
2. Task 2 完成後：review candidate mode 是否完全不修改 manifest，且不誤判 raw feedback。
3. Task 3 完成後：review `branchLeaderboardTotal`、多選 `mentionN` 與 percentage denominator 是否可解釋。
4. Task 4 完成後：review numeric/display contract 是否能指出資料 path 與 renderer binding，而不是只說畫面失敗。
5. Task 5 完成後：review exit codes、JSON report 與 no-mutation property。
6. Task 6 完成後：review CI / Hermes 是否都以同一治理 command 為 source of truth。
7. Task 8 完成後：review full validation、HTTP、Hermes、Obsidian receipt 與 Git state，再決定是否進入 PR / merge。

## Execution Notes

- 每個 task 都以 failing test -> focused implementation -> focused verification -> commit 的順序執行。
- 若使用 Subagent-Driven，主 agent 在每個 task 後執行兩階段 review：先 correctness review，再執行測試與邊界 review；subagent 不得跨越當前 task 的檔案 allowlist。
- 若使用 Inline Execution，依 task 順序批次執行，但每個 review checkpoint 仍必須保留。
- 8 月真實資料尚未納入本 plan 檔；候選 dry-run 在資料提供後執行，不能用 sentinel fixture 冒充業務驗收。
