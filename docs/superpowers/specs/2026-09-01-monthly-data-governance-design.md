# 8 月月份資料治理設計規格

**日期：** 2026-09-01  
**狀態：** Design approved  
**範圍：** 月份錯置、口徑不一致、數字被吞的月度資料治理流程  
**資料模式：** Portable JSON-only；暫不引入 database 或 API

## 1. 背景與問題

本專案以 `data/months.json` 管理月份清單，以 `data/YYYYMM.json` 保存單月份
dashboard 資料，並以 `data/p3/` 保存跨月份的 P3 derived analysis layer。
目前已有 schema validation、月度 consistency check、P3 validation、GitHub Actions
與 Hermes read-only acceptance，但三類常見錯誤仍分散在不同檢查中：

1. 月份切換後，摘要或洞察文字殘留上一月份。
2. 問卷總 N、分項 N、多選提及 N、門市 N 與百分比使用了不同分母，畫面卻未清楚標示。
3. JSON 中存在數字，但因資料缺失、陣列長度不一致或 renderer fallback，圖表／表格顯示空白、`—`、錯誤 0 或遺漏資料。

8 月資料導入前，需要把上述檢查整理為單一、可阻擋 commit 的治理流程。

## 2. 目標

### 2.1 必須達成

1. 對候選月份與 manifest 全月份執行一致的資料治理檢查。
2. 將月份錯置、口徑不一致、數字被吞分類輸出，並提供 JSON path、來源、分母與計算值等證據。
3. 對確定錯誤使用 `ERROR` 阻擋 PR；對可解釋的 legacy 差異、原始留言內容或證據不足使用明確的 `WARN`、`INFO` 或 `unavailable`。
4. 將治理入口接入 GitHub Actions 與 Hermes，形成 commit 前 gate。
5. 保持圖表格式可演進：資料 shape 或 metric binding 改變時更新 contract；單純顏色、排序與 layout 改變不應被資料治理規則阻擋。
6. 為 202608 建立可重複執行的導入、驗證、回填與驗收流程。

### 2.2 不在本階段

- 不引入 database、API 或正式 backend。
- 不由 validator 自動修改來源數字或 JSON。
- 不把未知值補成 0。
- 不重建 `202604` legacy 資料，也不把 P3 欄位塞回 base monthly JSON。
- 不把 Chart.js config、formatter、event handler 或 rendering logic 放入 JSON。
- 不改動與 8 月資料治理無關的 tab、DOM contract 或既有 production 資料。

## 3. 現況與責任邊界

| 層級 | 現有／規劃責任 |
|---|---|
| `data/months.json` | 月份 key、label、schema profile、status 與 P3 path 的 source of truth |
| `data/YYYYMM.json` | 單月份 portable dashboard data；只放純資料 |
| `data/schema/` | current / legacy / P3 結構驗證；允許新增非核心圖表或洞察欄位 |
| `scripts/validate_month_schema.py` | JSON 結構、profile 與 forbidden token 驗證 |
| `scripts/check_month_consistency.py` | 月份文字、count、百分比、情緒、keyword 與門市 N 的計算一致性 |
| 新治理入口 | 統一編排規則、錯誤分級、治理報告與候選月份檢查 |
| `scripts/hermes_dashboard_check.py` | read-only schema、JSON purity、frontend、HTTP 與既有驗收 |
| GitHub Actions | PR / main gate；不修改 production 檔案 |
| Obsidian | 每月治理收據、驗證結果、commit hash 與後續觀察點 |

目前 manifest 已包含 `202604`、`202605`、`202606`、`202607`；其中 `202604` 是
legacy profile，`202605` 及後續月份使用 current profile。既有 untracked
`backups/` 與 `prototypes/` 不屬於本設計範圍，實作時必須保留。

## 4. 治理資料流

```text
清洗後來源資料
  -> 候選月 JSON（未發布）
  -> schema validation
  -> month consistency
  -> metric contract validation
  -> numeric/display contract validation
  -> 全月份 regression
  -> Hermes read-only acceptance
  -> Obsidian monthly receipt
  -> Git stage / commit / PR
```

候選檔在通過治理前不應成為 dashboard 的 `ready` 月份。治理腳本可以支援單一
候選檔路徑與 manifest month key；正式發布時才將月份加入 `data/months.json`。

## 5. 資料口徑模型

所有數字先標記其 metric class，不以欄位名稱猜測分母：

| Metric class | 定義 | 典型例子 |
|---|---|---|
| `surveyN` | 問卷主體總人數 | 總受訪人數、NPS 分母 |
| `answeredN` | 某題實際填答人數 | AP、AR、性別、年齡 |
| `scoredN` | 有效評分樣本數 | 滿意度、總分平均 |
| `mentionN` | 多選題全部提及次數 | 資訊來源、未來目的地 |
| `branchN` | 門市／分社統計樣本數 | 門市排行榜 |
| `feedbackN` | 被分析的長評筆數 | 情緒分類、詞雲 |

每個需核對的核心指標須記錄：

```text
metric id
source path
metric class
denominator path 或固定定義
calculation rule
rounding tolerance
missing-data policy
```

`branchLeaderboardTotal` 特別需要標記其語義是 `surveyN`、`branchN` 或其他明確
總數。若宣告總數與各分社 `n` 不同，不直接視為數字錯誤，而是要求 contract
明確記錄「較廣口徑」或「較窄口徑」；未有說明時才判為錯誤。

## 6. 三類治理規則

### 6.1 月份錯置

檢查對象包括 manifest key、JSON metadata、摘要、洞察、表格說明、圖表標題及
P3 snapshot 的 period。

規則：

1. `data/202608.json` 的 period、標題與摘要月份必須指向 202608。
2. 同一年非當月的月份文字出現在單月分析欄位時，預設為 `ERROR`。
3. `rawFeedbacks`、`branchRawFeedbacks` 等原始客戶留言內的歷史月份文字不直接判錯。
4. 跨月份比較只能出現在 P3 comparison 或明確標記的 historical/comparison 欄位。
5. 錯誤輸出必須包含 JSON path、偵測月份、實際文字與文字片段。

接受的例子：

- P3 comparison 中明確出現「202607 vs 202608」。
- 原始留言引用旅客提到上一月份的行程。

拒絕的例子：

- 202608 的摘要仍寫「根據 2026 年 7 月問卷數據」。
- 202608 的圖表 subtitle 仍使用 7 月的總 N 或洞察結論。

### 6.2 口徑不一致

治理入口必須執行 deterministic invariants：

- 宣告的總受訪人數與問卷主體資料的 `surveyN` 一致。
- feedback array 的長度與其 `feedbackN` 或情緒分類合計一致。
- 情緒分類的 positive / suggestion / negative 合計等於對應 feedback array 長度。
- keyword `count` 不得低於原始長評中可驗證的 exact occurrence count；若採語意歸併，必須提供來源說明而非靜默覆蓋。
- 排行榜各項 `n`、宣告 total 與其 metric class 關係必須符合 contract。
- count、denominator 與 percentage 可重算；只允許設定內的四捨五入誤差。
- 多選題使用 `mentionN`，不得以 `surveyN` 的文字標籤或百分比替代。
- P3 snapshot 的 `period`、`sampleSize`、source reference 與 base monthly data 對得上。

發現不一致時，報告至少要列出：

```text
metric id
source path
declared value
calculated value
denominator
metric class
口徑說明或缺失原因
```

### 6.3 數字被吞

資料層規則：

1. contract 指定的 numeric field 不可是 `null`、空字串、非數字或布林值。
2. count 必須是非負整數；比例必須落在合法範圍。
3. 已有資料時，不能以 `—`、空白或 0 取代合法的 count / score。
4. chart labels 與每個 dataset data 長度必須一致。
5. table rows 的欄位長度、排序與數字欄位必須完整。
6. top N、排行榜、情緒分類與分組資料的輸入筆數與可展示筆數必須可追蹤。

歷史口徑例外：

- 既有月份如確認需保留原始數據，不回寫月資料；以 contract 的
  `approvedHistoricalExceptions` 登記指定 month、rule id 與 path / path prefix。
- 例外只把命中的 finding 降為 `INFO`，並保留 declared、calculated、denominator、
  exception id、批准狀態與批准理由；不得放寬其他月份或其他 path。
- 新月份不繼承歷史例外，仍按現行 metric contract 檢查。

frontend contract 規則：

- 保留所有既有 tab id、canvas id、dynamic container id、月份 selector 與 print contract。
- static check 必須確認 renderer 仍讀取 contract 指定的資料路徑。
- 使用不含真實業務資料的非零 sentinel fixture，驗證合法數字不會被渲染成空白、`—` 或 0。
- UI / HTTP 驗收確認 canvas、表格與摘要實際可見；JSON parse 通過不等於畫面通過。

## 7. 錯誤分級與 exit code

| 狀態 | 適用情況 | strict mode 行為 |
|---|---|---|
| `ERROR` | 結構錯誤、明確月份錯置、核心 metric 不一致、合法數字遺失 | exit 1，阻擋 PR |
| `WARN` | legacy optional field、語意無法完全驗證、原始資料不足 | strict mode exit 1；一般模式可繼續 |
| `INFO` | 已記錄但不需阻擋的口徑差異、可接受歷史文字 | exit 0 |
| `unavailable` | 來源沒有聯合資料或無法合理推導 | 不補 0；需顯示原因 |

CLI 至少支援：

```sh
python3 scripts/validate_month_governance.py --month 202608 --strict
python3 scripts/validate_month_governance.py --all --strict
```

若候選月份尚未加入 manifest，應能指定候選 JSON path，並在報告中標示
`candidate` 而非假裝它已是正式月份。

## 8. 治理報告契約

報告以 stdout 及可選 JSON 檔案輸出，不能修改被檢查的資料：

```json
{
  "version": "1.0",
  "status": "pass",
  "checkedMonths": ["202608"],
  "checks": {
    "schema": "pass",
    "monthConsistency": "pass",
    "metricContracts": "pass",
    "numericDisplayContracts": "pass"
  },
  "errors": [],
  "warnings": [],
  "evidence": []
}
```

每筆 finding 應包含穩定的 rule id、severity、month、path、message，以及需要時的
declared / calculated / denominator evidence。歷史例外 finding 另須包含
`exceptionId`、`exceptionStatus` 與 `exceptionReason`。報告 artifact 不視為業務來源，也不
應覆蓋 `data/YYYYMM.json`。

## 9. CI、Hermes 與 Obsidian 接合

GitHub Actions 的 PR / main job 順序為：

```text
schema -> dashboard contract -> month governance -> P3 -> static layout -> Node syntax -> Hermes
```

`hermes_dashboard_check.py --json` 應納入治理入口結果，並維持 read-only：Hermes
只能讀取、執行檢查與報告，不得修資料、改 manifest 或留下 fixture。

每月完成後回填 Obsidian，至少包含：

```markdown
## 修改目的
## 修改檔案
## 驗證命令與結果
## 是否影響核心邊界
## Hermes 驗收結果
## 後續觀察點
## 是否需要 ADR / Incident
```

如治理規則發現真實回歸或改變資料語義，需建立或更新 ADR / Incident；單純新增
合格月份且沒有規則變更，記錄 monthly receipt 即可。

## 10. 202608 導入驗收

8 月資料必須按以下順序處理：

1. 備份現有 `data/` 與必要 project files。
2. 準備清洗後的 202608 JSON，保留來源欄位與分析口徑說明。
3. 在未發布狀態執行候選月份 schema、consistency、metric 與 numeric/display checks。
4. 修正月份文字、N、count、百分比、缺失值及陣列長度問題。
5. 將 202608 加入 `data/months.json`，並確認 schema / P3 status / path。
6. 執行全月份 regression，確認 `202604` legacy 與既有 202605-202607 不被改變。
7. 執行 Hermes JSON、HTTP 與必要 UI / print 驗收，完成後停止 local server。
8. 回填 Obsidian monthly receipt，再進行 Git stage、commit、PR 與 merge。

最低驗收條件：

- `202608` 的所有明確月份文字與 manifest 一致。
- 核心 metric contract 無 `ERROR`，每個差異都有分母與口徑證據。
- 所有必填數字、chart array、table row 通過 numeric/display contract。
- 全月份 validation、GitHub Actions 與 Hermes 通過。
- Obsidian receipt 包含實際命令、結果與 commit hash。

## 11. 風險與回滾

| 風險 | 控制方式 |
|---|---|
| 把原始留言中的月份誤判成錯置 | 只對非 raw feedback path 執行嚴格檢查，並輸出 evidence |
| 把不同 N 口徑誤判成錯誤 | 先使用 metric class 與 contract，禁止以欄位名稱猜分母 |
| 為了通過檢查而補 0 | `unavailable` 與 missing-data policy 明確阻擋偽造零值 |
| 圖表格式變更造成無謂阻擋 | schema 保持可演進；只對核心資料 shape / binding 更新 contract |
| 新月份污染正式 dashboard | 候選檔先獨立檢查，通過後才加入 manifest |
| legacy 月份回歸 | 保留 profile-aware validation 與全月份 regression |

回滾以 Git revert 新增月份或治理程式碼為主，不直接刪除或覆蓋使用者既有的
backup、prototype 或其他 unrelated changes。

## 12. 後續 implementation plan 的拆分原則

實作應依以下邊界拆成可獨立 review 的 tasks：

1. metric contract 與治理報告格式。
2. `check_month_consistency.py` 的治理規則與全月份／候選月份支援。
3. numeric/display contract 與 sentinel fixture。
4. 統一治理 CLI、exit code 與測試。
5. GitHub Actions 與 Hermes 接合。
6. 月更 SOP、Obsidian receipt 與 202608 dry-run。
7. 完整 pytest / unittest、HTTP、Hermes 與 regression acceptance。

每個 task 必須保持 read-only validation 與 data mutation 分離，並在進入下一個
task 前完成 focused review。
