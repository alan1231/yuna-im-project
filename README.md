# Yuna IM Project

Yuna IM 是一個本機/demo 即時聊天專案，使用 Vue、Go、MongoDB、Redis 和 Python 股票機器人組成。

## 快速啟動

先啟動 MongoDB 和 Redis：

```bash
docker compose up -d
```

再啟動 Go、Vue 和 Python 股票機器人：

```bash
./scripts/dev.sh
```

啟動後：

- 前端：`http://localhost:5173/`
- Go API/WebSocket：`http://localhost:8080`

按 `Ctrl+C` 可停止 `./scripts/dev.sh` 啟動的服務。

## 架構總覽

- `frontend-vue`：Vue 3 前端，包含帳號建立、聊天、好友、管理台。
- `mobile-flutter`：Flutter mobile app，使用者端聊天，不包含後台管理。
- `backend-go`：HTTP API、WebSocket、MongoDB Change Stream hub、Redis 在線狀態。
- `backend-python`：股票機器人，監聽 MongoDB 訊息並寫入回覆。
- MongoDB：儲存 users、messages、friends、friend_requests。
- Redis：儲存短生命週期的在線狀態和連線數。

## 重要規則

- MongoDB 必須以 replica set 模式執行，Change Stream 才會正常運作。
- 股票機器人聊天室只支援文字指令，不支援檔案附件。
- 一般聊天支援檔案附件；圖片可 inline 顯示並點擊放大。
- 附件目前以 data URL 存入 MongoDB，大小限制保守設定為 2 MB。
- 超過 2 MB 的圖片會在前端嘗試自動壓縮；非圖片檔案不會自動壓縮。
- 前端訊息快取有上限，避免長時間使用時記憶體無限增加。
- 後端使用 shared MongoDB Change Stream hub，避免每條 WebSocket 都開一條 watcher。

## 工程上下文

更細的工程脈絡與設計決策在這些文件：

- [Current project status](PROJECT_STATUS.md)
- [Project context](PROJECT_CONTEXT.md)
- [Mobile API contract](docs/API_CONTRACT.md)
- [Go chat backend context](backend-go/internal/chat/README.md)
- [Vue composables context](frontend-vue/src/composables/README.md)
- [Architecture decisions](docs/decisions)

## 分支與部署

- `main`：雲端部署分支，Render 和 Vercel 從這個分支部署。
- `dev`：本地開發與測試分支。

平常在 `dev` 修改；本機測試通過後合併到 `main`，再 push `main` 觸發雲端部署。

## Flutter Mobile

Mobile app 位於 `mobile-flutter/`。目前是使用者端聊天初版，支援：

- 建立/登入使用者
- 股票機器人聊天室
- 好友/對話列表載入
- 歷史訊息載入
- WebSocket 即時文字訊息

本機模擬器執行：

```bash
cd mobile-flutter
flutter run
```

若在實機手機測試，請把 API host 指到電腦在同一個 Wi-Fi 內的 IP：

```bash
flutter run --dart-define=API_HOST=192.168.0.71
```
