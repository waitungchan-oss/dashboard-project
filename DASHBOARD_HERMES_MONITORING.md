# Dashboard Hermes Monitoring / Validation System

更新日期：2026-09-01

## Purpose

本文件定義 `dashboard-project` 專用 Hermes read-only monitoring / validation system。目標是在未來每次 Codex 或人工修改後，由 Hermes 以 evidence-based report 驗收專案是否仍符合 portable JSON dashboard 的核心契約。

標準入口：

```text
/Users/chanwaitung2025/Downloads/dashboard-project
http://127.0.0.1:8080/index.html
```

如 `8080` 被占用，以 `serve.py` 輸出的實際 port 為準。正式驗收不可使用 `file://`。

## Project scope

本監測系統只涵蓋 `dashboard-project`：

- `index.html`
- `app.js`
- `js/*.js`
- `data/months.json`
- `data/YYYYMM.json`
- `scripts/*.py`
- `serve.py`
- Markdown handoff / SOP 文件
- PDF / print report static contract
- local HTTP serving contract

不涵蓋也不可修改：

- `/Users/chanwaitung2025/Downloads/nbs_analytics`
- `ui-ux-export/` 直接覆蓋 production
- `backups/` 直接回套 production
- 任何資料庫、SQLite、Streamlit、forecasting 或 NBS revenue scope

## Monitoring sources

主要 source of truth：

| Source | 監測重點 |
|---|---|
| `data/months.json` | `defaultMonth`、月份清單、schema、duplicate keys |
| `data/202605.json` | current schema reference |
| `data/202604.json` | legacy schema compatibility |
| `data/schema/*.schema.json` | current / legacy month data structure profiles |
| `scripts/validate_month_schema.py` | manifest-driven month schema validation |
| `scripts/validate_month_governance.py` | unified schema / month / metric / numeric-display gate |
| `data/schema/monthly-metric-contract.json` | metric paths、denominators、chart bindings、approved historical exceptions |
| `scripts/validate_dashboard.py` | manifest / monthly JSON validation |
| `scripts/check_print_report_static.py` | PDF / print static contract |
| `scripts/check_screen_layout_static.py` | normal screen layout isolation |
| `index.html` | DOM id、canvas id、tab id、print container |
| `app.js` | `PRINT_SECTION_MANIFEST`、`DashboardApp.printReport()`、fetch functions |
| `serve.py` | HTTP server、port fallback、`Cache-Control: no-store` |
| Git | branch、HEAD、working tree、diff stat |

## Allowed read-only commands

Hermes 可執行：

```sh
git rev-parse --show-toplevel
git branch --show-current
git rev-parse HEAD
git status --short --branch
git diff --stat
python3 scripts/hermes_dashboard_check.py
python3 scripts/hermes_dashboard_check.py --json
python3 scripts/validate_month_schema.py --all --strict-warnings
python3 scripts/validate_month_governance.py --all --strict
python3 scripts/validate_dashboard.py
python3 scripts/check_print_report_static.py
python3 scripts/check_screen_layout_static.py
node --check app.js
python3 -m json.tool data/months.json >/dev/null
python3 -m json.tool data/202604.json >/dev/null
python3 -m json.tool data/202605.json >/dev/null
DASHBOARD_NO_BROWSER=1 python3 serve.py
```

`hermes_dashboard_check.py` 會自動啟動 local HTTP server、檢查指定資源、然後停止 server。

`validate_month_governance.py --all --strict` 是 monthly data governance 的統一 gate，
依序檢查 schema、月份一致性、metric contracts 與 numeric/display contracts。命中的
`approvedHistoricalExceptions` 只會出現在 report `evidence`，不會被當成新月份的通行條件。

## Forbidden actions

Hermes read-only monitoring 階段不可：

- 修改 `index.html`、`app.js`、`js/*.js`。
- 修改 `data/months.json` 或任何正式 `data/YYYYMM.json`。
- 修改 `serve.py` 或啟動器。
- 把 `ui-ux-export/` 或 `backups/` 覆蓋到 production。
- 修改 `/Users/chanwaitung2025/Downloads/nbs_analytics`。
- 建立、刪除、搬移正式資料。
- 使用 `git reset --hard`、`git checkout --`、刪除檔案、清空資料夾、force push 等 destructive Git 操作。
- 用 `file://` 作為正式驗收依據。
- 未驗證就宣稱 pass。

## Git monitoring

每次 post-change inspection 必須報告：

- repo root
- branch
- HEAD commit hash
- `git status --short --branch`
- `git diff --stat`
- 是否有 untracked / unstaged files

若不是 Git repo，報告 Git monitoring unavailable，不可憑記憶推論 diff。

## JSON / manifest monitoring

檢查項目：

1. `python3 scripts/validate_dashboard.py` 必須通過。
2. `python3 -m json.tool` 必須能解析 `data/months.json`、`data/202604.json`、`data/202605.json`。
3. `data/months.json`：
   - `defaultMonth` 必須是 `YYYYMM`。
   - `defaultMonth` 必須存在於 `months[]`。
   - `months[].key` 必須對應存在 `data/YYYYMM.json`。
   - `schema` 只接受 `current` 或 `legacy`。
   - 不允許 duplicate month key。
4. JSON pure data：`data/months.json` 與 manifest 內所有 `data/YYYYMM.json` 不可含：
   - `function`
   - `formatter`
   - `onClick`
   - `=>`

## Frontend contract monitoring

必須檢查 `index.html` 仍保留：

- `globalMonthSelector`
- `printReport`
- `tabFilterContainer`
- `tabFilterMenu`
- `filterCheckboxes`
- tab ids：`dashboard`、`sales_forecast`、`nps_zone`、`tourleader`、`records`、`feedback_analysis`、`branch_feedback`、`analysis`
- canvas ids：`genderChart`、`ageChart`、`memberConsentCrossChart`、`satisfactionChart`、`destAgeCrossChart`、`sourceChart`、`channelChart`、`salesForecastChart`、`rfmChart`、`satisfactionCrossChart`、`npsCorrelationChart`、`topDestChart`、`durationDistChart`、`futureDestChart`、`npsDistChart`、`npsScoreChart`

必須檢查 `app.js` 仍保留：

- `PRINT_SECTION_MANIFEST`
- `DashboardApp.printReport()` contract（目前由 `printReport` method 暴露於 `window.DashboardApp`）
- `fetchMonthCatalog`
- `fetchMonthData`

## PDF / print monitoring

PDF / print 驗收重點：

- `scripts/check_print_report_static.py` 通過。
- `#printReport` 存在。
- `.print-page` 存在。
- `body.print-mode` / normal screen isolation 存在。
- `PRINT_SECTION_MANIFEST` 仍是 PDF 分頁 source of truth。
- chart image snapshot pipeline 不被移除。
- 不回到直接列印互動畫面的做法。

## HTTP serving monitoring

`hermes_dashboard_check.py` 會執行：

```sh
DASHBOARD_NO_BROWSER=1 python3 serve.py
```

從 server output 擷取實際 URL / port，檢查：

- `/index.html`
- `/app.js`
- `/js/dom-utils.js`
- `/js/csv-export.js`
- `/js/dashboard-utils.js`
- `/data/months.json`
- `/data/202604.json`
- `/data/202605.json`

每個 HTTP response 記錄：

- status
- content-type
- cache-control

完成後必須停止 server，不留下佔用 port 的背景 process。

## Alert levels

### PASS

- 所有 validation commands 通過。
- HTTP resources 全部回 `200`。
- `Cache-Control: no-store` 存在。
- JSON pure data、manifest、frontend contract、PDF / print contract 都無違規。

### WARN

- Node.js 不存在，因此 `node --check app.js` 無法執行；需明確記錄，不可假裝通過。
- legacy schema 缺 optional fields，但 validator 僅警告且符合專案政策。
- 已批准歷史口徑例外以 `INFO` 記錄 declared / calculated / denominator，且只限指定 month/path。
- CDN 仍存在，但本次任務不要求離線化。
- Git working tree 有預期中的未提交 monitoring report 或文件更新。

### FAIL

- 任一必需 validation command 失敗。
- JSON parse 失敗。
- JSON 出現 forbidden tokens。
- manifest default / schema / duplicate / missing file contract 失敗。
- `node --check app.js` 執行後失敗。
- HTTP resource 不是 `200` 或 server 無法啟動。
- PDF / print contract 缺失。
- DOM / JS contract 缺失。
- 發現污染 `nbs_analytics` 或將 fixture 留在正式 manifest。
- 新月份命中歷史例外或出現未登記的口徑差異。

## Report format

Human-readable report：

```text
# Hermes Dashboard Project Report

Status: PASS / WARN / FAIL
Repo:
Branch:
HEAD:
URL:

## Git
- repo root:
- status:
- diff stat:

## Commands Run
- [PASS/WARN/FAIL] command

## HTTP Checks
- path status content-type cache-control

## Boundary Checks
- jsonPurity:
- manifest:
- frontendContract:

## Findings
- [WARN/FAIL] finding

## Recommendation
- accept / accept with warnings / block
```

Machine-readable report：

```sh
python3 scripts/hermes_dashboard_check.py --json
```

JSON fields 至少包含：

- `overallStatus`
- `checks[]`
- `git`
- `commands`
- `http`
- `boundaryChecks`
- `findings`
- `recommendation`

## Post-change inspection prompt

```text
請作為 Hermes read-only 驗收者檢查 /Users/chanwaitung2025/Downloads/dashboard-project。

限制：
- 只能讀取、執行 validation、啟動本地 HTTP server 做狀態檢查。
- 不可修改 production dashboard 行為。
- 不可修改 index.html、app.js、js/*.js、data/*.json、serve.py、start-dashboard.*。
- 不可修改 nbs_analytics。
- 不可使用 file:// 作為驗收依據。
- 不可執行 destructive Git 操作。

請執行：
python3 scripts/hermes_dashboard_check.py
python3 scripts/hermes_dashboard_check.py --json

並回報 PASS / WARN / FAIL、Git 狀態、validation command 結果、HTTP resource checks、JSON / manifest / frontend / PDF boundary checks、findings 與 recommendation。
```

## Obsidian 回填格式

每次 Hermes monitoring run 完成後，可回填到 Obsidian brief 或 Hermes run note：

```markdown
## Hermes Monitoring Run - YYYY-MM-DD HH:mm

- Repo: `/Users/chanwaitung2025/Downloads/dashboard-project`
- Branch:
- HEAD:
- Overall status: PASS / WARN / FAIL
- URL tested:

### Commands
- `python3 scripts/hermes_dashboard_check.py`: PASS / WARN / FAIL
- `python3 scripts/hermes_dashboard_check.py --json`: PASS / WARN / FAIL
- Additional commands:

### HTTP evidence
| Path | Status | Content-Type | Cache-Control |
|---|---:|---|---|
| `/index.html` | 200 |  | no-store |

### Boundary checks
- JSON pure data:
- Manifest:
- DOM / JS contract:
- PDF / print:
- nbs_analytics untouched:

### Findings
- 

### Recommendation
- accept / accept with warnings / block
```
