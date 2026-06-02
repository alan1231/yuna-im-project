## 開發模式

啟動可自動重啟的 Python agent：

```bash
python3 dev_agent.py
```

之後修改目前資料夾內的 `.py` 檔時，`dev_agent.py` 會自動停止舊的 `agent.py` 並重新執行。
如果 `agent.py` 因為 MongoDB、套件或查詢錯誤而自己停止，`dev_agent.py` 也會在短暫等待後自動重啟。

## Configuration

`agent.py` reads these environment variables:

| Variable | Default |
| --- | --- |
| `MONGO_URI` | `mongodb://localhost:27017/?directConnection=true` |
| `DATABASE_NAME` | `yuna_chat` |
| `PORT` | `10001` |

The agent watches MongoDB messages sent to `stock_bot` and writes replies into
the same `messages` collection. It also starts a tiny HTTP health server on
`/healthz` so deployment platforms can keep the process running as a web
service.

On startup or reconnect, the agent also scans recent unanswered stock-bot
messages. This handles Render Free sleep: if the bot was asleep when a message
was inserted, waking `/healthz` starts the process and the scan replies to the
missed query.

## Render deployment

Create another Render Web Service from the same GitHub repo:

```text
Branch: main
Root Directory: backend-python
Runtime: Python
Build Command: pip install -r requirements.txt
Start Command: python agent.py
Health Check Path: /healthz
```

Set environment variables:

```text
MONGO_URI=<same MongoDB Atlas URI used by the Go service>
DATABASE_NAME=yuna_chat
```
