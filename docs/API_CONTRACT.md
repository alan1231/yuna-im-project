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

目前是 demo 模式，身份由 client 傳 `user_id` 表示。

正式產品化前需要改成 login/session/JWT，不能信任 client 自行帶入的 `user_id`。

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

### Create Or Update User

```http
POST /users
Content-Type: application/json
```

Request:

```json
{
  "user_id": "user-123",
  "display_name": "Yuna"
}
```

Response:

```json
{
  "user_id": "user-123",
  "display_name": "Yuna",
  "created_at": "2026-06-01T09:00:00Z",
  "online": false,
  "last_seen": "2026-06-01T09:00:00Z"
}
```

Notes:

- `display_name` 不可空白。
- `display_name` 最多 32 個字元。
- 重複名稱會回 `409 Conflict`。

### List Users

```http
GET /users?user_id=user-123
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

- `user_id` query 可選。
- 有帶 `user_id` 時，後端會排除自己。

### List Friends

```http
GET /friends?user_id=user-123
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
GET /friend-requests?user_id=user-123
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
GET /conversations?user_id=user-123
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
GET /messages?user_id=user-123&conversation_id=dm:user-123:user-456
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

- 後端會確認 `conversation_id` 包含 `user_id`。
- 呼叫後會把該 conversation 內收給 `user_id` 的未讀訊息標記為已讀。
- 目前最多回最近 100 筆。

## WebSocket

### Connect

```text
ws://localhost:8080/ws?user_id=user-123&conversation_id=dm:user-123:user-456
```

Query:

- `user_id`: 目前使用者 id。
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

- Go 後端會以 WebSocket query 的 `user_id` 當真正 sender。
- Go 後端會用 `recipient_id` 重新計算 `conversation_id`。
- Flutter 端仍可送 `conversation_id`，但不要依賴它作為權限依據。
- 行情小幫手聊天室請只送文字，不要送附件。

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
