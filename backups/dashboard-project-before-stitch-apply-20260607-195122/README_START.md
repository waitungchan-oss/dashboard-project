# 可攜式儀表板啟動器

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
