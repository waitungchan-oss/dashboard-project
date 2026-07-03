# Stitch Other Instructions

更新日期：2026-07-03

請基於上傳的 `DESIGN.md` 重新設計旅遊業務分析儀表板。

重點要求：

- 保持營運 BI dashboard 風格，不要做成 landing page。
- 優先改善資訊層級、KPI 可讀性、圖表區塊、排行榜、長評卡片、門市服務意見與綜合策略頁。
- 可自由調整色彩、排版、卡片、表格、分頁、響應式布局。
- 不要改名或刪除 `DESIGN.md` 中列出的 DOM id、canvas id、select id 和 `.tab-content`。
- 不要刪除或改名 `printReport`，也不要破壞 `body.print-mode`、`.print-page`、`.print-block`、`.print-report-chart-image` 等 PDF/print hook。
- 不要改動資料載入、月份切換、Chart.js、drill-down、filter、formatter 等 runtime logic。
- 不要重建 PDF 生成邏輯；production `app.js` 已用 `PRINT_SECTION_MANIFEST` 管理 PDF 分頁。
- 請輸出能回套到現有 plain HTML/CSS/JS dashboard 的設計，不要改成 React/Vue 專案。
