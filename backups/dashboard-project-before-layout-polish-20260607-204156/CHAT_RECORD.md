# 儀表板專案對話記錄

記錄日期：2026-05-31

## 專案目標

將原本的單體 HTML 儀表板拆分成可維護、可遷移的前後端分離結構，同時保留原版頁面的佈局、樣式、圖表互動、Drill-down、CSV 匯出等功能。

目標目錄：

```text
dashboard-project/
├── index.html
├── app.js
├── serve.py
├── start-dashboard.bat
├── start-dashboard.command
├── start-dashboard.sh
├── README_START.md
├── CHAT_RECORD.md
└── data/
    └── 202604.json
```

## 已完成事項

1. 已將原始單體檔 `dashbord.html` 拆分成三個核心檔案：

```text
index.html
app.js
data/202604.json
```

2. `index.html` 保留原本 HTML 結構與 CSS，只把尾部內嵌 `<script>` 改成外部引用：

```html
<script src="app.js"></script>
```

3. `app.js` 保留 Chart.js 設定、互動邏輯、formatter、動態配色、Drill-down、CSV 匯出和 DOM 渲染器。

4. `data/202604.json` 只保留純資料，不包含 JS function、formatter、onClick 或動態配色函數。

5. 已實作 async/await 載入流程：

```text
DOM 載入
bootApp()
顯示 loading overlay
fetch data/YYYYMM.json
寫入全域 DataStore
註冊 ChartDataLabels
設定 Chart 預設值
DashboardApp.init()
隱藏 loading overlay
```

6. `changeMonth(monthVal)` 已改成 async fetch 流程，可根據月份載入對應 JSON，例如：

```text
data/202604.json
```

7. 已保留 `topDestChart` 的 Drill-down 功能，點擊熱門目的地長條圖可篩選 `satisfactionCrossChart`。

8. 已保留 `npsCorrelationChart` 散點圖中的動態背景色函數與 datalabel formatter，並放在 `app.js` 而不是 JSON。

9. 已保留並使用 XSS 安全過濾函數 `escapeHTML()`。

10. 已新增可攜式跨平台啟動器：

```text
serve.py
start-dashboard.bat
start-dashboard.command
start-dashboard.sh
```

11. 已把啟動說明翻譯成中文，放在：

```text
README_START.md
```

12. 已建立備份資料夾：

```text
dashboard-project-backup-20260530-122044
```

## 為什麼不能直接用 file:// 開啟

拆分後的儀表板會透過：

```js
fetch('./data/202604.json')
```

讀取 JSON 資料。

如果直接雙擊 `index.html`，瀏覽器會用類似以下網址開啟：

```text
file:///.../dashboard-project/index.html
```

在 `file://` 模式下，瀏覽器通常會限制本地檔案讀取，所以 `fetch()` 可能會失敗，畫面會出現 `failed to fetch`。

因此需要透過本地 HTTP server 開啟，例如：

```text
http://127.0.0.1:8080/index.html
```

## Windows 使用方式

在 Windows 上，進入 `dashboard-project` 資料夾，雙擊：

```bat
start-dashboard.bat
```

啟動器會：

1. 從目前資料夾啟動本地 HTTP server。
2. 自動打開瀏覽器。
3. 預設使用 `8080` 端口。
4. 如果 `8080` 被占用，會自動嘗試下一個可用端口。

使用期間請保持終端機視窗開著。

停止伺服器時，在終端機視窗按：

```text
Ctrl+C
```

## macOS 使用方式

把整個 `dashboard-project` 資料夾搬到 Mac 後，第一次使用建議在 Terminal 執行：

```sh
cd /path/to/dashboard-project
chmod +x start-dashboard.command start-dashboard.sh
```

之後可以雙擊：

```sh
start-dashboard.command
```

或在 Terminal 執行：

```sh
./start-dashboard.sh
```

Mac 端需要有 Python 3。可以用以下指令檢查：

```sh
python3 --version
```

如果沒有 Python 3，需要先安裝。

## 可遷移方案討論

曾討論兩種做法：

1. 保留資料分離，使用本地 HTTP server 啟動。
2. 改成 `file://` 可直接開啟。

最後選擇第 1 種，原因是：

```text
保留 index.html / app.js / data/*.json 的清晰分離
方便未來增加多月份 JSON
不需要把資料重新塞回 HTML
跨 Windows 和 macOS 都可以用
```

第 2 種雖然可以直接雙擊 HTML，但通常需要犧牲資料分離，例如把 JSON 內嵌回 JS 或 HTML，不適合後續維護。

## 同步到 Mac 的建議

最簡單做法：

```text
把整個 dashboard-project 資料夾壓縮
傳到 Mac
解壓縮
執行 start-dashboard.command 或 start-dashboard.sh
```

注意：只壓縮 `index.html` 不夠，必須整個資料夾一起搬走，因為 `app.js`、`data/202604.json`、啟動器檔案都需要一起存在。

長期維護建議：

```text
使用 Git / GitHub / GitLab 同步
```

這樣 Windows 改完後可以 push，Mac 端 pull，就不容易出現版本混亂。

## 關於目前聊天記錄

單純壓縮 `dashboard-project` 只會帶走儀表板專案，不會帶走 Codex App 裡的聊天上下文。

因此已新增本檔案：

```text
CHAT_RECORD.md
```

壓縮整個 `dashboard-project` 時，這份對話紀錄會一起被帶到 Mac。

## 目前仍需注意

目前頁面中的 Tailwind、Chart.js、ChartDataLabels、Font Awesome 仍然透過 CDN 載入。

也就是說：

```text
本地 JSON 和儀表板程式碼已可攜
但完整視覺和圖表渲染仍需要能連到 CDN
```

如果之後想做到完全離線可用，需要再把這些外部依賴下載到本地，並改寫 `index.html` 的引用路徑。
