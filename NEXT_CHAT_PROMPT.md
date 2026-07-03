# Dashboard Project 新對話提示詞

更新日期：2026-07-03

以下提示詞可直接貼到新的 Codex 對話，用於延續 `/Users/chanwaitung2025/Downloads/dashboard-project` 的後續修改。

```text
請在 /Users/chanwaitung2025/Downloads/dashboard-project 專案中繼續協作。

這是可攜式旅遊業務分析儀表板，正式開啟與驗收必須使用本地 HTTP server，不要用 file://。常用入口是：

http://127.0.0.1:8080/index.html

如果 8080 被占用，請以 serve.py 或 start-dashboard.sh 輸出的實際 port 為準。

目前狀態：
- data/months.json 管理月份清單與 defaultMonth。
- 目前 defaultMonth 是 202605。
- data/202605.json 是 current schema 參考。
- data/202604.json 是 legacy schema，可缺少較新的 current 欄位。
- scripts/validate_dashboard.py 負責驗證 manifest 與 monthly JSON。
- MONTHLY_DATA_IMPORT.md 記錄新增月份 SOP。
- app.js 已是 ES module entry，並使用 js/dom-utils.js、js/csv-export.js、js/dashboard-utils.js。
- 目前沒有資料庫層，資料仍是 portable JSON。
- PDF 匯出已加入，使用 app.js 的 PRINT_SECTION_MANIFEST、DashboardApp.printReport()、#printReport、body.print-mode、.print-page 和 chart image snapshot。
- 一般 dashboard 與 PDF/print layout 已有隔離檢查：scripts/check_screen_layout_static.py、scripts/check_print_report_static.py。

請先檢視：
- index.html
- app.js
- js/dom-utils.js
- js/csv-export.js
- js/dashboard-utils.js
- data/months.json
- data/202604.json
- data/202605.json
- scripts/validate_dashboard.py
- scripts/check_print_report_static.py
- scripts/check_screen_layout_static.py
- MONTHLY_DATA_IMPORT.md
- SYSTEM_MAP.md
- DASHBOARD_PROJECT_HANDOFF.md

重要限制：
1. JSON 只放純資料，不要加入 function、formatter、onClick、=> 或 Chart.js 動態邏輯。
2. Chart.js 設定、formatter、互動、drill-down、動態配色全部留在 app.js。
3. PDF 匯出使用 PRINT_SECTION_MANIFEST 管理分頁，不要回到直接列印互動畫面的做法。
4. 如果修改 UI，必須保留 globalMonthSelector、各 tab-content id、所有 canvas id、printReport、tabFilterContainer、tabFilterMenu、filterCheckboxes 與所有動態容器 id。
5. 不要修改 nbs_analytics；本次只處理 dashboard-project。
6. 不要把 ui-ux-export 或 backups 直接覆蓋到 production；若要套用設計，先對照 ui-ux-export/ui-contract.md。
7. 如要測試 PDF 極端版面，可用虛擬月份或 fixture，但不要把虛擬資料留在正式 data/months.json。

建議驗證指令：
- python3 scripts/validate_dashboard.py
- python3 scripts/check_print_report_static.py
- python3 scripts/check_screen_layout_static.py
- node --check app.js
- python3 -m json.tool data/months.json >/dev/null
- python3 -m json.tool data/202604.json >/dev/null
- python3 -m json.tool data/202605.json >/dev/null

我的後續需求是：
[在這裡填入具體任務，例如：用虛擬資料壓力測試 PDF 匯出、優化圓環圖列印比例、整理 app.js 的 chart builders、或新增 202606 月份資料。]

請先說明你看到的目前狀態，再提出最小可行改動與驗證方式；需求清楚後直接執行，不要做無關重構。
```
