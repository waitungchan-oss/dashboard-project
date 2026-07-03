# Dashboard Project 後續對話交接說明

更新日期：2026-07-03

## 專案定位

此專案是可攜式旅遊業務分析儀表板，主要用於展示旅行團問卷、推薦意願、領隊表現、出團記錄、出團長評、門市服務意見與綜合洞察。

專案路徑：

```text
/Users/chanwaitung2025/Downloads/dashboard-project
```

正式開啟方式必須使用本地 HTTP server，不要用 `file://` 作為驗收方式。

建議 URL：

```text
http://127.0.0.1:8080/index.html
```

## 目前已完成狀態

### 1. 月份資料工程化已完成

目前已新增：

```text
data/months.json
scripts/validate_dashboard.py
MONTHLY_DATA_IMPORT.md
```

`data/months.json` 現在負責管理月份清單與預設月份：

```json
{
  "defaultMonth": "202605",
  "months": [
    {
      "key": "202605",
      "label": "2026年 05月",
      "schema": "current",
      "status": "ready"
    },
    {
      "key": "202604",
      "label": "2026年 04月",
      "schema": "legacy",
      "status": "ready"
    }
  ]
}
```

目前預設月份是：

```text
2026 年 05 月
```

`app.js` 會先讀取 `data/months.json`，再動態生成月份下拉選單。後續新增月份時，不需要再手動修改 `index.html` 的月份 option。

### 2. Vanilla JS 模組拆分已完成第一階段

目前仍是 Vanilla JavaScript + Chart.js 架構，未切換到 Vue / React。已抽出低耦合 helper：

```text
js/dom-utils.js
js/csv-export.js
js/dashboard-utils.js
```

`app.js` 仍是主要 runtime 入口，負責：

- `fetchMonthCatalog()` / `fetchMonthData()`
- `DashboardApp`
- Chart.js 設定、formatter、互動、drill-down
- PDF / print report builder

後續若繼續拆模組，應先拆「圖表 builder / render functions / interactions」，不要一次性改框架。

### 3. PDF 匯出功能已加入，且已改為 manifest-driven

目前 dashboard 有「列印 PDF」入口：

```text
DashboardApp.printReport()
#printReport
body.print-mode
```

PDF 匯出不再直接列印整個互動畫面，而是由 `app.js` 建立專用列印報告：

- `PRINT_SECTION_MANIFEST` 明確定義每個 tab 如何拆頁。
- `buildPrintReport()` 依 manifest 產生 `.print-page`。
- Chart.js canvas 會先轉成 image snapshot，避免列印時 canvas 尺寸被壓縮。
- `feedbackGrid`、`branchLeaderboard`、`branchFeedbackGrid`、`tourDetailBody` 這類長列表採 chunk 拆頁。
- `index.html` 保留 normal screen guard，避免 print layout 污染一般 dashboard。

相關靜態檢查：

```text
scripts/check_print_report_static.py
scripts/check_screen_layout_static.py
```

### 4. 目前月份資料

現有資料：

```text
data/202604.json
data/202605.json
```

其中：

- `202604` 是 legacy schema，保留歷史資料，不強制補齊所有 5 月後新增欄位。
- `202605` 是 current schema，作為後續新增月份的標準參考。

### 5. 目前沒有資料庫層

目前專案沒有 database config，也沒有 `.db` / `.sqlite` / `.duckdb`。資料層仍是：

```text
data/months.json
data/YYYYMM.json
```

這個設計符合目前「可攜式、本地展示、月份 JSON 更新」的使用場景。只有在需要跨月份查詢、資料量變大、多使用者、登入權限、近實時更新或 API 整合時，才需要重新評估 SQLite / API / PostgreSQL。

### 6. 目前可用的月更 SOP

月更流程已整理在：

```text
MONTHLY_DATA_IMPORT.md
```

後續新增 2026 年 6 月、7 月等月份時，主要流程是：

1. 建立備份。
2. 新增 `data/YYYYMM.json`。
3. 更新 `data/months.json`。
4. 執行驗證腳本。
5. 用 HTTP server 開啟 dashboard 驗收。

## 重要規則

### JSON 純資料原則

`data/*.json` 只能放純資料，不可以加入：

```text
function
formatter
onClick
=>
Chart.js 設定
動態配色
drill-down 邏輯
```

以上所有互動、formatter、Chart.js、drill-down、動態配色邏輯，都應保留在：

```text
app.js
```

### 不要用 file:// 驗收

因為 `app.js` 會使用：

```js
fetch('./data/YYYYMM.json')
```

如果直接雙擊 `index.html`，瀏覽器可能因本地檔案安全限制導致：

```text
failed to fetch
```

因此正式驗收必須用：

```text
http://127.0.0.1:8080/index.html
```

## 啟動方式

macOS 可使用：

```sh
./start-dashboard.sh
```

或：

```sh
python3 serve.py
```

第一次使用 macOS 啟動器時，如遇到權限問題，先執行：

```sh
chmod +x start-dashboard.command start-dashboard.sh
```

如果 macOS 顯示「Apple 無法認證」或未能開啟 `.command`，可改用 Terminal 執行 `./start-dashboard.sh`，或在系統設定中允許該檔案。

## 驗證指令

每次修改資料或程式後，建議執行：

```sh
python3 scripts/validate_dashboard.py
python3 scripts/check_print_report_static.py
python3 scripts/check_screen_layout_static.py
node --check app.js
python3 -m json.tool data/months.json >/dev/null
python3 -m json.tool data/202604.json >/dev/null
python3 -m json.tool data/202605.json >/dev/null
```

新增月份後，也要驗證：

```sh
python3 -m json.tool data/YYYYMM.json >/dev/null
```

HTTP 驗收應確認以下路徑正常：

```text
/index.html
/app.js
/data/months.json
/data/202604.json
/data/202605.json
/data/YYYYMM.json
```

PDF / print 功能變更後，額外確認：

- 一般 dashboard 沒有進入 `body.print-mode`。
- `#printReport` 在一般模式下為 hidden。
- 點擊「列印 PDF」後有產生 `.print-page`。
- 圓環圖、長條圖、散點圖在 PDF 中以 image snapshot 呈現。
- 長表格與長評卡片沒有被壓扁或切半。

## 後續新對話建議開場

之後如果要在新 Codex 對話中繼續處理 `dashboard-project`，可以直接貼以下內容：

```text
請在 /Users/chanwaitung2025/Downloads/dashboard-project 專案中繼續協作。

這是可攜式旅遊業務分析儀表板，正式開啟方式必須使用本地 HTTP server，不要用 file:// 驗收。

目前已完成月份資料工程化：
- data/months.json 管理月份清單與 defaultMonth
- scripts/validate_dashboard.py 負責驗證 manifest 與 monthly JSON
- MONTHLY_DATA_IMPORT.md 記錄新增月份 SOP
- 目前 defaultMonth 是 202605
- 202605 是 current schema
- 202604 是 legacy schema

請先檢視：
- index.html
- app.js
- data/months.json
- data/202604.json
- data/202605.json
- scripts/validate_dashboard.py
- MONTHLY_DATA_IMPORT.md

重要限制：
1. JSON 只放純資料，不要加入 function、formatter、onClick、=> 或 Chart.js 動態邏輯。
2. Chart.js 設定、formatter、互動、drill-down、動態配色全部留在 app.js。
3. PDF 匯出使用 app.js 的 PRINT_SECTION_MANIFEST、#printReport、body.print-mode 與 .print-page，不要回到直接列印互動畫面的做法。
4. 如果修改 UI，必須保留 globalMonthSelector、各 tab-content id、所有 canvas id、printReport 與動態容器 id。
5. 不要修改 nbs_analytics；本次只處理 dashboard-project。

請先說明你看到的目前狀態，再根據我的具體需求提出最小可行改動與驗證方式。
```

## 後續常見任務方向

### 1. 新增 2026 年 6 月資料

建議流程：

1. 依 `202605.json` schema 建立 `data/202606.json`。
2. 在 `data/months.json` 新增 `202606`。
3. 如要 6 月成為預設月份，把 `defaultMonth` 改為 `202606`。
4. 執行 `python3 scripts/validate_dashboard.py`。
5. 用 HTTP server 開啟 dashboard，切換 4 月 / 5 月 / 6 月驗收。

### 2. 修正某月份資料

先判斷問題屬於：

- JSON 資料錯誤
- app.js 渲染或 fallback 問題
- index.html 靜態文字殘留
- CSS / Stitch UI 回套後排版問題
- HTTP / fetch / cache 問題

不要未確認來源就直接改大量 UI 或重建 JSON。

### 3. PDF 匯出與虛擬資料壓力測試

若要繼續優化 PDF，可先用虛擬資料建立壓力測試場景，而不是直接改正式月份資料：

1. 複製 `data/202605.json` 為暫時測試檔，例如 `data/209912.json`。
2. 放大長評、門市意見、排行榜、出團明細、future trend 表格等容易撐爆版面的資料量。
3. 暫時把 `data/months.json` 加入測試月份並設為 `status: "ready"`。
4. 跑 validator 與 `json.tool`。
5. 用 HTTP server 開啟，點擊「列印 PDF」檢查 `.print-page` 是否穩定。
6. 測試完成後移除測試月份，不把虛擬資料留在正式 manifest。

建議未來新增一個 `data/fixtures/` 或 `scripts/generate_print_fixture.py`，讓 PDF 壓力測試可重複執行，但不要把 fixture 當正式月份資料。

### 4. 完全離線版

目前 Tailwind、Chart.js、ChartDataLabels、Font Awesome 仍可能依賴 CDN。

如果要做完全離線版，後續需要：

1. 下載並本地化 CDN assets。
2. 更新 `index.html` script / stylesheet 路徑。
3. 確認 `serve.py` MIME mapping 支援相關檔案。
4. 斷網驗收圖表、樣式與 icon。

### 5. Stitch UI 後續優化

目前已有：

```text
ui-ux-export/
```

這是設計交接包，不應直接覆蓋正式 dashboard。

如果後續要回套 Stitch 設計，必須保留：

```text
globalMonthSelector
.tab-content
所有分頁 id
所有 Chart.js canvas id
fullLeadersTable
tourDetailBody
wordCloudContainer
branchLeaderboard
branchFeedbackGrid
printReport
```

回套 UI 時優先處理：

- 文字不溢出
- 圖表容器不壓縮
- icon 不突兀
- 卡片邊界清晰
- 手機和平板可讀

## 與 nbs_analytics 的分工

`dashboard-project` 負責：

- 旅行團問卷儀表板
- 月份 JSON 管理
- 旅行團、推薦意願、領隊、出團、長評、門市服務分析
- Chart.js 前端互動
- 可攜式本地 HTTP dashboard

`nbs_analytics` 負責：

- NBS 收入分析
- Streamlit 看板
- 銷售預測
- LightGBM / ARIMA / Prophet / Fusion
- WAPE / MAPE 回測
- 淨收入口徑「不含掛賬核銷與TT退款轉團款」

如果後續討論的是 AI 銷售預測、模型回測、WAPE、週級 / 月級加總預測，應回到：

```text
/Users/chanwaitung2025/Downloads/nbs_analytics
```

如果討論的是旅行團問卷、月份 JSON、Stitch UI、Chart.js 或本地可攜 dashboard，才留在：

```text
/Users/chanwaitung2025/Downloads/dashboard-project
```
