## 修改目的

修正 legacy month `202604` 在缺少 canonical `npsCorrelationData` 時，`app.js` 仍用 hard-coded Key Driver fallback 建出假散點、假排名與假明細的問題。依 spec 改為 unavailable state，避免 fabricated business data 進入 ranked-list path。

## 修改檔案

- `app.js`
- `scripts/tests/test_p2_ux_contract.py`

## 實作摘要

- 移除 `DataStore.npsCorrelationData` 缺失時的 hard-coded fallback points。
- 新增 Key Driver unavailable/reset path：
  - 清空 `npsDriverRankedPoints`
  - 重設 `npsDriverIndexByName`
  - 清空 `npsSelectedDriverName`
  - 在 chart container / list / detail / legend 顯示「此月份沒有可用驅動因素資料」
- 保留 `canvas#npsCorrelationChart` contract；缺資料時仍初始化空 scatter chart，但停用 crosshair / datalabel interaction，避免 stale/fake chart state。
- 保留 canonical months 的既有 ranking、selection、tooltip 與 recommendation correlation detail。
- 補 focused contract tests，防止 fabricated fallback 再次回到 ranked-list path。

## 驗證命令與結果

- `python3 -m unittest scripts.tests.test_p2_ux_contract.P2UxContractTests.test_key_driver_does_not_fabricate_fallback_points scripts.tests.test_p2_ux_contract.P2UxContractTests.test_key_driver_has_unavailable_state_for_missing_legacy_data -v`
  - PASS
- `python3 -m unittest scripts.tests.test_p2_ux_contract -v`
  - PASS (7 tests)
- `node --check app.js`
  - PASS

## Scope / Boundary

- 未修改 `data/*.json`
- 未修改其他 tab behavior
- 未修改 `index.html`
- 僅處理 Key Driver legacy missing-data canonical-data issue 與相關 focused tests

## 風險與觀察點

- 本次未做 browser/Hermes read-only 驗收；目前依 focused contract tests 與 syntax check 確認。
- unavailable notice 透過 `app.js` 動態插入 chart container，後續若調整 `#nps_zone` layout，需保留 `canvas#npsCorrelationChart` 的 parent container 可承接 overlay。
