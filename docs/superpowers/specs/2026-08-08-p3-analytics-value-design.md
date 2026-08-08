# P3 分析價值提升設計規格

**日期：** 2026-08-08  
**狀態：** Design approved  
**範圍：** 月份比較、營運問題追蹤、客戶價值鏈路  
**資料模式：** Portable JSON-only；暫不引入 database 或 API

## 1. 目標

P3 把目前分散於各月份 JSON、單月 tab 與綜合文字洞察的資料，提升為可比較、可追蹤、可回應行動的分析層：

1. 支援月份之間比較 NPS、滿意度、門市排名、目的地需求與負面情緒。
2. 把營運問題整理為「問題 -> 負責部門 -> 建議行動 -> 追蹤指標」的可追蹤紀錄。
3. 將推薦意願、長評情緒、會員狀態、推廣接受度與復購資料放在同一條客戶價值分析鏈路中。
4. 保留目前 portable JSON 架構，並預留日後替換為 API 或 database provider 的清晰邊界。

## 2. 現況與問題判斷

目前 \`data/YYYYMM.json\` 是每月 dashboard 的主要資料來源，\`app.js\` 一次載入一個月份並更新既有 tab。現有資料已包含多項單月指標，例如：

- \`dashboardSummary\`
- \`npsDistData\`、\`npsScoreData\`、\`npsCorrelationData\`
- \`branchLeaderboardData\`
- \`futureDestData\`
- \`rawFeedbacks\`、\`feedbackKeywordCloud\`
- \`memberConsentCrossData\`、\`customerSegments\`

但目前沒有跨月份 comparison model、跨月份持續存在的 issue ID，或能證明推薦意願、情緒、會員轉化與復購之間聯合關係的資料契約。只有邊際總數時，也沒有明確的 unavailable / not-collected 狀態。

P3 不直接改變既有月份資料語意，也不把跨月計算硬寫在單一 renderer 中，而是新增獨立 derived analysis layer。

## 3. 設計方案

### 3.1 採用方案：獨立 P3 derived JSON layer

新增：

\`\`\`text
data/p3/monthly/YYYYMM.json
data/p3/issues.json
data/schema/p3-month.schema.json
data/schema/p3-issues.schema.json
\`\`\`

既有 \`data/YYYYMM.json\` 保持 current / legacy schema 與資料責任。P3 derived JSON 只保存供比較、追蹤與鏈路展示的標準化資料，不複製完整問卷原文。

這個方案：

- 不污染 \`202604\` legacy schema。
- 讓 P3 欄位版本獨立演進。
- 可在不改變既有 tab 的情況下加入新 tab。
- 未來可用同一個 provider interface 將 JSON 換成 API 或 database。

### 3.2 不採用的方案

把 P3 直接塞進每個 \`data/YYYYMM.json\`，會使舊月份與新分析欄位耦合，增加 legacy schema 維護成本。

預先建立每一對月份的 comparison JSON，月份越多會產生 N² 檔案，不利未來轉成 API 查詢。

## 4. 使用者體驗與 tab 邊界

P3 新增三個獨立 tab，不把內容混入既有 tab。

### 4.1 月份比較

使用者選擇基準月份與比較月份，畫面包含：

- NPS：兩月值、差異、分子分母與計算口徑。
- 整體滿意度：兩月平均、量表與樣本數。
- 門市排名：穩定 key、排名、得分、樣本數與排名變化。
- 目的地需求：提及次數、百分比、排名變化、新增／消失項目。
- 負面情緒：總長評數、負面數量、負面比例與分類變化。

每個區塊顯示月份、樣本數與資料口徑。沒有資料、未提供資料及無法對齊的項目，分別顯示明確狀態，不補零、不猜測。

### 4.2 營運問題追蹤

提供 read-only issue register：

- 依類別篩選：購物、酒店、餐飲、地接服務。
- 依負責部門、優先級與狀態篩選。
- 顯示問題、證據、負責部門、建議行動、追蹤指標、首次出現月份與最近觀察月份。

第一版不在 dashboard 內直接編輯 issue；資料修改仍由清洗／分析流程更新 JSON 後再通過 validation。

### 4.3 客戶價值鏈路

以單月或選定月份展示：

\`\`\`text
受訪者 -> 推薦者／中立／批評者 -> 長評情緒
        -> 會員／非會員 -> 推廣接受意願 -> 復購或後續轉化
\`\`\`

只有存在聯合交叉統計時才繪製 link。若只有邊際總數，畫面顯示「未收集」或「不可由目前資料推導」，不可將兩個比例相乘後當成實際轉化人數。

## 5. P3 資料契約

### 5.1 每月 P3 snapshot

檔案：\`data/p3/monthly/YYYYMM.json\`

\`\`\`json
{
  "version": "1.0",
  "period": "202607",
  "sampleSize": 105,
  "metrics": {
    "nps": {
      "value": 96.2,
      "unit": "percentage_points",
      "n": 105,
      "definition": "推薦者比例減批評者比例"
    },
    "overall_satisfaction": {
      "value": 8.91,
      "unit": "score_10",
      "n": 105,
      "definition": "整體旅程觀感平均分"
    }
  },
  "branchRanking": [],
  "destinationDemand": [],
  "sentiment": {
    "totalFeedback": 0,
    "categories": []
  },
  "customerValueChain": {
    "status": "partial",
    "stages": [],
    "links": [],
    "unavailable": []
  },
  "sourceRefs": [],
  "calculationNotes": []
}
\`\`\`

欄位規則：

- \`period\` 必須與檔案月份及 manifest key 一致。
- 每個 metric 必須有 \`value\`、\`unit\`、\`n\`、\`definition\`。
- \`sourceRefs\` 必須指出來源月份與來源區塊，不能只寫自由文字。
- \`branchRanking\` 與 \`destinationDemand\` 使用穩定 \`key\`，顯示名稱放在 \`label\`。
- \`sentiment\` 必須區分總長評數、情緒分類數與比例。
- \`customerValueChain.status\` 使用 \`complete\`、\`partial\` 或 \`unavailable\`。
- 缺少資料時使用 \`unavailable\` 記錄原因，不使用偽造的零值。

### 5.2 Issue register

檔案：\`data/p3/issues.json\`

\`\`\`json
{
  "version": "1.0",
  "issues": [
    {
      "id": "ISSUE-SHOPPING-001",
      "category": "shopping",
      "title": "購物安排時間過長或透明度不足",
      "ownerDepartment": "產品營運部",
      "priority": "high",
      "status": "open",
      "recommendedAction": "檢視購物點數量、停留時間與客戶自主選擇",
      "trackingMetrics": [
        {
          "id": "shopping_satisfaction",
          "label": "購物安排平均滿意度",
          "unit": "score_10",
          "target": ">=9.0"
        }
      ],
      "firstSeenMonth": "202607",
      "lastSeenMonth": "202607",
      "monthlySnapshots": [],
      "sourceRefs": []
    }
  ]
}
\`\`\`

首批 category 固定為：

\`\`\`text
shopping
hotel
dining
ground_service
\`\`\`

\`monthlySnapshots\` 保存每月狀態與證據，不以月份複製 issue；\`id\` 讓未來 API／database 可直接作 primary key。

### 5.3 客戶價值鏈路資料

\`stages\` 描述已觀察的群體數量，\`links\` 只描述已觀察的聯合交叉數。每個 link 必須包含 \`from\`、\`to\`、\`count\`、\`n\` 與 \`sourceRefs\`。

\`\`\`json
{
  "status": "partial",
  "stages": [
    { "id": "respondent", "label": "受訪者", "count": 105, "n": 105 },
    { "id": "promoter", "label": "會推薦", "count": 103, "n": 105 }
  ],
  "links": [],
  "unavailable": [
    {
      "metric": "promoter_to_repeat_purchase",
      "reason": "目前問卷沒有後續復購聯合識別欄位"
    }
  ]
}
\`\`\`

## 6. Provider 與前端邊界

新增 \`P3DataProvider\` 介面概念：

\`\`\`js
loadP3Month(monthKey)
loadP3Issues(filters)
loadP3MonthComparison(baseMonth, compareMonth)
\`\`\`

第一版由 \`JsonP3DataProvider\` 讀取：

\`\`\`text
data/p3/monthly/YYYYMM.json
data/p3/issues.json
\`\`\`

renderer 不直接知道資料來自 fetch、API 或 database。日後接 API 時，只替換 provider，不改 tab layout、comparison renderer、issue renderer 或 customer journey renderer。

既有 tab 的 DOM id、canvas id、print manifest、月份 selector 與 base monthly data loading contract 必須維持不變。P3 新 tab 只增加新 id，不重用既有 tab id。

## 7. Validation 與資料品質規則

新增：

\`\`\`text
scripts/validate_p3.py
scripts/tests/test_p3_contract.py
\`\`\`

驗證：

1. manifest 的 P3 path／status 與 P3 monthly files 一致。
2. P3 snapshot 的 \`period\`、\`sampleSize\`、metric 欄位及單位合法。
3. count、百分比、樣本數能依定義相互核對。
4. 門市總 N、問卷 N、長評總數各自使用正確口徑。
5. issue category、priority、status、ownerDepartment 與 trackingMetrics 完整。
6. issue source reference 指向合法月份與資料區塊。
7. customer value chain 不得把不可推導的比例當成實際人數。
8. P3 文本不得殘留錯誤月份文字。
9. 既有 schema、consistency check 與 Hermes 可在 P3 layer 上執行 read-only checks。

## 8. 錯誤與缺資料處理

- P3 monthly file 缺失：新 tab 顯示該月份未提供 P3 分析，既有 tab 照常運作。
- 某一 metric 缺失：該卡顯示 unavailable，其他 metric 繼續展示。
- 兩月 key 無法對齊：比較表分成新增、消失及兩月皆有，不將缺失當成零。
- issue register 載入失敗：顯示錯誤狀態與重試入口，不阻塞其他 tab。
- customer value chain 只有邊際資料：顯示 partial，並列出 unavailable 原因。
- P3 schema 失敗：validation 失敗，不修改或自動修正 production JSON。

## 9. 驗收標準

P3 第一版必須滿足：

- 使用月份 selector 可選擇 manifest 內兩個月份並顯示 comparison。
- NPS、滿意度、門市排名、目的地需求、負面情緒各有可驗證比較區塊。
- 四類營運 issue 可按類別和狀態篩選，且每筆包含負責部門、建議行動與追蹤指標。
- 客戶價值鏈路對已觀察資料可展示，對未觀察交叉資料明確標記 unavailable。
- \`202604\` legacy 月份未被重建或補寫 current raw fields。
- P3 data 缺失時，既有 tab 仍可正常載入。
- 通過 schema、dashboard、consistency、screen、print、JavaScript syntax 與 Hermes read-only 驗證。
- 以 HTTP server 驗收，不使用 \`file://\`。

## 10. 非目標與邊界

本 spec 不包含：

- database、API、登入、權限或多人編輯。
- 即時問卷同步。
- 自動從原始 Excel 推導新指標。
- 直接修改既有單月 tab 的商業定義。
- P1 CDN 離線化。
- 一次性全面重寫 \`app.js\` 或切換 Vue／React。

## 11. 預計實作順序

1. 建立 P3 schema、derived JSON fixture 與 manifest contract。
2. 建立 P3 validation 與 contract tests。
3. 建立月份比較 tab 與 JSON provider。
4. 建立 issue register 與營運問題追蹤 tab。
5. 建立客戶價值鏈路 tab，先支援 complete／partial／unavailable 三種狀態。
6. 進行跨 tab 回歸、HTTP、print、Hermes 與月份一致性驗收。

每一階段都必須保持既有 tab 可用，並在完成後回填 Obsidian，記錄 validation、Hermes 與 Git commit。

