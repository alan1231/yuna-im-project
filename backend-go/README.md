# Go Backend

## Configuration

The server reads these environment variables and falls back to local development defaults:

| Variable | Default |
| --- | --- |
| `MONGO_URI` | `mongodb://localhost:27017/?directConnection=true` |
| `REDIS_ADDR` | `localhost:6379` |
| `REDIS_PASSWORD` | empty |
| `DATABASE_NAME` | `yuna_chat` |
| `SERVER_ADDR` | `:8080` |
| `ALLOWED_ORIGINS` | `*` |
| `ADMIN_TOKEN` | empty |

MongoDB stores durable chat data and bcrypt password hashes. Redis stores presence, 30-day login sessions, one-time WebSocket tickets, voice/video signaling relay, and blackjack game state.

User APIs require `Authorization: Bearer <session-token>`. Accounts use `POST /auth/register` and `POST /auth/login`; WebSocket clients obtain a 60-second one-time ticket from `POST /auth/ws-ticket` before connecting.

Chat endpoints include friends and friend requests, groups (create/list/leave), messages, conversations, conversation deletion, and generated avatar profiles. Group messages fan out to every member over the shared Change Stream hub, and group membership is authorized server-side.

Avatar profiles use DiceBear-generated URLs. Authenticated clients can update their avatar with:

```text
POST /auth/avatar
Content-Type: application/json
Authorization: Bearer <session-token>

{"avatar_url":"https://api.dicebear.com/9.x/personas/svg?seed=user-123"}
```

The server only accepts DiceBear URLs, stores the URL in the user document, and includes `avatar_url` in user, friend, and conversation responses.

Legacy accounts without passwords must be migrated by an administrator through `POST /admin/users/set-password`; this endpoint requires an admin session token.

## Admin APIs

Admins authenticate with username + password stored in the MongoDB `admins` collection:

- `POST /admin/setup` — create the first admin account, gated by the `ADMIN_TOKEN` env value (`201` on success).
- `POST /admin/login` — sign in with admin username + password, returns a fresh token stored in the `admins` document.
- `POST /admin/logout` — removes the stored admin token (`204`).

After signing in, every admin call sends the returned value via `X-Admin-Token` or `Authorization: Bearer`:

```text
POST /admin/users/set-password
GET /admin/stats
GET /admin/users?limit=100&q=yuna&online=true
DELETE /admin/users?user_id=<id>
```

The `ADMIN_TOKEN` env value is only needed for the one-time `/admin/setup` bootstrap, not for daily use.

## Development

```bash
go run .
go test ./...
```
