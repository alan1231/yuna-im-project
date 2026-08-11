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

MongoDB stores durable chat data and bcrypt password hashes. Redis stores presence, 30-day login sessions, and one-time WebSocket tickets.

User APIs require `Authorization: Bearer <session-token>`. Accounts use `POST /auth/register` and `POST /auth/login`; WebSocket clients obtain a 60-second one-time ticket from `POST /auth/ws-ticket` before connecting.

Legacy accounts without passwords must be migrated by an administrator through `POST /admin/users/set-password`; this endpoint is disabled unless `ADMIN_TOKEN` is configured.

When `ADMIN_TOKEN` is set, admin APIs require either `X-Admin-Token: <token>` or `Authorization: Bearer <token>`.

## Admin APIs

```text
GET /admin/stats
GET /admin/users?limit=100&q=yuna&online=true
```

## Development

```bash
go run .
go test ./...
```
