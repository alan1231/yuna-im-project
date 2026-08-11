# Mobile API Contract

這份文件給 Flutter mobile app 對接 Go 後端使用。Mobile 端只需要使用者聊天功能，不需要 admin console。

## Base URL

本機開發：

```text
http://localhost:8080
ws://localhost:8080/ws
```

實機手機測試時，`localhost` 要換成電腦在同一個 Wi-Fi 內的 IP，例如：

```text
http://192.168.0.71:8080
ws://192.168.0.71:8080/ws
```

## Auth Model

使用顯示名稱與密碼登入。密碼以 bcrypt 儲存在 MongoDB，登入後的 opaque Session token 儲存在 Redis 30 天。

除註冊、登入與 health 外，HTTP API 都需要：

```http
Authorization: Bearer <session-token>
```

後端只信任 Session 綁定的身份；舊 client 即使傳入 `user_id`，也會被忽略。

既有、尚未設定密碼的帳號不可公開搶先認領。管理員需先設定 `ADMIN_TOKEN`，再呼叫 `POST /admin/users/set-password` 設定初始密碼；聊天資料與 user id 都會保留。

## Common Types

### User

```json
{
  "user_id": "user-123",
  "display_name": "Yuna",
  "created_at": "2026-06-01T09:00:00Z",
  "online": true,
  "last_seen": "2026-06-01T09:00:00Z"
}
```

### Friend

```json
{
  "user_id": "user-123",
  "friend_id": "user-456",
  "display_name": "Elva",
  "created_at": "2026-06-01T09:00:00Z",
  "online": true,
  "last_seen": "2026-06-01T09:00:00Z"
}
```

### Message

MongoDB 訊息目前直接回傳 map，所以 Flutter 端要能容忍額外欄位。

```json
{
  "_id": "...",
  "sender": "Yuna",
  "sender_id": "user-123",
  "recipient_id": "user-456",
  "conversation_id": "dm:user-123:user-456",
  "text": "hello",
  "attachment_url": "data:image/jpeg;base64,...",
  "attachment_name": "photo.jpg",
  "attachment_type": "image/jpeg",
  "attachment_size": 123456,
  "time": "2026-06-01T09:00:00Z",
  "read_at": null
}
```

附件欄位可為空字串。圖片可 inline 顯示；其他檔案建議顯示為檔案連結或下載項目。

## HTTP Endpoints

### Register A New Account

```http
POST /auth/register
Content-Type: application/json
```

```json
{"display_name":"Yuna","password":"at-least-8-characters"}
```

### Login

```http
POST /auth/login
Content-Type: application/json
```

Register 與 login 都回傳：

```json
{
  "token": "opaque-session-token",
  "user": {"user_id":"user-123","display_name":"Yuna"}
}
```

密碼長度為 8–72 bytes。另有 `GET /auth/me` 驗證目前 Session、`POST /auth/logout` 刪除 Session。

### Set Initial Password For A Legacy Account (Admin)

```http
POST /admin/users/set-password
X-Admin-Token: <admin-token>
Content-Type: application/json
```

```json
{"user_id":"existing-user-id","password":"initial-password"}
```

此端點在 `ADMIN_TOKEN` 未設定時會停用。設定後，使用者即可從一般 login 登入。

### List Users

```http
GET /users
Authorization: Bearer <session-token>
```

Response:

```json
[
  {
    "user_id": "user-456",
    "display_name": "Elva",
    "created_at": "2026-06-01T09:00:00Z",
    "online": true,
    "last_seen": "2026-06-01T09:00:00Z"
  }
]
```

Notes:

- 後端依 Session 排除目前使用者。

### List Friends

```http
GET /friends
```

Response:

```json
[
  {
    "user_id": "user-123",
    "friend_id": "user-456",
    "display_name": "Elva",
    "created_at": "2026-06-01T09:00:00Z",
    "online": true,
    "last_seen": "2026-06-01T09:00:00Z"
  }
]
```

### Create Friend Request

```http
POST /friends
Content-Type: application/json
```

Request:

```json
{
  "user_id": "user-123",
  "display_name": "Elva"
}
```

Response:

```json
{
  "request_id": "fr_123",
  "from_user_id": "user-123",
  "from_display_name": "Yuna",
  "to_user_id": "user-456",
  "to_display_name": "Elva",
  "status": "pending",
  "created_at": "2026-06-01T09:00:00Z"
}
```

### List Pending Friend Requests

```http
GET /friend-requests
```

Response:

```json
[
  {
    "request_id": "fr_123",
    "from_user_id": "user-456",
    "from_display_name": "Elva",
    "to_user_id": "user-123",
    "to_display_name": "Yuna",
    "status": "pending",
    "created_at": "2026-06-01T09:00:00Z"
  }
]
```

### Respond To Friend Request

```http
POST /friend-requests
Content-Type: application/json
```

Request:

```json
{
  "user_id": "user-123",
  "request_id": "fr_123",
  "accept": true
}
```

Response:

```json
{
  "status": "accepted"
}
```

If `accept` is `false`, response status will be `rejected`.

### List Conversations

```http
GET /conversations
```

Response:

```json
[
  {
    "conversation_id": "dm:user-123:user-456",
    "recipient_id": "user-456",
    "display_name": "Elva",
    "last_message": "hello",
    "last_message_at": "2026-06-01T09:00:00Z",
    "last_message_sender_id": "user-123",
    "last_message_read_at": null,
    "is_friend": true,
    "unread_count": 0
  }
]
```

### List Messages

```http
GET /messages?conversation_id=dm:user-123:user-456
```

Response:

```json
[
  {
    "sender": "Yuna",
    "sender_id": "user-123",
    "recipient_id": "user-456",
    "conversation_id": "dm:user-123:user-456",
    "text": "hello",
    "attachment_url": "",
    "attachment_name": "",
    "attachment_type": "",
    "attachment_size": 0,
    "time": "2026-06-01T09:00:00Z",
    "read_at": null
  }
]
```

Notes:

- 後端會確認 `conversation_id` 包含 Session 使用者。
- 呼叫後會把該 conversation 內收給目前使用者的未讀訊息標記為已讀。
- 目前最多回最近 100 筆。

## WebSocket

### Connect

```text
ws://localhost:8080/ws?ticket=<one-time-ticket>&conversation_id=dm:user-123:user-456
```

Query:

- `ticket`: 先以 Bearer Session 呼叫 `POST /auth/ws-ticket` 取得；60 秒內有效且只能使用一次。
- `conversation_id`: 初始開啟的 conversation id。

### Send Active Conversation

切換聊天室時送出：

```json
{
  "type": "active_conversation",
  "conversation_id": "dm:user-123:user-456"
}
```

後端會更新此 WebSocket client 的 active conversation，並標記該 conversation 為已讀。

### Send Message

```json
{
  "sender": "Yuna",
  "sender_id": "user-123",
  "recipient_id": "user-456",
  "conversation_id": "dm:user-123:user-456",
  "text": "hello",
  "attachment_url": "",
  "attachment_name": "",
  "attachment_type": "",
  "attachment_size": 0
}
```

Notes:

- Go 後端會以一次性 ticket 綁定的使用者當真正 sender。
- Go 後端會用 `recipient_id` 重新計算 `conversation_id`。
- Flutter 端仍可送 `conversation_id`，但不要依賴它作為權限依據。

### Receive Event

後端推送格式：

```json
{
  "type": "message",
  "payload": {}
}
```

Event types:

- `message`: 新訊息或 bot 回覆。
- `read_receipt`: 已讀狀態更新。
- `friend_request`: 收到好友邀請。
- `friend_added`: 好友邀請被接受後新增好友。

### Message Event Payload

```json
{
  "sender": "Yuna",
  "sender_id": "user-123",
  "recipient_id": "user-456",
  "conversation_id": "dm:user-123:user-456",
  "text": "hello",
  "attachment_url": "",
  "attachment_name": "",
  "attachment_type": "",
  "attachment_size": 0,
  "time": "2026-06-01T09:00:00Z",
  "read_at": null
}
```

### Read Receipt Payload

Same shape as message payload, but `read_at` should be non-null.

### Friend Request Payload

Same shape as `friendRequestResponse`.

### Friend Added Payload

Same shape as `friendResponse`.

## Flutter Implementation Notes

- Use one WebSocket connection per logged-in mobile user.
- Do not reconnect WebSocket on every room switch; send `active_conversation` instead.
- Keep a local message cache with a bounded size, similar to React.
- Compress large images before sending because attachments are currently data URLs.
- Treat all date/time strings as ISO 8601.
- Be tolerant of unknown fields in message payloads.
- Do not implement admin routes in mobile.
