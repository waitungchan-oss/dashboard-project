# 可攜式儀表板啟動器

更新日期：2026-07-03

這個資料夾被設計成可以整包搬移到另一台電腦上使用。

## Windows

直接雙擊：

```bat
start-dashboard.bat
```

## macOS

直接雙擊：

```sh
start-dashboard.command
```

如果 macOS 顯示檔案沒有執行權限，請先在 Terminal 執行一次：

```sh
chmod +x start-dashboard.command start-dashboard.sh
```

然後再雙擊 `start-dashboard.command`。

## 運作方式

啟動器會先從這個資料夾開一個本地 HTTP server，接著自動用瀏覽器打開儀表板。這是必要的，因為儀表板會透過 `fetch()` 讀取 `data/` 內的 JSON 資料。

預設埠號是 `8080`。如果這個埠被占用，啟動器會自動改試下一個可用埠號。

使用儀表板時請保持終端機視窗開著。要停止伺服器時，請在那個視窗按 `Ctrl+C`。

## 正式驗收

請用本地 HTTP URL 驗收，不要用 `file://`。目前常用 URL 是：

```text
http://127.0.0.1:8080/index.html
```

如果 `8080` 被占用，`serve.py` 會自動改用下一個可用 port，請以終端機輸出的 URL 為準。

## PDF 匯出

頁面右上方有「列印 PDF」按鈕。PDF 匯出會走專用列印模式：

```text
DashboardApp.printReport()
#printReport
body.print-mode
.print-page
```

如果要驗收 PDF，請先確認一般 dashboard 正常，再點擊「列印 PDF」。不要在 `file://` 模式下測試 PDF，因為資料與圖表都依賴 HTTP `fetch()` 載入。

## 維護檢查

修改資料或程式後，建議執行：

```sh
python3 scripts/validate_dashboard.py
python3 scripts/check_print_report_static.py
python3 scripts/check_screen_layout_static.py
node --check app.js
```
