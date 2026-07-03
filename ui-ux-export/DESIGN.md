# 旅遊業務分析儀表板 UI/UX Redesign Specification

Updated: 2026-07-03

## Product Summary

這是一個本地運行的旅遊業務分析儀表板，用於管理層、產品團隊、門市主管與營運團隊快速分析旅行團問卷、NPS、領隊表現、出團記錄、長評回饋、門市服務與綜合營運建議。

請重新設計 UI/UX，但不要改變現有運行架構。正式儀表板仍由 `index.html`、`app.js`、`js/*.js`、`data/months.json`、`data/202604.json`、`data/202605.json` 組成，`app.js` 負責 fetch JSON、月份切換、Chart.js 圖表、drill-down、篩選器、formatter、PDF 匯出與互動邏輯。

## Design Goal

請把目前介面升級為成熟、清晰、可掃描的旅遊業務 BI dashboard。設計應該偏向營運分析工具，而不是品牌 landing page。

核心感覺：

- 專業、可信、清楚
- 高資訊密度但不擁擠
- 適合每天重複查看
- 適合比較 4 月與 5 月資料
- 一眼看懂 KPI、異常、優勢、痛點與下一步行動

## Target Users

- 旅遊業務管理層：查看整體營運狀態與策略建議
- 產品團隊：分析目的地需求、年齡層偏好、旅程天數與產品優化方向
- 門市主管：查看門市服務評分、門市長評與轉化模式
- 領隊與營運管理：查看領隊排行榜、出團明細、長評與服務痛點
- 行銷團隊：查看資訊來源、報名渠道、會員推廣意願與 NPS

## Visual Direction

請採用「現代營運 BI 工具」風格：

- 淺色背景為主，使用安靜的灰白底與清晰分隔線
- 用藍色或青綠色作為主色，但不要整個畫面只剩單一藍色
- 適度使用紅 / 橙 / 綠表示風險、改善空間與優勢
- KPI 卡片要清楚但不要過度巨大
- 表格需要更易讀：固定表頭、清晰欄距、數字右對齊、排名有層級
- 圖表區塊要有乾淨容器、明確標題與輔助文字
- 長評卡片要能快速辨識：類型、目的地、領隊、團號、內容
- 門市與領隊排行榜要像可操作的管理清單，而不是純展示列表

避免：

- 不要做成 marketing hero page
- 不要使用大面積漸變、裝飾球、過度插畫化背景
- 不要把主要內容藏在過多卡片層級中
- 不要只追求漂亮而降低資料可讀性
- 不要刪除現有 dashboard 的資料區塊
- 不要刪除或改名 `printReport` 與 PDF/print 專用 CSS hook
- 不要把 PDF layout 混入一般 screen layout

## Information Architecture

儀表板有 8 個主要分頁，請保留這個分頁架構，但可以改善分頁導航的視覺與互動：

1. 旅行團數據儀表板
2. AI 銷售預測
3. 推薦意願專區
4. 領隊表現專區
5. 出團記錄分析
6. 出團長評回饋
7. 門市服務意見
8. 綜合意見

月份切換是全域控制，應該在頁面頂部保持明顯且容易操作。

## PDF / Print Requirements

Production dashboard 已具備「列印 PDF」功能。設計可以改善列印視覺，但不要重建 runtime：

- 保留 `printReport`
- 保留 `body.print-mode`
- 保留 `.print-page`
- 保留 `.print-block`
- 保留 `.print-report-chart-image`
- 不要移除右上角「列印 PDF」入口
- 不要要求把 Chart.js canvas 直接列印；production 會轉成 image snapshot
- 不要把 PDF 分頁規則放進 JSON；production 使用 `app.js` 的 `PRINT_SECTION_MANIFEST`

設計時需要兼顧：

- 一般 screen dashboard 仍應是主要操作體驗
- PDF 每頁要有清楚標題與月份
- 圓環圖在 PDF 中不能被壓扁
- 長評、門市意見和出團明細需要適合拆頁

## Page Requirements

### 1. 旅行團數據儀表板

設計重點：

- 頂部 KPI：受訪總人數、推廣信息同意、推薦意願、門店報名佔比
- 基礎客戶畫像：性別、年齡
- 會員意願交叉分析
- 旅程體驗滿意度
- 目的地 x 年齡層
- 資訊來源與報名渠道
- 關鍵發現與結論

2026 年 5 月關鍵數據：

- 受訪總人數：155
- 推廣信息同意：91 / 58.71%
- NPS：89.03
- 推薦者：141 / 90.97%
- 門店報名：132人 / 85.16%

設計方向：

- KPI 區塊要能讓管理層 5 秒內掌握全局
- 「線上獲取資訊，線下門店成交」是重要洞察，應該視覺上連接資訊來源與報名渠道
- 洞察文字要保持可讀，不要變成太小的註腳

### 2. AI 銷售預測

設計重點：

- 銷售預測圖表
- 客戶價值分群

設計方向：

- 這頁應該像預測與決策輔助頁
- 圖表旁可留出簡短解釋與預測重點的空間

### 3. 推薦意願專區

設計重點：

- NPS 相關性散點圖
- NPS threshold 文案
- 未來旅遊偏好
- 推薦意願分佈與推薦評分分佈
- 推薦驅動因素與產品重點
- 意見建議挖掘與關鍵詞分析

2026 年 5 月 NPS threshold：

- x = 0.402
- y = 4.61
- 願意推薦 = 90.97%

設計方向：

- NPS 散點圖需要有明確象限解讀
- 「急需改善區」應該視覺上突出，但不要造成焦慮感
- 未來旅遊偏好可以更像產品機會清單

### 4. 領隊表現專區

設計重點：

- 領隊服務評分排行榜
- 欄位：排名、領隊姓名、出團地點、平均評分、樣本數

設計方向：

- 排行榜要容易比較
- 平均評分與樣本數要清楚對齊
- 高分領隊可以用低調徽章或排名標記突出
- 出團地點內容可能多個目的地，設計需允許換行或 tag 化

### 5. 出團記錄分析

設計重點：

- 最熱門目的地
- 平均旅程天數
- 總樣本數
- 熱門目的地 Top 5
- 旅程天數分佈
- 滿意度深度交叉分析
- 最新出團明細

2026 年 5 月資料：

- 總樣本數：155
- 平均旅程天數：5.35天
- Top 5 目的地：韓國 35、雲南 33、北京 18、新西蘭 15、張家界 11
- 旅程天數：1-4 天 70、5-7 天 65、8 天或以上 15

設計方向：

- Top 5 目的地圖表有 drill-down，請保留圖表可點擊的暗示
- 最新出團明細應適合掃描目的地、領隊與天數
- 若天數無效時可能顯示 `-`，版面要能容納

### 6. 出團長評回饋

設計重點：

- 篩選器：所有類型、所有目的地、所有領隊
- 情緒狀態
- AI 智能關鍵詞雲
- 長評卡片

2026 年 5 月資料：

- 長評總數：54
- positive：27
- suggestion：22
- negative：5
- 高頻詞：導遊、領隊、行程、時間、滿意、專業、酒店、細心、態度、膳食、安全、購物

設計方向：

- 長評卡片需要顯示團號、目的地、領隊與評論類型
- 正面、建議、投訴要有清晰但克制的顏色區分
- 關鍵詞雲要像分析元件，不要像裝飾字堆

### 7. 門市服務意見

設計重點：

- 各分社滿意度排行榜
- 門市長評

2026 年 5 月資料：

- 門市評分樣本總數：N=135
- 門市意見：18 條
- 排行榜前列：大埔門市 5.00、荃灣綠楊坊門市 4.70、銅鑼灣門市 4.63、沙田門市 4.60

設計方向：

- 排行榜需讓分數、樣本數、門市名稱清楚可比
- 門市長評可用列表或卡片，但不要浪費太多空間
- 標題文字必須有足夠對比度，深色底上的文字要是白色

### 8. 綜合意見

設計重點：

- 優先解決的營運痛點
- 產品競爭力升級方向
- 核心護城河與增長引擎

設計方向：

- 這頁應該像管理層 strategy brief
- 每個建議卡片應包含問題、影響與行動方案
- 可用三欄或兩欄布局，但手機版要可讀

## Must Preserve Runtime Contract

這是最重要的限制：可以重設計 UI，但不要改名或刪除以下 DOM hooks。正式 dashboard 的 `app.js` 依賴這些 id 和 class 更新文字、圖表、表格與篩選器。

### Global Hooks

- `globalMonthSelector`
- `report-content`
- `tabFilterContainer`
- `tabFilterMenu`
- `filterCheckboxes`
- `.tab-content`

### Tab Section IDs

- `dashboard`
- `sales_forecast`
- `nps_zone`
- `tourleader`
- `records`
- `feedback_analysis`
- `branch_feedback`
- `analysis`

### Chart Canvas IDs

- `genderChart`
- `ageChart`
- `memberConsentCrossChart`
- `satisfactionChart`
- `destAgeCrossChart`
- `sourceChart`
- `channelChart`
- `salesForecastChart`
- `rfmChart`
- `npsCorrelationChart`
- `futureDestChart`
- `npsDistChart`
- `npsScoreChart`
- `topDestChart`
- `durationDistChart`
- `satisfactionCrossChart`

### Dynamic Content IDs

- `header-data-source`
- `kpi-total-respondents`
- `kpi-promo-consent`
- `kpi-nps-score`
- `kpi-store-signup`
- `profile-title`
- `member-source-label`
- `member-insight-1`
- `member-insight-2`
- `satisfaction-title`
- `satisfaction-insight-1`
- `satisfaction-insight-2`
- `dest-age-insight-1`
- `dest-age-insight-2`
- `source-reply-label`
- `channel-reply-label`
- `channel-insight-title-1`
- `channel-insight-text-1`
- `channel-insight-title-2`
- `channel-insight-text-2`
- `channel-insight-title-3`
- `channel-insight-text-3`
- `nps-zone-description`
- `nps-zone-indicator`
- `future-dest-table-body`
- `future-product-guide-list`
- `loyalty-recommendation-list`
- `nps-driver-table-body`
- `opinion-keyword-grid`
- `opinion-optimization-title`
- `opinion-optimization-list`
- `leaderboard-source-label`
- `leaderboard-title`
- `fullLeadersTable`
- `leaderboard-footnote`
- `records-top-destination`
- `records-average-days`
- `records-total-samples`
- `duration-legend`
- `crossChartSubtitle`
- `resetBtn`
- `records-cross-insights`
- `tourDetailBody`
- `typeFilter`
- `destFilter`
- `leaderFilter`
- `sentimentStatusBar`
- `wordCloudContainer`
- `feedbackGrid`
- `branch-leaderboard-heading`
- `branch-leaderboard-total`
- `branchLeaderboard`
- `branch-feedback-total`
- `branchFeedbackGrid`

## Technical Constraints

- Do not rewrite the app into React, Vue, or another framework.
- Keep the output compatible with plain HTML, CSS, JavaScript, Chart.js and the current `app.js`.
- Do not move logic into JSON.
- Do not add formatter, function, callback, or onClick logic into JSON.
- Do not remove Chart.js canvas elements.
- Do not remove existing filters.
- Do not change month values `202604` and `202605`.
- Design can introduce CSS classes and layout wrappers, but the required ids must remain available to `app.js`.

## Responsive Requirements

- Desktop should support dense dashboard scanning.
- Tablet should keep two-column chart layouts where possible.
- Mobile should stack sections cleanly.
- Text inside cards, buttons, table headers, KPI cards and filters must not overflow.
- Tables can scroll horizontally on mobile if necessary.

## Accessibility Requirements

- Maintain strong color contrast.
- Use clear headings and section labels.
- Do not rely on color alone for positive / suggestion / negative states.
- Keep focus states visible for select controls, buttons and tabs.
- Use readable Traditional Chinese typography.

## Desired Output

Please generate a redesigned HTML/CSS direction or design spec that can be applied back to the existing dashboard while preserving the runtime contract above.

The redesign should improve:

- Navigation clarity
- KPI hierarchy
- Chart readability
- Table alignment
- Feedback card scanning
- Branch and leader leaderboard usability
- Management-level strategy presentation

The production dashboard must still be tested through:

`http://127.0.0.1:8080/index.html`

Do not use `file://` as the final testing mode.
