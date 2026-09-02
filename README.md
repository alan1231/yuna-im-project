# Neon Ghost Project

Neon Ghost 是一個即時聊天（IM）專案，由 React 前端、Go 後端、MongoDB、Redis 組成，提供一對一聊天、群組聊天、語音／視訊通話與內建小遊戲，並附一個完善的後台管理介面。

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

```text
React (Vite) 前端
  ├─ HTTP API      → Go 後端
  └─ WebSocket     → Go 後端
                        │
                        ├─ MongoDB  持久資料（replica set，供 Change Stream 使用）
                        └─ Redis    在線狀態、session、即時 signaling、小遊戲狀態
```

- `frontend-react`：React（Vite + Tailwind）前端，負責帳號、聊天、好友、群組、語音／視訊、小遊戲與管理台。
- `backend-go`：Go HTTP API、WebSocket、共享 MongoDB Change Stream hub、Redis 在線狀態與管理端點。
- MongoDB：儲存 `users`、`messages`、`friends`、`friend_requests`、`groups`、`deleted_conversations`、`admins`。
- Redis：儲存短生命週期狀態，包括在線狀態、30 天登入 session、一次性 WebSocket ticket、語音／視訊 signaling、21 點小遊戲。

## 功能清單

### 帳號與驗證

- 註冊／登入／登出，密碼以 bcrypt 雜湊儲存。
- 登入 session 存於 Redis（30 天效期），API 使用 `Authorization: Bearer <token>`。
- WebSocket 連線需先取得 60 秒一次性 ticket（`/auth/ws-ticket`）。

### 一對一聊天

- 即時收發訊息（WebSocket + MongoDB Change Stream 廣播）。
- 好友邀請流程：送出邀請 → 待處理清單 → 接受／拒絕 → 建立好友關係。
- 可刪除好友、刪除對話（僅從自己視角隱藏，記錄於 `deleted_conversations`）。
- 歷史訊息（最近 100 筆）、已讀回執、未讀計數。
- 檔案附件以 data URL 存入 MongoDB，大小上限 2 MB；超過 2 MB 的圖片會在前端自動壓縮。

### 群組聊天

- 建立群組（至少一位成員）、即時收到「被邀請進群」通知。
- 群組內成員可互相收發訊息，成員名單與發送者名稱皆會顯示。
- 已讀／未讀以 `read_by` 陣列追蹤。
- 可退出群組；非成員無法存取群組內容（後端授權檢查）。
- 語音／視訊通話與 21 點遊戲目前僅限一對一，群組內停用。

### 語音／視訊通話

- 一對一 WebRTC 通話，signaling 透過 Redis Pub/Sub 轉發。
- 支援來電、拒接、掛斷與 ICE candidate。

### 21 點小遊戲

- 一對一 21 點對戰，牌局狀態存於 Redis。
- 邀請、接受／拒絕、回合制操作，支援逾時與恢復進行中的牌局。

### 管理台

- 管理員帳號首次以 `ADMIN_TOKEN` 環境變數做一次性引導建立（`/admin/setup`）。
- 登入後以 `X-Admin-Token` 或 `Authorization: Bearer` 存取：
  - `GET /admin/stats`：使用者、在線、訊息、好友、邀請等統計。
  - `GET /admin/users`：搜尋、篩選在線、分頁。
  - `POST /admin/users/set-password`：為舊版無密碼帳號設定密碼。
  - 刪除使用者（管理者權限）。

### 介面與體驗

- 中／英雙語（i18n）與語言切換。
- 行動裝置啟動畫面、防止縮放與白底鍵盤。
- 區域網路 QR Code 分享（Lan URL）。

## 重要規則

- MongoDB 必須以 replica set 模式執行，Change Stream 才會正常運作。
- 後端使用單一共享 MongoDB Change Stream hub，避免每條 WebSocket 各開一條 watcher。
- `conversation_id` 一律由後端重新計算（`conversationIDFor`／`groupConversationID`），不信任客戶端提供的值。
- 前端訊息快取有上限，避免長時間使用時記憶體無限增加。
- 附件目前以 data URL 存入 MongoDB，大小限制保守設定為 2 MB。

## API 端點總覽

| Method | Path | 說明 |
| --- | --- | --- |
| POST | `/auth/register` | 註冊帳號 |
| POST | `/auth/login` | 登入 |
| POST | `/auth/logout` | 登出 |
| GET | `/auth/me` | 取得目前使用者 |
| POST | `/auth/ws-ticket` | 取得一次性 WebSocket ticket |
| GET | `/ws?ticket=...&conversation_id=...` | WebSocket 即時通訊 |
| GET | `/users` | 使用者清單 |
| GET/POST | `/friends` | 好友清單／送出邀請 |
| POST | `/friends/delete` | 刪除好友 |
| GET/POST | `/friend-requests` | 待處理邀請／回應邀請 |
| GET/POST | `/groups` | 群組清單／建立群組 |
| POST | `/groups/leave` | 退出群組 |
| GET | `/messages?conversation_id=...` | 歷史訊息 |
| GET | `/conversations` | 對話清單（含群組與未讀數）|
| POST | `/conversations/delete` | 刪除對話（僅自己視角）|
| GET | `/health` | 健康檢查 |

## 工程上下文

更細的工程脈絡與設計決策在這些文件：

- [Current project status](PROJECT_STATUS.md)
- [Project context](PROJECT_CONTEXT.md)
- [Go chat backend context](backend-go/internal/chat/README.md)
- [Go backend configuration](backend-go/README.md)
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

雲端部署：前端與 Go API 都在 Vercel，資料庫使用 MongoDB Atlas，Redis 使用 Upstash（TLS）。