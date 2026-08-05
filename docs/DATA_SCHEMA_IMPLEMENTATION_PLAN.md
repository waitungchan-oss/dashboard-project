# Dashboard 月份資料 Schema Implementation Plan

## 目標

依照 `docs/DATA_SCHEMA_DESIGN_SPEC.md` 建立可演進的月份資料 schema validation，並在 GitHub Actions 接入 PR / main gate。

## Scope

### 會修改

- `data/schema/*.schema.json`
- `scripts/validate_month_schema.py`
- `scripts/tests/` 或既有測試位置
- `.github/workflows/dashboard-validation.yml`
- 必要時更新 `AGENTS.md`、`README_START.md` 或 `MONTHLY_DATA_IMPORT.md`

### 不會修改

- `data/202604.json`、`data/202605.json`、`data/202606.json`、`data/202607.json` 的業務內容
- `app.js` 的圖表 renderer
- `index.html` 的 tab、canvas 或 DOM contract
- `scripts/check_month_consistency.py` 的既有口徑
- `/Users/chanwaitung2025/Downloads/nbs_analytics`
- 現有未追蹤 backup

## Implementation steps

### Step 1：建立 schema fixture 與 profile

- 建立 manifest、common、current、legacy schema。
- 先以現有四個月份實際資料校準，不新增虛擬正式月份。
- 保持 unknown properties allowed。

### Step 2：實作 validator core

- 讀取 manifest。
- 支援單月與 `--all`。
- 依 manifest schema profile 驗證。
- 提供 human-readable 與 `--json` 報告。
- 明確區分 error、warning、CLI error。
- 只讀，不寫回資料。

### Step 3：加入測試

至少覆蓋：

- 四個現有月份通過。
- JSON parse failure。
- manifest 指向不存在月份。
- current 缺核心欄位。
- legacy 缺選填欄位只產生 warning。
- 新增未知 chart / insight 欄位仍通過。
- 錯誤型別、錯誤 schema profile 與非法 month key 失敗。

### Step 4：接入 Hermes

- 將 schema validator 加入 Hermes command checks。
- 使用 manifest-driven month list，不在 Hermes hardcode 202604-202607。
- JSON 報告新增 schema validation check。
- 保留 Hermes read-only 邊界。

### Step 5：建立 GitHub Actions

- 建立 workflow。
- 以 Python 3 與 Node.js LTS 執行驗證。
- PR 與 main push 都執行。
- workflow 使用最小 read permissions。
- 不在 CI 內啟動長駐 server；Hermes 自行啟停 HTTP server。

### Step 6：文件與 monthly SOP 更新

- 在 `MONTHLY_DATA_IMPORT.md` 加入 schema validation 命令。
- 在 `AGENTS.md` 補上 schema 與 CI 邊界。
- 建立 Obsidian brief，記錄 design、implementation、Hermes 與 commit。

## 驗證矩陣

```sh
python3 scripts/validate_month_schema.py --all --strict-warnings
python3 scripts/validate_dashboard.py
python3 scripts/check_month_consistency.py --all --strict-warnings
python3 scripts/check_print_report_static.py
python3 scripts/check_screen_layout_static.py
node --check app.js
python3 scripts/hermes_dashboard_check.py --json
```

## 分階段交付

### Phase A：Schema validator

完成 schema、validator、測試與本地命令；不接 CI。

### Phase B：Hermes integration

將 validator 接入 Hermes，確認 machine-readable report 與 read-only 行為。

### Phase C：GitHub Actions

建立 PR / main workflow，使用真實 repository 驗證一次成功與一次預期失敗。

### Phase D：Closeout

完整驗證、Hermes PASS、Obsidian 回填、commit、push、PR merge 後檢查遠端狀態。

## 風險與控制

| 風險 | 控制 |
|---|---|
| Schema 過度嚴格，阻擋新圖表 | unknown properties allowed；圖表只驗最低資料形狀 |
| Legacy 月份被誤判 | 由 manifest schema profile 選擇 legacy 規則 |
| Validator 與既有檢查重複 | 清楚分層：schema / dashboard contract / consistency / runtime |
| CI 與本地結果不同 | CI 使用 repo 內命令，Hermes 保持同一入口 |
| 未授權修改 production | validator、Hermes、CI 都設計為 read-only validation |

## 完成條件

- Phase A-D 全部完成。
- 現有 manifest 月份全部通過。
- 新增可選欄位不會破壞 validation。
- CI PR gate 可阻擋結構錯誤與計算口徑錯誤。
- Obsidian 已記錄 design、驗證結果、Hermes 結果及 commit hash。
