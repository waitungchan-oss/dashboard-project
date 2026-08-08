# Customer Value Render Task Report

## 修改目的

修正 202607 customer value chain 的 source-backed `member_to_consent` link 在 renderer 只讀 `value` 而顯示 em dash 的問題，並為 short stage keys 提供穩定中文 label。

## 修改檔案

- `js/p3-renderers.js`
  - 新增 `recommendation`、`consent`、`member_consent_joint`、`store_signup` 的中文 label mapping。
  - link 有 `value` 時維持原本顯示；沒有 `value` 但有 `count` 與 `n` 時顯示 `count/n`。
  - 保留 sourceRefs fail-closed gate、partial/unavailable 行為與其他 tab 邊界。
- `scripts/tests/test_p3_provider.mjs`
  - 新增以真實 `data/p3/monthly/202607.json` 驗證 stage labels 與 `9/16` link rendering 的 regression test。

## 驗證命令與結果

- `node --test scripts/tests/test_p3_provider.mjs`：PASS，20/20。
- `python3 scripts/validate_p3.py --all --strict-warnings`：PASS。
- `python3 scripts/validate_month_schema.py --all --strict-warnings`：PASS。
- `python3 scripts/validate_dashboard.py`：PASS。
- `python3 scripts/check_month_consistency.py --all --strict-warnings`：PASS。
- `python3 scripts/check_print_report_static.py`：PASS。
- `python3 scripts/check_screen_layout_static.py`：PASS。
- `node --check app.js`：PASS。
- `node --check js/p3-renderers.js`：PASS。
- `python3 -m json.tool`（manifest 與 202604/202605 JSON）：PASS。
- `git diff --check`：PASS。

## 是否影響核心邊界

否。未修改 data、`app.js`、`index.html`、Obsidian、server、其他 tabs 或 Git cleanup；未放寬 provenance/sourceRefs 驗證。

## Hermes 驗收結果

本受限 task 未修改 Obsidian 或執行額外治理回填；已完成 task scope 內 read-only validation commands，結果均 PASS。

## 後續觀察點

202607 的 `member_to_consent` 現在應顯示 observed `9/16`，而非 em dash；四個 short stage keys 應顯示固定中文 label。

## 是否需要 ADR / Incident

否，這是受限 renderer UX regression 修正，未改變資料 schema 或系統邊界。
