# Fix B Report

## 修改目的

修正 `feedback_analysis` 在中間寬度特別是 `768px` 的 header/filter controls 溢出裁切問題，並移除 `#analysis` static fallback 中沒有 canonical data source 的第四個 `綜合建議` disclosure block。

## 修改檔案

- `index.html`
- `scripts/tests/test_p2_ux_contract.py`

## Root cause

1. `feedback_analysis` header 在 `md` breakpoint 就切成單列，搜尋列與三個 select 也同時橫排，導致中間寬度時控制列寬度超出容器。
2. `#analysis` static fallback 多加了一個 `綜合建議` block；這段文字不來自 manifest month canonical data，超出 presentation-only scope。

## 實作內容

### 1. Feedback controls responsive contract

- 將 `feedback_analysis` header 改成：
  - 外層 `data-ux="feedback-header"` 維持 column layout，直到 `xl` 才切成左右分欄。
  - controls 區改成 `data-ux="feedback-controls"` grid，`md` 使用兩欄換行，`xl` 才進入四欄橫排。
  - 搜尋列加上 `data-ux="feedback-search-row"`，在 `md` 橫跨兩欄，避免和三個 select 同列擠壓。
- 保留原有 `feedbackSearch`、`typeFilter`、`destFilter`、`leaderFilter` ids 與 handlers，不改任何篩選邏輯。

### 2. Static strategy fallback scope

- 移除 `#analysis` static fallback 的第四個 `綜合建議 (Comprehensive Recommendation)` `details` block。
- 保留原本三個 `data-ux="strategy-section"` disclosure sections，以及 dynamic `renderStrategicDisclosure()` 路徑不動。

## 新增 / 更新 contract tests

- `test_feedback_controls_keep_intermediate_width_wrap_contract`
  - 驗證 `feedback-header` / `feedback-controls` / `feedback-search-row` hooks 存在。
  - 驗證 intermediate responsive structure 使用 `md:grid-cols-2`，並延後到 `xl:flex-row` / `xl:grid-cols-[minmax(0,19rem)_repeat(3,minmax(0,1fr))]` 才水平展開。
  - 拒絕舊的 `md:flex-row justify-between items-center` 結構。
- `test_static_analysis_fallback_keeps_only_three_strategy_sections`
  - 限定 `#analysis` static fallback 內 `data-ux="strategy-section"` 恰為 3 個。
  - 拒絕 static `綜合建議 (Comprehensive Recommendation)` block。
  - 允許 dynamic JS 仍保留 `renderStrategicDisclosure` token。

## 驗證命令與結果

- `python3 -m unittest scripts.tests.test_p2_ux_contract.P2UxContractTests.test_feedback_controls_keep_intermediate_width_wrap_contract -v` -> PASS
- `python3 -m unittest scripts.tests.test_p2_ux_contract.P2UxContractTests.test_static_analysis_fallback_keeps_only_three_strategy_sections -v` -> PASS
- `python3 -m unittest scripts.tests.test_p2_ux_contract -v` -> PASS (`9` tests)
- `python3 scripts/check_screen_layout_static.py` -> PASS
- `python3 scripts/check_print_report_static.py` -> PASS

## Diff scope

`git diff --stat -- index.html scripts/tests/test_p2_ux_contract.py`

- `index.html`：34 行變更
- `scripts/tests/test_p2_ux_contract.py`：17 行變更

本次未修改 `data/*.json`、`app.js` 或其他 tab。
