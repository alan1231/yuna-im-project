# Neon Ghost Project

Neon Ghost 是一個本機/demo 即時聊天專案，使用 React、Go、MongoDB、Redis 組成。

## 快速啟動

先啟動 MongoDB 和 Redis：

```bash
docker compose up -d
```

再啟動 Go 和 React：

```bash
./scripts/dev.sh
```

啟動後：

- 前端：`http://localhost:5173/`
- Go API/WebSocket：`http://localhost:8080`

按 `Ctrl+C` 可停止 `./scripts/dev.sh` 啟動的服務。

## 架構總覽

- `frontend-react`：React 前端，包含帳號建立、聊天、好友、管理台。
- `backend-go`：HTTP API、WebSocket、MongoDB Change Stream hub、Redis 在線狀態。
- MongoDB：儲存 users、messages、friends、friend_requests。
- Redis：儲存短生命週期的在線狀態和連線數。

## 重要規則

- MongoDB 必須以 replica set 模式執行，Change Stream 才會正常運作。
- 一般聊天支援檔案附件；圖片可 inline 顯示並點擊放大。
- 附件目前以 data URL 存入 MongoDB，大小限制保守設定為 2 MB。
- 超過 2 MB 的圖片會在前端嘗試自動壓縮；非圖片檔案不會自動壓縮。
- 前端訊息快取有上限，避免長時間使用時記憶體無限增加。
- 後端使用 shared MongoDB Change Stream hub，避免每條 WebSocket 都開一條 watcher。

## 工程上下文

更細的工程脈絡與設計決策在這些文件：

- [Current project status](PROJECT_STATUS.md)
- [Project context](PROJECT_CONTEXT.md)
- [Go chat backend context](backend-go/internal/chat/README.md)
- [React frontend](frontend-react/README.md)

## 分支與部署

- `main`：雲端部署分支，Vercel 從這個分支部署前端與 Go API。
- `dev`：本地開發與測試分支。

之後的修改都先從 `dev` 開始。開始前先把 `main` 同步到 `dev`，本機測試通過後才合併到 `main`，再 push `main` 觸發雲端部署：

```bash
git checkout dev
git merge main
# 修改並測試
git add .
git commit -m "Describe the change"
git push origin dev

git checkout main
git merge dev
git push origin main
```
