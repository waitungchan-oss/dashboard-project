# AGENTS.md

此文件是 `/Users/chanwaitung2025/Downloads/dashboard-project` 的長期協作規則。所有 Codex / Hermes / 其他 agent 在本專案工作前都必須先讀本文件，並以本文件作為根目錄層級的 project instructions。

請使用繁體中文回覆，保留必要英文技術名詞，例如 Chart.js、JSON、HTTP、API、Git、Hermes、Obsidian、frontend、backend。

## 1. 專案定位

本專案是可攜式旅遊業務分析儀表板，用於展示旅行團問卷、推薦意願、領隊表現、出團記錄、出團長評、門市服務意見與綜合洞察。

專案路徑：

```text
/Users/chanwaitung2025/Downloads/dashboard-project
```

標準入口：

```text
http://127.0.0.1:8080/index.html
```

如果 `8080` 被占用，以 `serve.py` 或 `start-dashboard.sh` 輸出的實際 port 為準。正式驗收不可使用 `file://`。

## 2. 長期協作流程

正式修改必須走以下流程：

```text
Obsidian Brief
-> Codex 規劃
-> 使用者授權
-> Codex 修改
-> Hermes read-only 驗收
-> Obsidian 回填
-> ADR / Incident 沉澱
```

Codex 在正式修改前必須先交代：

- observed state
- 問題判斷
- 最小可行改動
- 風險與邊界
- 驗證方式
- 當前最快、最優的下一步具體執行動作與預期效果

未獲使用者授權前，不做跨檔修改、架構調整、批量改動或高成本操作。若使用者已明確要求直接建立或直接修改，仍需先用簡短文字說明下一步與預期效果，再執行。

## 3. 啟動前必讀文件

每次新對話或正式任務前，先讀：

```text
README_START.md
SYSTEM_MAP.md
DASHBOARD_PROJECT_HANDOFF.md
MONTHLY_DATA_IMPORT.md
DASHBOARD_HERMES_MONITORING.md
data/months.json
scripts/validate_dashboard.py
scripts/hermes_dashboard_check.py
```

如任務涉及 Obsidian / Codex / Hermes 長期協作，也讀：

```text
/Users/chanwaitung2025/Documents/Obsidian Vault/Dashboard_Project_Knowledge/00_Index/Dashboard Project Index.md
/Users/chanwaitung2025/Documents/Obsidian Vault/Dashboard_Project_Knowledge/10_System/Dashboard Project 系統總覽.md
/Users/chanwaitung2025/Documents/Obsidian Vault/Dashboard_Project_Knowledge/40_Testing/驗證命令與測試矩陣.md
/Users/chanwaitung2025/Documents/Obsidian Vault/Dashboard_Project_Knowledge/60_Hermes/Hermes Monitoring Contract.md
/Users/chanwaitung2025/Documents/Obsidian Vault/Dashboard_Project_Knowledge/70_Codex_Briefs/Codex Change Brief Template.md
/Users/chanwaitung2025/Documents/Obsidian Vault/Dashboard_Project_Knowledge/90_Codex_Context/Project Handoff Prompt.md
```

## 4. 目前系統狀態

- `data/months.json` 管理月份清單與 `defaultMonth`。
- 目前 `defaultMonth` 是 `202605`。
- `data/202605.json` 是 current schema 參考。
- `data/202604.json` 是 legacy schema，可缺少較新的 current 欄位。
- `app.js` 是 ES module entry，並使用 `js/dom-utils.js`、`js/csv-export.js`、`js/dashboard-utils.js`。
- 目前沒有 database layer，資料仍是 portable JSON。
- PDF 匯出使用 `PRINT_SECTION_MANIFEST`、`DashboardApp.printReport()`、`#printReport`、`body.print-mode`、`.print-page` 與 chart image snapshot。
- 一般 dashboard 與 PDF / print layout 有隔離檢查：`scripts/check_screen_layout_static.py`、`scripts/check_print_report_static.py`。
- Hermes 監測入口是 `scripts/hermes_dashboard_check.py`。

## 5. 核心不可破壞邊界

1. JSON 只放純資料，不可加入 `function`、`formatter`、`onClick`、`=>` 或 Chart.js runtime logic。
2. Chart.js 設定、formatter、互動、drill-down、動態配色全部留在 `app.js`。
3. 月份資料以 `data/months.json` 作為 source of truth，不回到手動修改 `index.html` option 的舊模式。
4. `202605` 是 current schema 參考，`202604` 是 legacy schema，不為了補齊新欄位而重建舊資料。
5. PDF 匯出使用 `PRINT_SECTION_MANIFEST` 管理分頁，不回到直接列印互動畫面的做法。
6. UI 修改必須保留 `globalMonthSelector`、各 `.tab-content` id、所有 canvas id、`printReport`、`tabFilterContainer`、`tabFilterMenu`、`filterCheckboxes` 與所有動態容器 id。
7. 不要把 `ui-ux-export/` 或 `backups/` 直接覆蓋到 production。
8. 如要測試 PDF 極端版面，可用虛擬月份或 fixture，但不要把虛擬資料留在正式 `data/months.json`。
9. 本專案不處理 `/Users/chanwaitung2025/Downloads/nbs_analytics`，不要混入 NBS forecasting、WAPE、Fusion、Streamlit、SQLite 或 revenue scope。
10. 不要未驗證就宣稱完成。

## 6. 主要檔案責任

| 檔案 / 目錄 | 責任 | 不應承擔 |
|---|---|---|
| `index.html` | UI shell、tab、canvas、容器、CSS、CDN 依賴 | 不放月份資料、不放 Chart.js 業務邏輯 |
| `app.js` | ES module entry、資料載入、DashboardApp、Chart.js、互動、PDF builder | 不改寫 JSON、不把資料存回檔案 |
| `js/dom-utils.js` | DOM helper、escapeHTML、loading / error overlay | 不放月份資料 |
| `js/csv-export.js` | CSV 匯出、BOM、Excel formula-injection 防護 | 不處理 dashboard rendering |
| `js/dashboard-utils.js` | dashboard 通用 helper、Chart 清理 | 不改變 DOM contract |
| `data/months.json` | 月份 manifest、`defaultMonth`、schema 狀態 | 不放 formatter 或互動邏輯 |
| `data/YYYYMM.json` | 每月 dashboard 純資料 | 不放 function、Chart.js config、event handler |
| `serve.py` | 本地 HTTP server、port fallback、no-store cache header | 不處理資料轉換 |
| `scripts/validate_dashboard.py` | manifest / monthly JSON 驗證 | 不取代 HTTP / UI 驗收 |
| `scripts/hermes_dashboard_check.py` | Hermes read-only post-change validation | 不修改 production 檔案 |

## 7. 標準驗證命令

每次正式修改後，依影響範圍執行最小必要驗證。若跨資料、UI、print 或 serving 多層，跑完整驗收。

基礎驗證：

```sh
python3 scripts/validate_dashboard.py
python3 scripts/check_print_report_static.py
python3 scripts/check_screen_layout_static.py
node --check app.js
python3 -m json.tool data/months.json >/dev/null
python3 -m json.tool data/202604.json >/dev/null
python3 -m json.tool data/202605.json >/dev/null
```

新增月份時，也跑：

```sh
python3 -m json.tool data/YYYYMM.json >/dev/null
```

Hermes 完整驗收：

```sh
python3 scripts/hermes_dashboard_check.py
python3 scripts/hermes_dashboard_check.py --json
```

如果本機找不到 `node`，不可宣稱 `node --check app.js` 已通過，必須明確記錄 Node 不可用。

## 8. HTTP 驗收規則

正式驗收不可用 `file://`。本專案依賴 `fetch()` 載入：

```text
data/months.json
data/YYYYMM.json
```

啟動方式：

```sh
DASHBOARD_NO_BROWSER=1 python3 serve.py
```

必查 HTTP resource：

```text
/index.html
/app.js
/js/dom-utils.js
/js/csv-export.js
/js/dashboard-utils.js
/data/months.json
/data/202604.json
/data/202605.json
```

新增月份時，也查：

```text
/data/YYYYMM.json
```

驗收完成後必須停止 server，不留下佔用 `8080` 或 fallback port 的背景 process。

## 9. Git 規則

本專案目前已是 Git repo。正式修改前先看：

```sh
git status --short --branch
git diff --stat
```

禁止未授權 destructive Git 操作：

- `git reset --hard`
- `git checkout --`
- force push
- 刪除不屬於本任務的檔案
- 清空資料夾或覆蓋 production

若工作樹已有他人或其他工具的變更，不要回退。先判斷是否與本任務相關；無關則忽略，相關則與現況一起工作。

## 10. Hermes 分工

Hermes 的角色是 read-only validation / monitoring，不是修改者。

Hermes 可以：

- 讀取專案文件與 source files。
- 執行 validation commands。
- 啟動本地 HTTP server 做資源檢查。
- 報告 Git 狀態、HTTP 狀態、JSON purity、manifest、frontend contract、PDF contract。

Hermes 不可以：

- 修改 `index.html`、`app.js`、`js/*.js`、`data/*.json`。
- 修改 `serve.py` 或啟動器。
- 把 fixture 留在正式 manifest。
- 覆蓋 `ui-ux-export/` 或 `backups/` 到 production。
- 修改 `nbs_analytics`。

Hermes 詳細契約見：

```text
DASHBOARD_HERMES_MONITORING.md
/Users/chanwaitung2025/Documents/Obsidian Vault/Dashboard_Project_Knowledge/60_Hermes/Hermes Monitoring Contract.md
```

## 11. Obsidian 回填格式

每次正式修改完成後，回覆或回填 Obsidian 時使用：

```markdown
## 修改目的

## 修改檔案

## 驗證命令與結果

## 是否影響核心邊界

## Hermes 驗收結果

## 後續觀察點

## 是否需要 ADR / Incident
```

重大架構決策寫入：

```text
/Users/chanwaitung2025/Documents/Obsidian Vault/Dashboard_Project_Knowledge/20_Decisions/ADR Template.md
```

故障、回歸或驗收失敗寫入：

```text
/Users/chanwaitung2025/Documents/Obsidian Vault/Dashboard_Project_Knowledge/30_Incidents/Incident Template.md
```

## 12. 常見任務路由

新增月份：

1. 先備份。
2. 依 `data/202605.json` current schema 建立 `data/YYYYMM.json`。
3. 更新 `data/months.json`。
4. 跑 `scripts/validate_dashboard.py` 與 JSON parse。
5. 用 HTTP server 驗收月份切換。

Dashboard 空白：

1. 先確認是否用 HTTP server。
2. 檢查 `/data/months.json` 與 `/data/YYYYMM.json` 是否 HTTP 200。
3. 檢查 browser console 是否有 `failed to fetch`。
4. 跑 `scripts/validate_dashboard.py`。
5. 最後才查 `app.js` rendering logic。

PDF / print 問題：

1. 先跑 `scripts/check_print_report_static.py`。
2. 檢查 `PRINT_SECTION_MANIFEST`、print CSS、chart snapshot。
3. 不把 PDF 特例塞入 JSON。
4. 若用 fixture 測試，測完移除，不留在正式 manifest。

UI 回套或設計套用：

1. 先讀 `ui-ux-export/ui-contract.md`。
2. 保留所有 DOM id 與 canvas id。
3. 不直接覆蓋 production `index.html`。
4. 跑 screen / print static checks 與 HTTP 驗收。

資料庫或 API 評估：

目前沒有 DB layer。除非出現跨月份查詢、資料量擴大、多使用者、權限、near-real-time 或 heavy querying 需求，否則維持 portable JSON 是合理選擇。

