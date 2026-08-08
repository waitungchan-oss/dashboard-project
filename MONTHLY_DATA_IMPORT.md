# 月份資料更新 SOP

更新日期：2026-08-08

此專案以「每個月份一個純 JSON 檔」管理資料。儀表板會先讀取 `data/months.json` 產生月份選單，再按月份讀取 `data/YYYYMM.json`。

## 1. 更新前備份

在修改資料前先建立備份：

```sh
ts=$(date +%Y%m%d-%H%M%S)
backup_dir="backups/dashboard-project-before-month-$ts"
mkdir -p "$backup_dir/data"
cp index.html app.js serve.py start-dashboard.* README_START.md CHAT_RECORD.md "$backup_dir"/
cp data/*.json "$backup_dir/data"/
(cd backups && zip -qr "dashboard-project-before-month-$ts.zip" "dashboard-project-before-month-$ts")
```

## 2. 新增月份 JSON

新增檔案：

```text
data/YYYYMM.json
```

例如 2026 年 6 月：

```text
data/202606.json
```

JSON 必須只保留純資料，不可加入：

- `function`
- `formatter`
- `onClick`
- `=>`
- Chart.js 設定
- 動態配色或 drill-down 邏輯

以上邏輯全部保留在 `app.js`。

## 3. 更新月份清單

在 `data/months.json` 的 `months` array 加入新月份。新月份建議使用：

```json
{
  "key": "202606",
  "label": "2026年 06月",
  "schema": "current",
  "status": "ready",
  "description": "2026 年 6 月問卷匯總資料"
}
```

如果要把新月份設為預設顯示，同步更新：

```json
"defaultMonth": "202606"
```

## 4. 資料驗證

執行：

```sh
python3 scripts/validate_month_schema.py --all --strict-warnings
python3 scripts/validate_dashboard.py
python3 scripts/check_month_consistency.py --all --strict-warnings
python3 scripts/check_print_report_static.py
python3 scripts/check_screen_layout_static.py
node --check app.js
python3 -m json.tool data/months.json >/dev/null
python3 -m json.tool data/202604.json >/dev/null
python3 -m json.tool data/202605.json >/dev/null
```

新增月份後也要檢查：

```sh
python3 scripts/validate_month_schema.py YYYYMM --strict-warnings
python3 -m json.tool data/YYYYMM.json >/dev/null
```

`data/schema/` 是可演進的結構驗證層。它依 `data/months.json` 的 `schema` profile
分別檢查 current / legacy 月份，允許新增未知圖表與洞察欄位，不限制圖表顏色、排序或 layout。
資料口徑與 count 一致性仍由 `check_month_consistency.py` 負責。

## 5. P3 月度分析更新流程

P3 是獨立的 derived analysis layer。既有 `data/YYYYMM.json` 是單月份 dashboard
資料；`data/p3/monthly/YYYYMM.json` 是月份比較、營運問題追蹤與客戶價值鏈路的
標準化快照；`data/p3/issues.json` 是跨月份 issue register。P3 由
`P3DataProvider` 載入，不把 P3 交叉計算塞回 base monthly JSON。

每月依下列順序更新：

1. 清理並核對當月來源資料與樣本口徑，先建立備份。
2. 新增或更新 `data/YYYYMM.json`；`202604` 等 legacy 月份保留原有語義，不為了 P3
   補欄位或重建歷史資料。
3. 依觀察到的來源欄位建立 `data/p3/monthly/YYYYMM.json`，補上 `sourceRefs`、月份、
   樣本口徑與 calculation note。
4. Issue 出現或內容改變時更新 `data/p3/issues.json`。既有 issue 的 `id` 必須持續
   使用，不可因月份更新而重建 ID。
5. 在 `data/months.json` 更新對應月份的 `p3.path` 與 `p3.status`；沒有可用證據時使用
   `partial` 或 `unavailable`，不可用 0 代替未知值。
6. 執行以下資料驗證：

```sh
python3 scripts/validate_month_schema.py --all --strict-warnings
python3 scripts/validate_p3.py --all --strict-warnings
python3 scripts/check_month_consistency.py --all --strict-warnings
```

7. 執行 `python3 scripts/hermes_dashboard_check.py --json`，再用 HTTP server 檢查
   P3 JSON、月份切換、月份比較、營運問題追蹤與客戶價值鏈路；完成後停止 server，
   確認沒有背景 process。

P3 的 customer value chain 只呈現有來源支持的 stage/link。`partial` 與
`unavailable` 是資料可得性狀態，不等於 0；沒有聯合觀察資料時不可由邊際比例推導
轉化人數。P3 不引入 API 或 database，仍維持 portable JSON-only 架構。

## 6. 啟動與 HTTP 驗收

不要用 `file://` 開啟。使用：

```sh
./start-dashboard.sh
```

或：

```sh
python3 serve.py
```

用啟動器輸出的 URL，例如：

```text
http://127.0.0.1:8080/index.html
```

確認以下路徑 HTTP 200：

- `/index.html`
- `/app.js`
- `/data/months.json`
- `/data/YYYYMM.json`

## 7. 瀏覽器驗收

在瀏覽器檢查：

- 預設月份是否正確。
- 月份下拉選單是否出現新月份。
- 切換舊月份再切回新月份，圖表與文字正常重繪。
- Top 5 目的地 drill-down 正常。
- 出團長評目的地、類型、領隊篩選正常。
- 門市排行榜與門市長評正常。
- 沒有 `failed to fetch` 或白屏。
- 點擊「列印 PDF」後可產生列印頁面，圖表不空白，圓環圖不被壓扁。
- P3 tab 可讀取 `data/p3/monthly/<manifest-month>.json` 與 `data/p3/issues.json`，
  缺少證據時顯示 partial/unavailable，而不是 0。

如看到舊畫面，使用 `Cmd + Shift + R` 強制重新整理。

## 8. Schema 原則

`202605.json` 是 current schema 參考。後續新月份應盡量補齊同級欄位，包括：

- 首頁 KPI 與洞察文字
- 客戶畫像與滿意度圖表資料
- NPS 與推薦意願資料
- 領隊排行榜與出團明細
- 出團長評、詞雲與篩選資料
- 門市排行榜與門市長評
- 出團記錄分析摘要與洞察

`202604.json` 屬 legacy schema，可保留現狀，不需要為了補齊欄位而重建舊資料。

## 9. PDF 壓力測試月份

如果要測試 PDF 匯出在大量資料下是否穩定，可以使用暫時虛擬月份，但不要污染正式月份清單。

建議流程：

1. 複製 `data/202605.json` 為 `data/209912.json`。
2. 放大以下陣列：
   - `rawFeedbacks`
   - `branchRawFeedbacks`
   - `leadersRaw`
   - `uniqueTours`
3. 加入較長評論、較長目的地名稱、更多表格列。
4. 暫時在 `data/months.json` 加入：

```json
{
  "key": "209912",
  "label": "2099年 12月 測試",
  "schema": "current",
  "status": "ready",
  "description": "PDF 壓力測試用虛擬資料，勿作正式月報"
}
```

5. 執行驗證：

```sh
python3 scripts/validate_dashboard.py
python3 -m json.tool data/209912.json >/dev/null
```

6. 用 HTTP server 開啟 dashboard，切到測試月份並點擊「列印 PDF」。
7. 驗收完成後，移除 `data/209912.json` 與 `months.json` 中的測試月份。

長期建議是新增 fixture 產生腳本，例如 `scripts/generate_print_fixture.py`，讓壓力測試可重複，但 fixture 不應被視為正式業務資料。
