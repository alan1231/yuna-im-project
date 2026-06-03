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
| `STOCK_BOT_HEALTH_URL` | empty |

MongoDB stores durable chat data. Redis stores short-lived presence state such as online keys and per-user WebSocket connection counts.

When `ADMIN_TOKEN` is set, admin APIs require either `X-Admin-Token: <token>` or `Authorization: Bearer <token>`.

When `STOCK_BOT_HEALTH_URL` is set, user list/create requests and messages sent
to `stock_bot` trigger a throttled background HTTP request to that URL. In the
Render MVP deployment this wakes the Python stock bot, for example
`https://python-ai-nqi6.onrender.com/healthz`.

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
