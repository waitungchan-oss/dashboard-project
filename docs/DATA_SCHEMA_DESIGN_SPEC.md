# Dashboard 月份資料 Schema Design Spec

## 1. 目的

為每月新增或更新的 `data/YYYYMM.json` 建立可演進的結構驗證層，提前阻擋：

- JSON 結構錯誤或欄位型別錯誤
- manifest 月份與資料檔不一致
- current / legacy schema 被錯誤套用
- 圖表需要的基本資料形狀不完整
- JSON 混入 frontend runtime logic

本設計不把每月資料鎖成完全相同的內容，也不限制業務人員新增分析欄位或改變圖表呈現方式。

## 2. 非目標

- 不取代 `scripts/validate_dashboard.py` 的現有 dashboard contract 檢查。
- 不取代 `scripts/check_month_consistency.py` 的 count、百分比、N 口徑與月份文字檢查。
- 不在 JSON 中放 Chart.js config、formatter、event handler 或 dynamic color logic。
- 不在本階段引入 database、API 或外部 schema service。
- 不把 202604 legacy month 強制重建成 current schema。

## 3. 驗證分層

| 層級 | 責任 | 主要入口 |
|---|---|---|
| JSON schema | JSON 可解析、根層型別、欄位型別、current / legacy 結構 | `scripts/validate_month_schema.py` |
| Dashboard contract | manifest、必要 tab 資料、既有 chart shape、純資料邊界 | `scripts/validate_dashboard.py` |
| Calculated consistency | count、百分比、情緒、門市 N、月份文字 | `scripts/check_month_consistency.py` |
| Runtime / UI | frontend DOM、HTTP、print、screen、全月份資源 | `scripts/hermes_dashboard_check.py` |

各層只檢查自己的責任，避免把內容型變化誤判成 schema 錯誤。

## 4. Schema 目錄設計

```text
data/schema/
  manifest.schema.json
  common-month.schema.json
  current-month.schema.json
  legacy-month.schema.json
```

### 4.1 `manifest.schema.json`

固定檢查：

- `defaultMonth` 為 `YYYYMM` 字串
- `months` 為陣列
- 每個 entry 的 `key`、`label`、`schema`、`status` 型別正確
- `schema` 只允許 `current` 或 `legacy`

### 4.2 `common-month.schema.json`

只定義跨月份穩定且有 frontend 意義的共同欄位，例如：

- 根層必須是 object
- `dashboardSummary`、`recordsSummary` 若存在必須是 object
- `rawFeedbacks`、`uniqueTours`、`leadersRaw` 若存在必須是 array
- `feedbackKeywordCloud` 若存在必須是 array
- JSON 不得包含 runtime token

### 4.3 current / legacy schema

- `current-month.schema.json` 定義 202605 後預期的核心資料群組，但欄位採選填或條件式要求。
- `legacy-month.schema.json` 只要求 202604 已經存在且由 frontend 使用的 legacy 欄位。
- 兩者都允許未知欄位，避免新增圖表、洞察或 tab 資料時被 schema 阻擋。
- manifest 的 `schema` 欄位決定使用哪個 profile，不由檔名或檔案內容猜測。

## 5. 可演進資料規則

### 5.1 允許的變化

- 新增 chart dataset。
- 新增 insight、recommendation、feedback 或 tab-specific 欄位。
- 圖表 labels 數量改變。
- 圖表由單 series 改為多 series，只要保留可辨識的基本資料型別。
- 某月份沒有某一 tab 的資料，使用選填欄位或 `status` 表示 unavailable。

### 5.2 需要明確變更的情況

- 現有欄位由 object 改成 array。
- 現有欄位語意改變，例如 `branchLeaderboardTotal` 不再代表問卷總 N。
- current / legacy profile 的核心欄位重新定義。
- frontend 需要新的 root-level contract。

上述情況必須先更新 schema、validator 測試與設計說明，再更新資料或 frontend。

## 6. Validator CLI 設計

檔案：`scripts/validate_month_schema.py`

```text
python3 scripts/validate_month_schema.py 202607
python3 scripts/validate_month_schema.py --all
python3 scripts/validate_month_schema.py --all --strict-warnings
python3 scripts/validate_month_schema.py --all --json
```

預設行為：

- 不帶月份時檢查 manifest 的全部月份。
- `--month` 與 positional month 擇一，不允許歧義。
- 讀取 `data/months.json`，以 manifest 決定檔案與 schema profile。
- 不修改任何 production 檔案。
- exit code：0 = pass，1 = validation error，2 = CLI / configuration error。

報告至少包含：月份、採用 profile、errors、warnings、checked files，以及可供 CI 讀取的 JSON mode。

## 7. Schema 與圖表格式的邊界

Schema 只驗證圖表資料的最低契約，例如：

```json
{
  "labels": ["A", "B"],
  "values": [10, 20]
}
```

不驗證：

- 顏色
- 排序
- tooltip 文字
- 圖表型別
- canvas layout
- section 卡片數量

這些屬於 `app.js`、HTML 或 UI contract，應由 frontend / Hermes 驗證。

## 8. GitHub Actions 設計

檔案：`.github/workflows/dashboard-validation.yml`

觸發條件：

- pull request
- push 到 `main`
- 只在 dashboard source、data、scripts、workflow 或 project docs 變更時觸發

執行順序：

1. checkout
2. setup Python
3. setup Node.js
4. JSON schema validation（全部 manifest 月份）
5. `validate_dashboard.py`
6. `check_month_consistency.py --all --strict-warnings`
7. print / screen static checks
8. `node --check app.js`
9. Hermes read-only validation

CI 不會自動修改 JSON、不會自動格式化、不會推送或合併 PR。

## 9. 失敗分類

- schema error：資料結構或型別錯誤，阻擋 merge。
- consistency error：可計算欄位不一致，阻擋 merge。
- warning：例如 legacy 缺少選填欄位；只有在 `--strict-warnings` 時阻擋。
- runtime failure：HTTP、DOM、print 或 screen contract 失敗，阻擋 merge。

## 10. 驗收標準

- 202604、202605、202606、202607 均可由 manifest-driven validator 通過。
- 新增未知 chart / insight 欄位不會被拒絕。
- current 與 legacy profile 可並存。
- 既有三個 validator 與 Hermes 的責任不重疊且全部可執行。
- GitHub Actions 在 PR 上執行完整驗證。
- validator、schema 與 workflow 均有最小測試與失敗案例。
