# Stitch 設計交接 Prompt

更新日期：2026-07-03

請基於我提供的 `DESIGN.md` 重新設計這個「旅遊業務分析儀表板」的 UI/UX。這是一個已經可以運行的本地 dashboard，請只做視覺、排版、資訊層級與使用體驗優化，不要改變整體運行架構。

## 設計目標

請把介面升級成專業、清晰、可掃描的旅遊業務 BI dashboard。使用者是旅遊業務管理層、產品團隊、門市主管、營運團隊與行銷團隊，他們需要快速查看 4 月 / 5 月資料、比較 KPI、分析 NPS、領隊表現、出團記錄、長評回饋、門市服務與綜合策略建議。

整體風格請偏向「營運分析工具」，不要做成 marketing landing page。

## 可以自由優化的部分

- 色彩、字體、間距、卡片、表格、分頁導航、KPI 版式
- 圖表區塊的外觀、標題層級、輔助文字呈現
- 長評卡片、門市服務意見、領隊排行榜、出團明細的可讀性
- 桌面、平板、手機的 responsive layout
- 資訊層級：讓管理者可以更快看出優勢、痛點、異常與下一步行動

## 必須保留的技術限制

請不要改成 React、Vue 或其他框架。這個 dashboard 仍要能回套到現有 plain HTML / CSS / JavaScript 架構。

請不要修改或移除 `DESIGN.md` 中列出的 DOM id、canvas id、select id、tab section id 和 `.tab-content`。正式 `app.js` 依賴這些 hook 來更新文字、初始化 Chart.js、切換月份、重繪圖表、處理 drill-down 與篩選器。

特別注意：

- 不要改名 `globalMonthSelector`
- 不要刪除 `.tab-content`
- 不要刪除任何 Chart.js `<canvas>` id
- 不要改名 `fullLeadersTable`、`tourDetailBody`、`wordCloudContainer`、`branchLeaderboard` 等動態容器
- 不要刪除或改名 `printReport`
- 不要刪除 `body.print-mode`、`.print-page`、`.print-block`、`.print-report-chart-image` 等 PDF/print 專用 CSS hook
- 不要移除「所有類型」、「所有目的地」、「所有領隊」篩選器
- 不要改變月份值 `202604`、`202605`

## 不要處理的部分

請不要重寫資料載入邏輯。

請不要把 Chart.js formatter、onClick、drill-down、filter、月份切換、fetch JSON 邏輯放進設計輸出。

請不要把 function、formatter、onClick 或 `=>` 這類程式邏輯放進 JSON。JSON 只會保留純資料。

請不要要求改動 `app.js` 的核心行為；設計輸出應該可以由工程師回套到現有 `index.html` 和 CSS。

PDF 匯出已由 production `app.js` 處理：

- `PRINT_SECTION_MANIFEST`
- `DashboardApp.printReport()`
- `#printReport`
- Chart.js canvas snapshot
- `.print-page` 分頁

請不要在設計輸出中重建 PDF 生成邏輯，也不要把 PDF layout 混入一般 dashboard layout。

## 重要資料語境

目前預設月份是 2026 年 5 月：

- 受訪總人數：155
- 推廣信息同意：91 / 58.71%
- NPS：89.03
- 推薦者：141 / 90.97%
- 門店報名：132人 / 85.16%
- 出團 Top 5：韓國、雲南、北京、新西蘭、張家界
- 平均旅程天數：5.35 天
- 出團長評：54 條
- 門市服務意見：18 條

核心業務洞察：

- 客戶前期受網絡媒體影響，但最終高度依賴門店分社完成報名與成交。
- 領隊與導遊服務是品牌護城河。
- 餐飲口味、地接服務、年輕客群體驗落差是需要優先改善的痛點。
- 熱門目的地需要按客群與旅程長度做產品分層。

## 頁面設計注意事項

請保留 8 個主要頁面：

1. 旅行團數據儀表板
2. AI 銷售預測
3. 推薦意願專區
4. 領隊表現專區
5. 出團記錄分析
6. 出團長評回饋
7. 門市服務意見
8. 綜合意見

請特別改善：

- KPI 首屏資訊密度與可讀性
- 圖表與洞察文字的關係
- 表格欄位對齊，尤其是排行榜和出團明細
- 長評卡片的掃描效率，要能看出團號、目的地、領隊、類型、內容
- 門市服務排行榜的分數、樣本數、門市名稱對齊
- 綜合意見頁要像管理層 strategy brief，而不是普通文字列表

## 輸出要求

請輸出能回套到現有 dashboard 的 HTML/CSS 設計方向或具體修改建議。若輸出完整 HTML，請務必保留所有必要 id 與 canvas id。若輸出 CSS，請避免依賴外部無法本地化的設計資源。

最終正式測試會使用：

`http://127.0.0.1:8080/index.html`

不要以 `file://` 作為最終測試方式，因為 dashboard 會透過 `fetch('./data/YYYYMM.json')` 載入 JSON。
